import type { Employee, ShiftLog } from "@/lib/db/schema";
import { rankByFairness, type ShiftType, type DayType } from "./fairness";

export type DaySchedule = {
  date: string; // YYYY-MM-DD
  dayType: DayType;
  dayLabel: string; // "월", "화", ...
  slots: { shiftType: ShiftType; employeeId: number; employeeName: string }[];
  offEmployees: { employeeId: number; employeeName: string }[];
};

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

// 파트당 최소 인원 (MVP: 각 파트 1명씩)
const SHIFTS_PER_DAY: ShiftType[] = ["open", "middle", "close"];
const SLOTS_PER_SHIFT = 1;

function getDayType(date: Date, holidays: string[]): DayType {
  const dateStr = date.toISOString().slice(0, 10);
  if (holidays.includes(dateStr)) return "holiday";
  const dow = date.getDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

function isAvailable(employee: Employee, date: Date): boolean {
  const dow = date.getDay(); // 0=sun, 1=mon, ...
  const dayKey = DAY_KEYS[dow];
  const available: string[] = JSON.parse(employee.availableDays);
  return available.includes(dayKey);
}

export function generateWeekSchedule(
  weekStart: Date, // Monday
  employees: Employee[],
  pastLogs: ShiftLog[],
  holidays: string[] = []
): DaySchedule[] {
  const result: DaySchedule[] = [];
  // 생성 중 누적 부담을 반영하기 위해 로그를 복사해서 사용
  const workingLogs: ShiftLog[] = [...pastLogs];
  let nextLogId = 100000;

  for (let d = 0; d < 7; d++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().slice(0, 10);
    const dayType = getDayType(date, holidays);
    const dayLabel = DAY_LABELS[date.getDay()];

    const availableToday = employees.filter((e) => isAvailable(e, date));
    const assignedToday = new Set<number>();
    const slots: DaySchedule["slots"] = [];

    for (const shiftType of SHIFTS_PER_DAY) {
      const ranked = rankByFairness(
        availableToday.filter((e) => !assignedToday.has(e.id)),
        workingLogs
      );

      for (let i = 0; i < SLOTS_PER_SHIFT && i < ranked.length; i++) {
        const emp = ranked[i];
        assignedToday.add(emp.id);
        slots.push({ shiftType, employeeId: emp.id, employeeName: emp.name });
        // 이번 배정을 workingLogs에 반영해 다음 슬롯 계산에 사용
        workingLogs.push({
          id: nextLogId++,
          employeeId: emp.id,
          date: dateStr,
          shiftType,
          dayType,
          weekLabel: "",
          isConfirmed: false,
          createdAt: null,
        });
      }
    }

    // 나머지 출근 가능 인원은 휴무
    const offEmployees = availableToday
      .filter((e) => !assignedToday.has(e.id))
      .map((e) => ({ employeeId: e.id, employeeName: e.name }));

    // 출근 불가 인원도 off로 처리 (dayType weekday는 reward 없음 — 그냥 skip)
    result.push({ date: dateStr, dayType, dayLabel, slots, offEmployees });
  }

  return result;
}
