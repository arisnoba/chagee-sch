import { describe, expect, it } from "vitest";
import type { Employee, ShiftLog } from "@/lib/db/schema";
import { DEFAULT_SHIFT_PARTS, type WorkShiftPart } from "@/lib/shift-parts";
import { calcBurden, calcFairnessScore, partBurden, rankByFairness } from "./fairness";
import { getFairnessHistoryStartDate } from "./history";

function employee(id: number, name = `직원${id}`): Employee {
  return {
    id,
    name,
    employmentType: "fulltime",
    availableDays: "[]",
    openPreference: "neutral",
    middlePreference: "neutral",
    closePreference: "neutral",
    partPreferences: "{}",
    isActive: true,
    createdAt: null,
  };
}

function log(employeeId: number, shiftType: string, dayType: ShiftLog["dayType"] = "weekday"): ShiftLog {
  return {
    id: employeeId * 100,
    employeeId,
    date: "2026-06-01",
    shiftType,
    dayType,
    weekLabel: "2026-W23",
    isConfirmed: true,
    createdAt: null,
  };
}

describe("partBurden", () => {
  it("기본 파트 부담은 close > open > middle > 0 순서다", () => {
    const [open, middle, close] = DEFAULT_SHIFT_PARTS;

    expect(partBurden(close)).toBeGreaterThan(partBurden(open));
    expect(partBurden(open)).toBeGreaterThan(partBurden(middle));
    expect(partBurden(middle)).toBeGreaterThan(0);
    expect(partBurden(open)).toBe(1.5);
    expect(partBurden(middle)).toBe(1);
    expect(partBurden(close)).toBe(2.5);
  });

  it("커스텀 파트도 시간에 따라 서로 다른 부담을 가진다", () => {
    const early: WorkShiftPart = { code: "part-1", label: "새벽", startTime: "06:00", endTime: "15:00", sortOrder: 0 };
    const late: WorkShiftPart = { code: "part-2", label: "야간", startTime: "17:00", endTime: "02:00", sortOrder: 1 };

    expect(partBurden(early)).not.toBe(partBurden(late));
    expect(partBurden(late)).toBeGreaterThan(partBurden(early));
  });
});

describe("calcFairnessScore", () => {
  it("미들 근무도 0이 아닌 부담으로 계산한다", () => {
    const score = calcFairnessScore(employee(1), [log(1, "middle")], DEFAULT_SHIFT_PARTS);

    expect(score).toBe(1);
  });

  it("근무 부담에 요일 계수를 적용한다", () => {
    const emp = employee(1);

    expect(calcBurden(emp, "middle", DEFAULT_SHIFT_PARTS, "weekend")).toBe(
      calcBurden(emp, "middle", DEFAULT_SHIFT_PARTS, "weekday") * 1.5
    );
    expect(calcBurden(emp, "middle", DEFAULT_SHIFT_PARTS, "holiday")).toBe(
      calcBurden(emp, "middle", DEFAULT_SHIFT_PARTS, "weekday") * 2
    );
  });

  it("커스텀 파트 부담이 근무일 수로 평탄화되지 않는다", () => {
    const parts: WorkShiftPart[] = [
      { code: "part-1", label: "오전", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
      { code: "part-2", label: "심야", startTime: "17:00", endTime: "02:00", sortOrder: 1 },
    ];
    const ranked = rankByFairness(
      [employee(1, "오전"), employee(2, "심야")],
      [log(1, "part-1"), log(2, "part-2")],
      { shiftParts: parts }
    );

    expect(ranked[0].name).toBe("심야");
    expect(ranked[0].fairnessScore).toBeGreaterThan(ranked[1].fairnessScore);
  });

  it("커스텀 파트 성향을 JSON에서 읽어 부담에 반영한다", () => {
    const parts: WorkShiftPart[] = [
      { code: "part-1", label: "오전", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
    ];
    const preferred = { ...employee(1), partPreferences: JSON.stringify({ "part-1": "like" }) };
    const disliked = { ...employee(2), partPreferences: JSON.stringify({ "part-1": "dislike" }) };

    expect(calcFairnessScore(disliked, [log(2, "part-1")], parts)).toBeGreaterThan(
      calcFairnessScore(preferred, [log(1, "part-1")], parts)
    );
  });
});

describe("getFairnessHistoryStartDate", () => {
  it("기준일에서 기본 8주 전 날짜를 계산한다", () => {
    expect(getFairnessHistoryStartDate("2026-06-07")).toBe("2026-04-12");
  });
});
