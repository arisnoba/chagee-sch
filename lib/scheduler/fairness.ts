import type { Employee, ShiftLog } from "@/lib/db/schema";

export type ShiftType = string;
export type DayType = "weekday" | "weekend" | "holiday";
export type Preference = "like" | "neutral" | "dislike";

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

function getBaseBurden(shiftType: ShiftType): number {
  if (shiftType === "off") return 0;
  if (shiftType === "middle") return 0;
  if (shiftType === "close") return 2;
  return 1;
}

export function calcBurden(employee: Employee, shiftType: ShiftType): number {
  if (shiftType === "off") return 0;
  const base = getBaseBurden(shiftType);
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

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state, 1664525) + 1013904223;
    return ((state >>> 0) / 4294967296);
  };
}

function shuffleTieGroup<T extends { id: number }>(items: T[], seed: string): T[] {
  const result = [...items];
  const random = nextRandom(hashSeed(seed));

  for (let index = result.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

export function rankByFairness(
  employees: Employee[],
  logs: ShiftLog[],
  tieSeed?: string
): EmployeeWithScore[] {
  const ranked = employees
    .map((e) => ({ ...e, fairnessScore: calcFairnessScore(e, logs) }))
    .sort((a, b) => b.fairnessScore - a.fairnessScore);

  if (!tieSeed) return ranked;

  const result: EmployeeWithScore[] = [];
  let index = 0;

  while (index < ranked.length) {
    const score = ranked[index].fairnessScore;
    const group = [ranked[index]];
    index++;

    while (index < ranked.length && ranked[index].fairnessScore === score) {
      group.push(ranked[index]);
      index++;
    }

    result.push(...shuffleTieGroup(group, `${tieSeed}:${score}`));
  }

  return result;
}
