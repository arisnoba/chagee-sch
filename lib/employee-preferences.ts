import type { Employee } from "@/lib/db/schema";

export const PREFERENCE_OPTIONS = ["like", "neutral", "dislike"] as const;

export type Preference = (typeof PREFERENCE_OPTIONS)[number];
export type PartPreferences = Record<string, Preference>;

const PREFERENCES = new Set<string>(PREFERENCE_OPTIONS);
const DEFAULT_PREFERENCE: Preference = "neutral";

type EmployeePreferenceFields = Pick<Employee, "openPreference" | "middlePreference" | "closePreference"> & {
  partPreferences?: string | null;
};

export function isPreference(value: unknown): value is Preference {
  return typeof value === "string" && PREFERENCES.has(value);
}

export function readPreference(value: unknown, fallback: Preference = DEFAULT_PREFERENCE): Preference {
  return isPreference(value) ? value : fallback;
}

export function parsePartPreferences(value: unknown): PartPreferences {
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    return sanitizePartPreferences(parsed);
  } catch {
    return {};
  }
}

export function sanitizePartPreferences(value: unknown, fallback: PartPreferences = {}): PartPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...fallback };

  const preferences: PartPreferences = { ...fallback };
  for (const [code, preference] of Object.entries(value)) {
    const trimmedCode = code.trim();
    if (!trimmedCode || !isPreference(preference)) continue;
    preferences[trimmedCode] = preference;
  }

  return preferences;
}

export function getLegacyPartPreferences(employee: EmployeePreferenceFields): PartPreferences {
  return {
    open: readPreference(employee.openPreference),
    middle: readPreference(employee.middlePreference),
    close: readPreference(employee.closePreference),
  };
}

export function getEmployeePartPreferences(employee: EmployeePreferenceFields): PartPreferences {
  return sanitizePartPreferences(parsePartPreferences(employee.partPreferences), getLegacyPartPreferences(employee));
}

export function serializePartPreferences(preferences: PartPreferences): string {
  return JSON.stringify(preferences);
}

export function getPartPreference(employee: EmployeePreferenceFields, shiftCode: string): Preference {
  return getEmployeePartPreferences(employee)[shiftCode] ?? DEFAULT_PREFERENCE;
}
