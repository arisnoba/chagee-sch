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

function generatePastLogs(empIds: number[]) {
  // 인덱스 매핑
  const [jh, sw, de, sy, ja, mj, yn, jr, sh, oj, hk, ms, dh, cw, sm] = empIds;

  const closeHeavy = [jh, sw, de];   // 마감/기피 → 보상우선
  const openHeavy  = [sy, ja];       // 오픈/기피 → 보상우선
  const mixedYangho = [mj, yn, jr, sh, oj]; // 중립 혼합 → 양호
  const favClose = [hk, cw];         // 마감/선호 + 주말 휴무 → 꿀
  const favOpen  = [ms, sm];         // 오픈/선호 + 주말 휴무 → 꿀
  const favMiddle = [dh];            // 미들/선호 → 꿀

  const HOLIDAYS = new Set(["2026-05-05", "2026-05-15"]);
  const rotations = ["open", "middle", "close"] as const;
  const logs: {
    employeeId: number;
    date: string;
    shiftType: "open" | "middle" | "close" | "off";
    dayType: "weekday" | "weekend" | "holiday";
    weekLabel: string;
    isConfirmed: boolean;
  }[] = [];

  // 4주 전 월요일 기준
  const startDate = new Date("2026-04-28");

  for (let week = 0; week < 4; week++) {
    const weekLabel = `2026-W${String(week + 18).padStart(2, "0")}`;

    for (let d = 0; d < 7; d++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + week * 7 + d);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay();
      const isHoliday = HOLIDAYS.has(dateStr);
      const isWeekend = dow === 0 || dow === 6;
      const dayType = isHoliday ? "holiday" : isWeekend ? "weekend" : "weekday";

      const push = (empId: number, shiftType: "open" | "middle" | "close" | "off") =>
        logs.push({ employeeId: empId, date: dateStr, shiftType, dayType, weekLabel, isConfirmed: true });

      // 보상우선: 쉬는 날 없이 기피 파트 집중 투입
      for (const id of closeHeavy) push(id, "close");
      for (const id of openHeavy)  push(id, "open");

      // 꿀: 주말/공휴일 휴무도 하루 최대 4명까지만 배정
      for (const id of favClose)  push(id, isHoliday || isWeekend ? "off" : "close");
      for (const id of favOpen)   push(id, isHoliday || isWeekend ? "off" : "open");
      for (const id of favMiddle) push(id, "middle");

      // 양호: 주말 근무 포함, 평일 중 이틀만 휴무, 나머지는 순환 배정
      // (보상우선보다는 나은 상황이지만 주말 혜택은 없음 → 중간 점수)
      for (let i = 0; i < mixedYangho.length; i++) {
        const id = mixedYangho[i];
        const globalDay = week * 7 + d;
        // 각 직원마다 다른 평일(Mon=0 ~ Fri=4)에 휴무
        const offA = (i * 2) % 5;
        const offB = (i * 2 + 1) % 5;
        if (!isHoliday && !isWeekend && (d === offA || d === offB)) {
          push(id, "off"); // 평일 휴무만
        } else {
          push(id, rotations[(globalDay + i) % 3]); // 주말/공휴일에도 근무
        }
      }
    }
  }

  return logs;
}

export async function seed() {
  console.log("Seeding database...");

  await db.delete(shiftLogs);
  await db.delete(schedules);
  await db.delete(employees);

  const inserted = await db.insert(employees).values(MOCK_EMPLOYEES).returning();
  console.log(`Inserted ${inserted.length} employees`);

  const empIds = inserted.map((e) => e.id);
  const logs = generatePastLogs(empIds);
  await db.insert(shiftLogs).values(logs);
  console.log(`Inserted ${logs.length} shift logs`);

  console.log("Seed complete!");
}
