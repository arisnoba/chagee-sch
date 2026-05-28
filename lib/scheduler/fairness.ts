import type { Employee, ShiftLog } from "@/lib/db/schema";

export type ShiftType = "open" | "middle" | "close" | "off";
export type DayType = "weekday" | "weekend" | "holiday";
export type Preference = "like" | "neutral" | "dislike";

const BASE_BURDEN: Record<ShiftType, number> = {
  open: 1,
  middle: 0,
  close: 2,
  off: 0,
};

const DAY_REWARD: Record<DayType, number> = {
  weekday: 1,
  weekend: 2,
  holiday: 3,
};

const PREFERENCE_MULTIPLIER: Record<Preference, number> = {
  like: 0.5,
  neutral: 1.0,
  dislike: 1.5,
};

function getPreference(employee: Employee, shiftType: ShiftType): Preference {
  if (shiftType === "open") return employee.openPreference as Preference;
  if (shiftType === "middle") return employee.middlePreference as Preference;
  if (shiftType === "close") return employee.closePreference as Preference;
  return "neutral";
}

export function calcBurden(employee: Employee, shiftType: ShiftType): number {
  if (shiftType === "off") return 0;
  const base = BASE_BURDEN[shiftType];
  const multiplier = PREFERENCE_MULTIPLIER[getPreference(employee, shiftType)];
  return base * multiplier;
}

export function calcFairnessScore(employee: Employee, logs: ShiftLog[]): number {
  const empLogs = logs.filter((l) => l.employeeId === employee.id);
  let burden = 0;
  let reward = 0;

  for (const log of empLogs) {
    if (log.shiftType === "off") {
      reward += DAY_REWARD[log.dayType as DayType];
    } else {
      burden += calcBurden(employee, log.shiftType as ShiftType);
    }
  }

  return burden - reward;
}

export type EmployeeWithScore = Employee & { fairnessScore: number };

export function rankByFairness(
  employees: Employee[],
  logs: ShiftLog[]
): EmployeeWithScore[] {
  return employees
    .map((e) => ({ ...e, fairnessScore: calcFairnessScore(e, logs) }))
    .sort((a, b) => b.fairnessScore - a.fairnessScore);
}
