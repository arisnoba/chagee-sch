import type { Employee, ShiftLog } from "@/lib/db/schema";
import { DEFAULT_SHIFT_PARTS, type WorkShiftPart } from "@/lib/shift-parts";
import { getPartPreference, type Preference } from "@/lib/employee-preferences";

export type ShiftType = string;
export type DayType = "weekday" | "weekend" | "holiday";

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
const BASE_BURDEN = 1.0;
const EARLY_START_MINUTES = 10 * 60;
const LATE_END_MINUTES = 21 * 60;
const EARLY_WEIGHT = 0.5;
const LATE_WEIGHT = 0.5;
const DEFAULT_WORK_SHIFT_PARTS = DEFAULT_SHIFT_PARTS.map(({ code, label, startTime, endTime, sortOrder }) => ({
  code,
  label,
  startTime,
  endTime,
  sortOrder,
}));

function parseTimeMinutes(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

export function partBurden(part: Pick<WorkShiftPart, "startTime" | "endTime"> | null | undefined): number {
  if (!part) return BASE_BURDEN;

  const startMinutes = parseTimeMinutes(part.startTime);
  let endMinutes = parseTimeMinutes(part.endTime);

  if (startMinutes === null || endMinutes === null) return BASE_BURDEN;
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

  const earliness = Math.max(0, EARLY_START_MINUTES - startMinutes) / 60;
  const lateness = Math.max(0, endMinutes - LATE_END_MINUTES) / 60;

  return BASE_BURDEN + EARLY_WEIGHT * earliness + LATE_WEIGHT * lateness;
}

function getBaseBurden(shiftType: ShiftType, shiftParts: WorkShiftPart[]): number {
  if (shiftType === "off") return 0;
  return partBurden(shiftParts.find((part) => part.code === shiftType));
}

export function calcBurden(
  employee: Employee,
  shiftType: ShiftType,
  shiftParts: WorkShiftPart[] = DEFAULT_WORK_SHIFT_PARTS
): number {
  if (shiftType === "off") return 0;
  const base = getBaseBurden(shiftType, shiftParts);
  const multiplier = PREFERENCE_MULTIPLIER[getPartPreference(employee, shiftType)];
  return base * multiplier;
}

export function calcFairnessScore(
  employee: Employee,
  logs: ShiftLog[],
  shiftParts: WorkShiftPart[] = DEFAULT_WORK_SHIFT_PARTS
): number {
  const empLogs = logs.filter((l) => l.employeeId === employee.id);
  let burden = 0;
  let reward = 0;

  for (const log of empLogs) {
    if (log.shiftType === "off") {
      reward += DAY_REWARD[log.dayType as DayType];
    } else {
      burden += calcBurden(employee, log.shiftType as ShiftType, shiftParts);
    }
  }

  return burden - reward;
}

export type EmployeeWithScore = Employee & { fairnessScore: number };
type RankOptions = {
  shiftParts?: WorkShiftPart[];
  tieSeed?: string;
};

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
  options?: string | RankOptions
): EmployeeWithScore[] {
  const rankOptions = typeof options === "string" ? { tieSeed: options } : options;
  const shiftParts = rankOptions?.shiftParts ?? DEFAULT_WORK_SHIFT_PARTS;
  const tieSeed = rankOptions?.tieSeed;
  const ranked = employees
    .map((e) => ({ ...e, fairnessScore: calcFairnessScore(e, logs, shiftParts) }))
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
