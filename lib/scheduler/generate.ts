import type { Employee, ShiftLog } from "@/lib/db/schema";
import { rankByFairness, type EmployeeWithScore, type ShiftType, type DayType } from "./fairness";
import { DEFAULT_SHIFT_PARTS, sortShiftParts, type WorkShiftPart } from "@/lib/shift-parts";
import { addLocalDays, daysBetween, formatLocalDate, parseLocalDate } from "@/lib/calendar/date";

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
const DEFAULT_WORK_SHIFT_PARTS = DEFAULT_SHIFT_PARTS.map(({ code, label, startTime, endTime, sortOrder }) => ({
  code,
  label,
  startTime,
  endTime,
  sortOrder,
}));

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
    const d = addLocalDays(weekStart, i);
    const date = formatLocalDate(d);
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

function getShiftPreferenceScore(emp: Employee, shiftCode: string): number {
  if (shiftCode === "open") return prefScore(emp.openPreference);
  if (shiftCode === "middle") return prefScore(emp.middlePreference);
  if (shiftCode === "close") return prefScore(emp.closePreference);
  return prefScore("neutral");
}

function getShiftPreferenceOrder(emp: Employee, shiftParts: WorkShiftPart[]): string[] {
  return shiftParts
    .map((part) => ({ s: part.code, score: getShiftPreferenceScore(emp, part.code), sortOrder: part.sortOrder }))
    .sort((a, b) => (b.score - a.score) || (a.sortOrder - b.sortOrder))
    .map((x) => x.s);
}

function getPreferenceLabel(emp: Employee, shift: string): string {
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
  shift: string,
  shiftParts: WorkShiftPart[],
  previousLastShiftIds: Set<number>,
  options: { unavoidableCloseOpen?: boolean } = {}
): string[] {
  const reasons = [`공평 지표 ${emp.fairnessScore.toFixed(1)}점`];
  reasons.push(getPreferenceLabel(emp, shift));

  const firstShift = shiftParts[0]?.code;
  const lastShift = shiftParts[shiftParts.length - 1]?.code;

  if (shift === lastShift) reasons.push("마지막 파트 인원 우선 배정");
  if (previousLastShiftIds.has(emp.id) && shift !== firstShift) reasons.push("마지막 파트 다음날 첫 파트 회피");
  if (options.unavoidableCloseOpen) reasons.push("마지막 파트 다음날 첫 파트 불가피");

  return reasons;
}

function getShiftCapacities(workerCount: number, shiftParts: WorkShiftPart[]): Record<string, number> {
  if (workerCount <= 0) return Object.fromEntries(shiftParts.map((part) => [part.code, 0]));
  if (workerCount <= shiftParts.length) {
    return Object.fromEntries(shiftParts.map((part, index) => [part.code, index < workerCount ? 1 : 0]));
  }

  const base = Math.floor(workerCount / shiftParts.length);
  let extra = workerCount % shiftParts.length;
  const cap = Object.fromEntries(shiftParts.map((part) => [part.code, base]));

  for (let index = shiftParts.length - 1; index >= 0 && extra > 0; index--) {
    cap[shiftParts[index].code]++;
    extra--;
  }

  return cap;
}

// 공정성 순으로 정렬된 직원들을 설정된 근무 파트에 배분 (휴무 제외 전원 투입)
function assignShifts(
  rankedWorkers: EmployeeWithScore[],
  shiftParts: WorkShiftPart[],
  previousLastShiftIds: Set<number> = new Set()
): DaySchedule["slots"] {
  const W = rankedWorkers.length;
  if (W === 0) return [];

  const cap = getShiftCapacities(W, shiftParts);
  const slots: DaySchedule["slots"] = [];
  const firstShift = shiftParts[0]?.code;

  for (const emp of rankedWorkers) {
    const prefOrder = getShiftPreferenceOrder(emp, shiftParts);
    const shiftOrder = previousLastShiftIds.has(emp.id) && firstShift
      ? prefOrder.filter((shift) => shift !== firstShift)
      : prefOrder;
    let assigned = false;

    for (const shift of shiftOrder) {
      if (cap[shift] > 0) {
        slots.push({
          shiftType: shift,
          employeeId: emp.id,
          employeeName: emp.name,
          reasons: getShiftReasons(emp, shift, shiftParts, previousLastShiftIds),
        });
        cap[shift]--;
        assigned = true;
        break;
      }
    }

    if (!assigned && firstShift && previousLastShiftIds.has(emp.id) && cap[firstShift] > 0) {
      const swappableSlot = slots.find(
        (slot) => slot.shiftType !== firstShift && !previousLastShiftIds.has(slot.employeeId)
      );

      if (swappableSlot) {
        const swapShift = swappableSlot.shiftType;
        swappableSlot.shiftType = firstShift;
        swappableSlot.reasons = [...(swappableSlot.reasons ?? []), "마지막 파트 다음날 첫 파트 방지 스왑"];
        slots.push({
          shiftType: swapShift,
          employeeId: emp.id,
          employeeName: emp.name,
          reasons: getShiftReasons(emp, swapShift, shiftParts, previousLastShiftIds),
        });
        cap[firstShift]--;
        assigned = true;
      }
    }

    if (!assigned) {
      for (const shift of [...shiftParts].reverse().map((part) => part.code)) {
        if (cap[shift] > 0) {
          slots.push({
            shiftType: shift,
            employeeId: emp.id,
            employeeName: emp.name,
            reasons: getShiftReasons(emp, shift, shiftParts, previousLastShiftIds, {
              unavoidableCloseOpen: firstShift === shift && previousLastShiftIds.has(emp.id),
            }),
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
            picked.some((pickedDate) => Math.abs(daysBetween(date, pickedDate)) === 1);
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
    (pickedDate) => Math.abs(daysBetween(day.date, pickedDate)) === 1
  );
  if (!hasAdjacentOff) reasons.push("연속 휴무 회피");

  return reasons;
}

export function generateWeekSchedule(
  weekStart: Date,
  employees: Employee[],
  pastLogs: ShiftLog[],
  holidays: HolidayInput[] = [],
  configuredShiftParts: WorkShiftPart[] = DEFAULT_WORK_SHIFT_PARTS
): DaySchedule[] {
  const weekDays = buildWeekDays(weekStart, holidays);
  const shiftParts = sortShiftParts(configuredShiftParts).slice(0, 6);
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
    const previousDateString = formatLocalDate(addLocalDays(parseLocalDate(day.date), -1));
    const lastShiftCode = shiftParts[shiftParts.length - 1]?.code;
    const previousLastShiftIds = new Set(
      workingLogs
        .filter((log) => log.date === previousDateString && log.shiftType === lastShiftCode)
        .map((log) => log.employeeId)
    );
    const slots = assignShifts(ranked, shiftParts, previousLastShiftIds);

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
