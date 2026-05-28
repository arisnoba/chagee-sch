"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScheduleCalendar, type CalendarDay } from "@/components/schedule-calendar";
import type { DaySchedule } from "@/lib/scheduler/generate";
import type { ShiftType } from "@/lib/scheduler/fairness";

const MAX_OFF_PER_DAY = 4;
const WORK_SHIFT_TYPES = ["close", "middle", "open"] as const;
const EDIT_SHIFT_TYPES = ["open", "middle", "close", "off"] as const;
const SHIFT_LABELS: Record<ShiftType, string> = { open: "오픈", middle: "미들", close: "마감", off: "휴무" };
const SHIFT_STYLES: Record<ShiftType, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  middle: "bg-green-100 text-green-800 border-green-200",
  close: "bg-orange-100 text-orange-800 border-orange-200",
  off: "bg-gray-100 text-gray-600 border-gray-200",
};

type WorkShiftType = Exclude<ShiftType, "off">;
type ScheduleEmployee = { employeeId: number; employeeName: string; reasons?: string[] };

function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(sunday: Date): string {
  const start = new Date(sunday.getFullYear(), 0, 1);
  const week = Math.ceil(((sunday.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${sunday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function toCalendarDays(days: DaySchedule[]): CalendarDay[] {
  return days.map((day) => ({
    date: day.date,
    dayLabel: day.dayLabel,
    dayType: day.dayType,
    holidayName: day.holidayName,
    shifts: (["open", "middle", "close"] as const)
      .map((shiftType) => ({
        shiftType,
        names: day.slots
          .filter((slot) => slot.shiftType === shiftType)
          .map((slot) => slot.employeeName),
      }))
      .filter((shift) => shift.names.length > 0),
    offNames: day.offEmployees.map((employee) => employee.employeeName),
  }));
}

function getDayEmployees(day: DaySchedule): ScheduleEmployee[] {
  const employees = new Map<number, ScheduleEmployee>();

  for (const slot of day.slots) {
    employees.set(slot.employeeId, {
      employeeId: slot.employeeId,
      employeeName: slot.employeeName,
      reasons: slot.reasons,
    });
  }
  for (const employee of day.offEmployees) {
    employees.set(employee.employeeId, employee);
  }

  return [...employees.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName, "ko"));
}

function getConsecutiveOffNames(days: DaySchedule[]): string[] {
  const offDatesByEmployee = new Map<number, { name: string; dates: string[] }>();

  for (const day of days) {
    for (const employee of day.offEmployees) {
      const entry = offDatesByEmployee.get(employee.employeeId) ?? { name: employee.employeeName, dates: [] };
      entry.dates.push(day.date);
      offDatesByEmployee.set(employee.employeeId, entry);
    }
  }

  const names = [...offDatesByEmployee.values()]
    .filter((entry) => {
      const sortedDates = entry.dates.sort();
      return sortedDates.some((date, index) => {
        const previousDate = sortedDates[index - 1];
        return previousDate && Math.abs(new Date(date).getTime() - new Date(previousDate).getTime()) === 86400000;
      });
    })
    .map((entry) => entry.name);

  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
}

function getCloseOpenNames(days: DaySchedule[]): string[] {
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const names: string[] = [];

  for (let index = 1; index < sortedDays.length; index++) {
    const previousDay = sortedDays[index - 1];
    const currentDay = sortedDays[index];
    const previousCloseIds = new Set(
      previousDay.slots
        .filter((slot) => slot.shiftType === "close")
        .map((slot) => slot.employeeId)
    );

    for (const slot of currentDay.slots) {
      if (slot.shiftType === "open" && previousCloseIds.has(slot.employeeId)) {
        names.push(slot.employeeName);
      }
    }
  }

  return [...new Set(names)].sort((a, b) => a.localeCompare(b, "ko"));
}

function getEmployeeShift(day: DaySchedule, employeeId: number): ShiftType {
  if (day.offEmployees.some((employee) => employee.employeeId === employeeId)) return "off";
  return day.slots.find((slot) => slot.employeeId === employeeId)?.shiftType ?? "middle";
}

function getLeastLoadedWorkShift(day: DaySchedule, excludeShift?: ShiftType): WorkShiftType {
  const counts: Record<WorkShiftType, number> = { open: 0, middle: 0, close: 0 };
  for (const slot of day.slots) counts[slot.shiftType as WorkShiftType]++;

  return [...WORK_SHIFT_TYPES]
    .filter((shift) => shift !== excludeShift)
    .sort((a, b) => counts[a] - counts[b])[0] ?? "middle";
}

function moveEmployeeToShift(day: DaySchedule, employee: ScheduleEmployee, shiftType: ShiftType): DaySchedule {
  const slots = day.slots.filter((slot) => slot.employeeId !== employee.employeeId);
  const offEmployees = day.offEmployees.filter((offEmployee) => offEmployee.employeeId !== employee.employeeId);
  const nextEmployee = {
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    reasons: ["점장 수동 조정"],
  };

  if (shiftType === "off") {
    return { ...day, slots, offEmployees: [...offEmployees, nextEmployee] };
  }

  return {
    ...day,
    slots: [...slots, { shiftType, ...nextEmployee }],
    offEmployees,
  };
}

function getSelectedDayAssignments(day: DaySchedule): {
  shiftType: ShiftType;
  employeeName: string;
  reasons: string[];
}[] {
  return [
    ...day.slots.map((slot) => ({
      shiftType: slot.shiftType,
      employeeName: slot.employeeName,
      reasons: slot.reasons ?? [],
    })),
    ...day.offEmployees.map((employee) => ({
      shiftType: "off" as const,
      employeeName: employee.employeeName,
      reasons: employee.reasons ?? [],
    })),
  ].sort((a, b) => {
    const shiftOrder: Record<ShiftType, number> = { open: 0, middle: 1, close: 2, off: 3 };
    const shiftDiff = shiftOrder[a.shiftType] - shiftOrder[b.shiftType];
    if (shiftDiff !== 0) return shiftDiff;
    return a.employeeName.localeCompare(b.employeeName, "ko");
  });
}

export default function GeneratePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => formatDate(getSunday(new Date())));
  const [preview, setPreview] = useState<DaySchedule[] | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedEditDate, setSelectedEditDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftType>("off");
  const consecutiveOffNames = useMemo(() => preview ? getConsecutiveOffNames(preview) : [], [preview]);
  const closeOpenNames = useMemo(() => preview ? getCloseOpenNames(preview) : [], [preview]);
  const selectedDay = useMemo(
    () => preview?.find((day) => day.date === selectedEditDate) ?? preview?.[0],
    [preview, selectedEditDate]
  );

  async function handleGenerate() {
    setGenerating(true);
    const sunday = new Date(selectedDate);
    const label = getWeekLabel(sunday);
    setWeekLabel(label);

    const res = await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekLabel: label, startDate: selectedDate }),
    });

    if (res.ok) {
      const data = await res.json();
      setPreview(data.days);
      setSelectedEditDate(data.days[0]?.date ?? "");
    }
    setGenerating(false);
  }

  async function handleConfirm() {
    if (!preview) return;
    setSaving(true);
    setSaveError("");
    const saveRes = await fetch(`/api/schedule/${weekLabel}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: preview }),
    });

    if (!saveRes.ok) {
      setSaveError("수정한 휴무를 저장하지 못했습니다.");
      setSaving(false);
      return;
    }

    const confirmRes = await fetch(`/api/schedule/${weekLabel}`, { method: "PATCH" });
    if (!confirmRes.ok) {
      setSaveError("근무표를 확정하지 못했습니다.");
      setSaving(false);
      return;
    }

    router.push(`/schedule/${weekLabel}`);
  }

  function handleToggleShift(employee: ScheduleEmployee, checked: boolean) {
    if (!selectedDay) return;

    setPreview((current) => current?.map((day) => {
      if (day.date !== selectedDay.date) return day;

      const currentShift = getEmployeeShift(day, employee.employeeId);
      let nextShift = selectedShift;

      if (checked && selectedShift === "off" && currentShift !== "off" && day.offEmployees.length >= MAX_OFF_PER_DAY) {
        return day;
      }
      if (checked) {
        nextShift = selectedShift;
      } else if (currentShift === selectedShift) {
        nextShift = selectedShift === "off"
          ? getLeastLoadedWorkShift(day)
          : getLeastLoadedWorkShift(day, selectedShift);
      } else {
        return day;
      }

      return moveEmployeeToShift(day, employee, nextShift);
    }) ?? null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">근무표 생성</h1>
        <p className="text-sm text-gray-500 mt-1">대상 주를 선택하고 공평 지표 기반으로 자동 생성합니다</p>
      </div>

      <Card>
        <CardContent className="pt-6 flex items-end gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">시작 날짜 (일요일)</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => { setSelectedDate(e.target.value); setPreview(null); setSelectedEditDate(""); }}
              className="block border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "생성 중..." : "🗓 스케줄 자동 생성"}
          </Button>
          <Link href={`/schedule/month?month=${selectedDate.slice(0, 7)}`}>
            <Button variant="outline">월간 근무표</Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="border-blue-100 bg-blue-50/60">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-semibold text-blue-900">근무표 생성 룰</p>
          <div className="mt-3 grid gap-2 text-sm text-blue-800 md:grid-cols-2">
            <p>휴무는 하루 최대 4명까지만 배정합니다.</p>
            <p>직원별 주 2회 휴무를 목표로 하되, 슬롯이 부족하면 일부 직원은 1회가 될 수 있습니다.</p>
            <p>이틀 연속 휴무는 가능한 피하고, 필요할 때만 허용합니다.</p>
            <p>마감 다음날 오픈은 가능한 피하고, 직접 수정 시 경고로 표시합니다.</p>
            <p>오픈보다 마감 인원을 더 두텁게 배정합니다.</p>
            <p>공평 지표가 높은 직원은 선호 파트와 좋은 휴무를 우선 배정합니다.</p>
            <p>파트 성향은 부담 점수에 반영합니다.</p>
            <p>점장은 초안에서 날짜와 파트를 선택해 인원을 직접 조정할 수 있습니다.</p>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800">생성된 초안 — {weekLabel}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                휴무 제외 전 직원 근무 투입 · 공평 점수 높은 직원이 선호 파트 우선 배정
              </p>
            </div>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "확정 중..." : "✅ 확정하기"}
            </Button>
          </div>
          {saveError && <p className="text-sm text-red-500">{saveError}</p>}

          <ScheduleCalendar
            days={toCalendarDays(preview)}
            selectedDate={selectedDay?.date}
            onDaySelect={setSelectedEditDate}
          />

          {selectedDay && (
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {selectedDay.date} {selectedDay.dayLabel}요일
                  </p>
                  <p className="text-xs text-gray-400">휴무 {selectedDay.offEmployees.length}/{MAX_OFF_PER_DAY}</p>
                </div>
                {consecutiveOffNames.length > 0 && (
                  <p className="text-xs text-amber-600">연속 휴무: {consecutiveOffNames.join(", ")}</p>
                )}
                {closeOpenNames.length > 0 && (
                  <p className="text-xs text-red-500">마감 후 오픈: {closeOpenNames.join(", ")}</p>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {EDIT_SHIFT_TYPES.map((shiftType) => (
                  <button
                    key={shiftType}
                    type="button"
                    onClick={() => setSelectedShift(shiftType)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                      selectedShift === shiftType
                        ? SHIFT_STYLES[shiftType]
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {SHIFT_LABELS[shiftType]}
                  </button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {getDayEmployees(selectedDay).map((employee) => {
                  const currentShift = getEmployeeShift(selectedDay, employee.employeeId);
                  const checked = currentShift === selectedShift;
                  const offLimitReached = selectedShift === "off" && currentShift !== "off" && selectedDay.offEmployees.length >= MAX_OFF_PER_DAY;

                  return (
                    <label
                      key={employee.employeeId}
                      className={`flex min-h-12 items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm ${
                        checked ? SHIFT_STYLES[selectedShift] : "border-gray-200 bg-white text-gray-700"
                      } ${offLimitReached ? "opacity-45" : ""}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={offLimitReached}
                          onChange={(event) => handleToggleShift(employee, event.target.checked)}
                          className="size-4 rounded border-gray-300"
                        />
                        <span>{employee.employeeName}</span>
                      </span>
                      <span className="text-[11px] text-gray-400">{SHIFT_LABELS[currentShift]}</span>
                    </label>
                  );
                })}
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4">
                <p className="text-sm font-medium text-gray-700">배치 근거</p>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {getSelectedDayAssignments(selectedDay).map((assignment) => (
                    <div
                      key={`${assignment.shiftType}-${assignment.employeeName}`}
                      className="rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${SHIFT_STYLES[assignment.shiftType]}`}>
                          {SHIFT_LABELS[assignment.shiftType]}
                        </span>
                        <span className="text-sm font-medium text-gray-800">{assignment.employeeName}</span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-gray-500">
                        {assignment.reasons.length > 0 ? assignment.reasons.join(" · ") : "자동 배치"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          )}

        </>
      )}
    </div>
  );
}
