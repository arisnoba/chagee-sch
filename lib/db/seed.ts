import { db } from "./client";
import { employees, shiftLogs, schedules } from "./schema";

const MOCK_EMPLOYEES = [
  { name: "김민준", employmentType: "fulltime" as const, availableDays: JSON.stringify(["mon","tue","wed","thu","fri"]), openPreference: "neutral" as const, middlePreference: "like" as const, closePreference: "dislike" as const },
  { name: "이서연", employmentType: "parttime" as const, availableDays: JSON.stringify(["tue","wed","thu","fri","sat"]), openPreference: "dislike" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "박지호", employmentType: "parttime" as const, availableDays: JSON.stringify(["mon","wed","fri","sat"]), openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "dislike" as const },
  { name: "최유나", employmentType: "fulltime" as const, availableDays: JSON.stringify(["mon","tue","wed","thu","fri"]), openPreference: "like" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "정다은", employmentType: "parttime" as const, availableDays: JSON.stringify(["wed","thu","fri","sat","sun"]), openPreference: "neutral" as const, middlePreference: "like" as const, closePreference: "neutral" as const },
  { name: "한승우", employmentType: "parttime" as const, availableDays: JSON.stringify(["mon","tue","thu","fri"]), openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "like" as const },
  { name: "오하늘", employmentType: "fulltime" as const, availableDays: JSON.stringify(["mon","tue","wed","thu","fri","sat"]), openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
  { name: "윤지아", employmentType: "parttime" as const, availableDays: JSON.stringify(["tue","thu","sat","sun"]), openPreference: "dislike" as const, middlePreference: "like" as const, closePreference: "neutral" as const },
  { name: "강도윤", employmentType: "parttime" as const, availableDays: JSON.stringify(["mon","tue","wed","thu","fri"]), openPreference: "like" as const, middlePreference: "neutral" as const, closePreference: "dislike" as const },
  { name: "임소희", employmentType: "fulltime" as const, availableDays: JSON.stringify(["mon","tue","wed","thu","fri","sat","sun"]), openPreference: "neutral" as const, middlePreference: "neutral" as const, closePreference: "neutral" as const },
];

// 과거 4주치 목업 이력 생성
function generatePastLogs(employeeIds: number[]) {
  const logs = [];
  const today = new Date("2026-05-28");
  // 4주 전 월요일
  const start = new Date(today);
  start.setDate(start.getDate() - 28 - start.getDay() + 1);

  const shifts = ["open", "middle", "close"] as const;
  // 편향 패턴 주입: 박지호(id=3), 한승우(id=6) → 마감 집중
  //                이서연(id=2), 윤지아(id=8) → 오픈 집중
  //                김민준(id=1), 최유나(id=4) → 공휴일 휴무 편중
  const biasClose = [employeeIds[2], employeeIds[5]]; // 박지호, 한승우
  const biasOpen  = [employeeIds[1], employeeIds[7]]; // 이서연, 윤지아
  const biasHoliday = [employeeIds[0], employeeIds[3]]; // 김민준, 최유나

  for (let week = 0; week < 4; week++) {
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(date.getDate() + week * 7 + d);
      const dateStr = date.toISOString().slice(0, 10);
      const dow = date.getDay();
      const dayType = dow === 0 || dow === 6 ? "weekend" : "weekday";
      const weekLabel = `2026-W${String(week + 18).padStart(2, "0")}`;

      const assigned = new Set<number>();

      // 마감 편향
      for (const empId of biasClose) {
        if (!assigned.has(empId)) {
          logs.push({ employeeId: empId, date: dateStr, shiftType: "close" as const, dayType: dayType as "weekday"|"weekend"|"holiday", weekLabel, isConfirmed: true });
          assigned.add(empId);
        }
      }
      // 오픈 편향
      for (const empId of biasOpen) {
        if (!assigned.has(empId)) {
          logs.push({ employeeId: empId, date: dateStr, shiftType: "open" as const, dayType: dayType as "weekday"|"weekend"|"holiday", weekLabel, isConfirmed: true });
          assigned.add(empId);
        }
      }
      // 나머지 인원 랜덤 배정
      for (const empId of employeeIds) {
        if (!assigned.has(empId)) {
          const shift = shifts[Math.floor(Math.random() * shifts.length)];
          logs.push({ employeeId: empId, date: dateStr, shiftType: shift, dayType: dayType as "weekday"|"weekend"|"holiday", weekLabel, isConfirmed: true });
          assigned.add(empId);
        }
      }
    }
  }

  // 공휴일 휴무 편중 (2번 삽입)
  const holidays = ["2026-05-05", "2026-05-15"];
  for (const holiday of holidays) {
    for (const empId of biasHoliday) {
      logs.push({ employeeId: empId, date: holiday, shiftType: "off" as const, dayType: "holiday" as const, weekLabel: "2026-W19", isConfirmed: true });
    }
  }

  return logs;
}

export async function seed() {
  console.log("Seeding database...");

  // 기존 데이터 삭제
  await db.delete(shiftLogs);
  await db.delete(schedules);
  await db.delete(employees);

  // 직원 삽입
  const inserted = await db.insert(employees).values(MOCK_EMPLOYEES).returning();
  console.log(`Inserted ${inserted.length} employees`);

  // 과거 이력 삽입
  const empIds = inserted.map((e) => e.id);
  const logs = generatePastLogs(empIds);
  await db.insert(shiftLogs).values(logs);
  console.log(`Inserted ${logs.length} shift logs`);

  console.log("Seed complete!");
}
