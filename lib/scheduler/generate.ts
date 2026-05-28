import type { Employee, ShiftLog } from "@/lib/db/schema";
import { rankByFairness, type EmployeeWithScore, type ShiftType, type DayType } from "./fairness";

export type DaySchedule = {
  date: string;
  dayType: DayType;
  dayLabel: string;
  holidayName?: string;
  slots: { shiftType: ShiftType; employeeId: number; employeeName: string }[];
  offEmployees: { employeeId: number; employeeName: string }[];
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_OFF_PER_DAY = 4;
const OFF_DAYS_PER_EMPLOYEE = 2;

export type HolidayInput = string | { date: string; localName?: string; name?: string };

type WeekDay = { date: string; dayLabel: string; dayType: DayType; holidayName?: string };

function normalizeHolidayMap(holidays: HolidayInput[]): Record<string, string> {
  return Object.fromEntries(
    holidays.map((holiday) => {
      if (typeof holiday === "string") return [holiday, "공휴일"];
      return [holiday.date, holiday.localName ?? holiday.name ?? "공휴일"];
    })
  );
}

function buildWeekDays(weekStart: Date, holidays: HolidayInput[]): WeekDay[] {
  const holidayMap = normalizeHolidayMap(holidays);
  const days: WeekDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const date = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const holidayName = holidayMap[date];
    const dayType: DayType = holidayName
      ? "holiday"
      : dow === 0 || dow === 6
      ? "weekend"
      : "weekday";
    days.push({ date, dayLabel: DAY_LABELS[dow], dayType, holidayName });
  }
  return days;
}

function prefScore(pref: string): number {
  return pref === "like" ? 2 : pref === "neutral" ? 1 : 0;
}

function getShiftPreferenceOrder(emp: Employee): ("open" | "middle" | "close")[] {
  return [
    { s: "open" as const, score: prefScore(emp.openPreference) },
    { s: "middle" as const, score: prefScore(emp.middlePreference) },
    { s: "close" as const, score: prefScore(emp.closePreference) },
  ]
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

// 공정성 순으로 정렬된 직원들을 오픈/미들/마감에 배분 (휴무 제외 전원 투입)
function assignShifts(rankedWorkers: EmployeeWithScore[]): DaySchedule["slots"] {
  const W = rankedWorkers.length;
  if (W === 0) return [];

  const extra = W % 3;
  const base = Math.floor(W / 3);
  // 나머지 인원: 미들에 먼저, 그 다음 오픈에 배분
  const cap = {
    open: base + (extra >= 2 ? 1 : 0),
    middle: base + (extra >= 1 ? 1 : 0),
    close: base,
  };

  const slots: DaySchedule["slots"] = [];

  for (const emp of rankedWorkers) {
    const prefOrder = getShiftPreferenceOrder(emp);
    let assigned = false;

    for (const shift of prefOrder) {
      if (cap[shift] > 0) {
        slots.push({ shiftType: shift, employeeId: emp.id, employeeName: emp.name });
        cap[shift]--;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      for (const shift of ["open", "middle", "close"] as const) {
        if (cap[shift] > 0) {
          slots.push({ shiftType: shift, employeeId: emp.id, employeeName: emp.name });
          cap[shift]--;
          break;
        }
      }
    }
  }

  return slots;
}

// 직원별 최대 이틀 휴무 배정: 일별 휴무 상한 안에서 좋은 날(주말/공휴일)을 우선 선택
function assignOffDays(
  employees: Employee[],
  weekDays: WeekDay[],
  logs: ShiftLog[]
): Record<number, string[]> {
  const offCount: Record<string, number> = {};
  weekDays.forEach((d) => {
    offCount[d.date] = 0;
  });

  const result: Record<number, string[]> = {};
  employees.forEach((e) => {
    result[e.id] = [];
  });

  const ranked = rankByFairness(employees, logs);

  for (let round = 0; round < OFF_DAYS_PER_EMPLOYEE; round++) {
    for (const emp of ranked) {
      const picked = result[emp.id];
      if (picked.length > round) continue;

      const day = weekDays
        .filter((d) => offCount[d.date] < MAX_OFF_PER_DAY && !picked.includes(d.date))
        .sort((a, b) => {
          const isAdjacent = (date: string) =>
            picked.some((pickedDate) => Math.abs(new Date(date).getTime() - new Date(pickedDate).getTime()) === 86400000);
          const dayRank = (d: WeekDay) => (d.dayType === "holiday" ? 2 : d.dayType === "weekend" ? 1 : 0);
          const adjacentDiff = Number(isAdjacent(a.date)) - Number(isAdjacent(b.date));
          if (adjacentDiff !== 0) return adjacentDiff;
          return dayRank(b) - dayRank(a);
        })[0];
      if (!day) continue;

      picked.push(day.date);
      offCount[day.date]++;
    }
  }

  return result;
}

export function generateWeekSchedule(
  weekStart: Date,
  employees: Employee[],
  pastLogs: ShiftLog[],
  holidays: HolidayInput[] = []
): DaySchedule[] {
  const weekDays = buildWeekDays(weekStart, holidays);
  const workingLogs: ShiftLog[] = [...pastLogs];
  let nextId = 100000;

  // 1단계: 직원별 최대 이틀 휴무 배정 (공평 점수 높은 순으로 좋은 날 우선)
  const offDayMap = assignOffDays(employees, weekDays, workingLogs);

  // 휴무 로그를 workingLogs에 반영 (이후 점수 계산에 사용)
  for (const emp of employees) {
    for (const offDate of offDayMap[emp.id] ?? []) {
      const day = weekDays.find((d) => d.date === offDate)!;
      workingLogs.push({
        id: nextId++,
        employeeId: emp.id,
        date: offDate,
        shiftType: "off",
        dayType: day.dayType,
        weekLabel: "",
        isConfirmed: false,
        createdAt: null,
      });
    }
  }

  // 2단계: 각 날짜별 근무 배정 (휴무 제외 전원 오픈/미들/마감 투입)
  return weekDays.map((day) => {
    const offIds = new Set(
      employees
        .filter((e) => (offDayMap[e.id] ?? []).includes(day.date))
        .map((e) => e.id)
    );
    const workingEmps = employees.filter((e) => !offIds.has(e.id));
    const offEmps = employees.filter((e) => offIds.has(e.id));

    const ranked = rankByFairness(workingEmps, workingLogs);
    const slots = assignShifts(ranked);

    for (const slot of slots) {
      workingLogs.push({
        id: nextId++,
        employeeId: slot.employeeId,
        date: day.date,
        shiftType: slot.shiftType,
        dayType: day.dayType,
        weekLabel: "",
        isConfirmed: false,
        createdAt: null,
      });
    }

    return {
      date: day.date,
      dayType: day.dayType,
      dayLabel: day.dayLabel,
      holidayName: day.holidayName,
      slots,
      offEmployees: offEmps.map((e) => ({ employeeId: e.id, employeeName: e.name })),
    };
  });
}
