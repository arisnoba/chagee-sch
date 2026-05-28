import { db } from "./client";
import { employees, shiftLogs, schedules } from "./schema";

const ALL_DAYS = JSON.stringify(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);

const MOCK_EMPLOYEES = [
  // 보상우선 tier: 기피 파트에 집중 투입된 직원들
  { name: "박지호", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "dislike" as const },
  { name: "한승우", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "dislike" as const },
  { name: "정다은", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "dislike" as const },
  { name: "이서연", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "dislike" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "윤지아", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "dislike" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  // 양호 tier: 중립 성향, 균형 잡힌 이력
  { name: "김민준", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "최유나", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "이준혁", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "like" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "강서현", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "like" as const, closePreference: "neutral" as const },
  { name: "오지훈", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "like" as const },
  // 꿀 tier: 선호 파트만 투입, 주말/공휴일 휴무 혜택
  { name: "임하은", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "like" as const },
  { name: "조민서", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "like" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "신동현", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "like" as const, closePreference: "neutral" as const },
  { name: "류채원", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "like" as const },
  { name: "백승민", employmentType: "fulltime" as const, availableDays: ALL_DAYS, openPreference: "like" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
];

const SEED_HOLIDAYS = new Set(["2026-05-05", "2026-05-15"]);

const SEED_WEEK_STARTS = [
  { weekLabel: "2026-W14", startDate: "2026-03-29" },
  { weekLabel: "2026-W15", startDate: "2026-04-05" },
  { weekLabel: "2026-W16", startDate: "2026-04-12" },
  { weekLabel: "2026-W17", startDate: "2026-04-19" },
  { weekLabel: "2026-W18", startDate: "2026-04-26" },
  { weekLabel: "2026-W19", startDate: "2026-05-03" },
  { weekLabel: "2026-W20", startDate: "2026-05-10" },
  { weekLabel: "2026-W21", startDate: "2026-05-17" },
];

const SEED_LOG_START_DATE = "2026-04-01";
const SEED_LOG_END_DATE = "2026-05-23";
const DAILY_STAFFING = {
  off: 4,
  open: 3,
  middle: 4,
  close: 4,
} as const;

type ShiftType = "open" | "middle" | "close" | "off";

type SeedShiftLog = {
  employeeId: number;
  date: string;
  shiftType: ShiftType;
  dayType: "weekday" | "weekend" | "holiday";
  weekLabel: string;
  isConfirmed: boolean;
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getDayType(date: string): "weekday" | "weekend" | "holiday" {
  if (SEED_HOLIDAYS.has(date)) return "holiday";

  const day = new Date(date).getDay();
  return day === 0 || day === 6 ? "weekend" : "weekday";
}

function getWeekLabel(date: string): string {
  const target = new Date(date);
  const sunday = new Date(target);
  sunday.setDate(target.getDate() - target.getDay());

  const schedule = SEED_WEEK_STARTS.find((week) => week.startDate === formatDate(sunday));
  return schedule?.weekLabel ?? "2026-W00";
}

function seededScore(date: string, employeeId: number): number {
  let hash = employeeId * 97;

  for (const char of date) {
    hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  }

  return hash;
}

function getDailyAssignments(
  date: string,
  insertedEmployees: typeof employees.$inferSelect[],
): Array<{ employee: typeof employees.$inferSelect; shiftType: ShiftType }> {
  const shuffledEmployees = [...insertedEmployees].sort((a, b) => {
    const scoreDiff = seededScore(date, a.id) - seededScore(date, b.id);
    return scoreDiff || a.name.localeCompare(b.name, "ko");
  });

  const assignments: Array<{ employee: typeof employees.$inferSelect; shiftType: ShiftType }> = [];
  let cursor = 0;

  for (const [shiftType, count] of Object.entries(DAILY_STAFFING) as Array<[ShiftType, number]>) {
    const employeesForShift = shuffledEmployees.slice(cursor, cursor + count);

    for (const employee of employeesForShift) {
      assignments.push({ employee, shiftType });
    }

    cursor += count;
  }

  return assignments;
}

function generatePastSchedulesAndLogs(insertedEmployees: typeof employees.$inferSelect[]) {
  const logs: SeedShiftLog[] = [];

  const scheduleRows = SEED_WEEK_STARTS.map(({ weekLabel, startDate }) => ({
    weekLabel,
    startDate,
    status: "confirmed" as const,
    confirmedAt: new Date("2026-05-23T09:00:00.000Z").toISOString(),
  }));

  for (
    let date = new Date(SEED_LOG_START_DATE);
    formatDate(date) <= SEED_LOG_END_DATE;
    date.setDate(date.getDate() + 1)
  ) {
    const dateString = formatDate(date);
    const weekLabel = getWeekLabel(dateString);
    const dayType = getDayType(dateString);

    for (const { employee, shiftType } of getDailyAssignments(dateString, insertedEmployees)) {
      logs.push({
        employeeId: employee.id,
        date: dateString,
        shiftType,
        dayType,
        weekLabel,
        isConfirmed: true,
      });
    }
  }

  return { scheduleRows, logs };
}

export async function seed() {
  console.log("Seeding database...");

  await db.delete(shiftLogs);
  await db.delete(schedules);
  await db.delete(employees);

  const inserted = await db.insert(employees).values(MOCK_EMPLOYEES).returning();
  console.log(`Inserted ${inserted.length} employees`);

  const { scheduleRows, logs } = generatePastSchedulesAndLogs(inserted);
  await db.insert(schedules).values(scheduleRows);
  console.log(`Inserted ${scheduleRows.length} schedules`);

  await db.insert(shiftLogs).values(logs);
  console.log(`Inserted ${logs.length} shift logs`);

  console.log("Seed complete!");
}
