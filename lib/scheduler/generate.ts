import type { Employee, ShiftLog } from "@/lib/db/schema";
import { rankByFairness, type EmployeeWithScore, type ShiftType, type DayType } from "./fairness";

export type DaySchedule = {
  date: string;
  dayType: DayType;
  dayLabel: string;
  holidayName?: string;
  slots: { shiftType: ShiftType; employeeId: number; employeeName: string; reasons?: string[] }[];
  offEmployees: { employeeId: number; employeeName: string; reasons?: string[] }[];
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

function getPreferenceLabel(emp: Employee, shift: "open" | "middle" | "close"): string {
  const preference = shift === "open"
    ? emp.openPreference
    : shift === "middle"
    ? emp.middlePreference
    : emp.closePreference;

  if (preference === "like") return "선호 파트";
  if (preference === "dislike") return "기피 파트 보상 반영";
  return "보통 성향";
}

function getShiftReasons(
  emp: EmployeeWithScore,
  shift: "open" | "middle" | "close",
  previousCloseIds: Set<number>
): string[] {
  const reasons = [`공평 지표 ${emp.fairnessScore.toFixed(1)}점`];
  reasons.push(getPreferenceLabel(emp, shift));

  if (shift === "close") reasons.push("마감 인원 우선 배정");
  if (previousCloseIds.has(emp.id) && shift !== "open") reasons.push("마감 다음날 오픈 회피");

  return reasons;
}

// 공정성 순으로 정렬된 직원들을 오픈/미들/마감에 배분 (휴무 제외 전원 투입)
function assignShifts(
  rankedWorkers: EmployeeWithScore[],
  previousCloseIds: Set<number> = new Set()
): DaySchedule["slots"] {
  const W = rankedWorkers.length;
  if (W === 0) return [];

  const extra = W % 3;
  const base = Math.floor(W / 3);
  // 나머지 인원: 마감에 먼저, 그 다음 미들에 배분해 오픈보다 마감 인원을 두텁게 둔다.
  const cap = {
    open: base,
    middle: base + (extra >= 2 ? 1 : 0),
    close: base + (extra >= 1 ? 1 : 0),
  };

  const slots: DaySchedule["slots"] = [];

  for (const emp of rankedWorkers) {
    const prefOrder = getShiftPreferenceOrder(emp);
    const shiftOrder = previousCloseIds.has(emp.id)
      ? [...prefOrder.filter((shift) => shift !== "open"), "open" as const]
      : prefOrder;
    let assigned = false;

    for (const shift of shiftOrder) {
      if (cap[shift] > 0) {
        slots.push({
          shiftType: shift,
          employeeId: emp.id,
          employeeName: emp.name,
          reasons: getShiftReasons(emp, shift, previousCloseIds),
        });
        cap[shift]--;
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      for (const shift of ["close", "middle", "open"] as const) {
        if (cap[shift] > 0) {
          slots.push({
            shiftType: shift,
            employeeId: emp.id,
            employeeName: emp.name,
            reasons: getShiftReasons(emp, shift, previousCloseIds),
          });
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

function getOffReasons(emp: EmployeeWithScore, day: WeekDay, pickedDates: string[]): string[] {
  const reasons = [`공평 지표 ${emp.fairnessScore.toFixed(1)}점`];
  reasons.push("주 2회 휴무 목표");

  if (day.dayType === "holiday") reasons.push("공휴일 휴무 우선");
  if (day.dayType === "weekend") reasons.push("주말 휴무 우선");

  const hasAdjacentOff = pickedDates.some(
    (pickedDate) => Math.abs(new Date(day.date).getTime() - new Date(pickedDate).getTime()) === 86400000
  );
  if (!hasAdjacentOff) reasons.push("연속 휴무 회피");

  return reasons;
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
    const offEmps = rankByFairness(
      employees.filter((e) => offIds.has(e.id)),
      workingLogs
    );

    const ranked = rankByFairness(workingEmps, workingLogs);
    const previousDate = new Date(day.date);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateString = previousDate.toISOString().slice(0, 10);
    const previousCloseIds = new Set(
      workingLogs
        .filter((log) => log.date === previousDateString && log.shiftType === "close")
        .map((log) => log.employeeId)
    );
    const slots = assignShifts(ranked, previousCloseIds);

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
      offEmployees: offEmps.map((e) => ({
        employeeId: e.id,
        employeeName: e.name,
        reasons: getOffReasons(
          e,
          day,
          (offDayMap[e.id] ?? []).filter((date) => date !== day.date)
        ),
      })),
    };
  });
}
