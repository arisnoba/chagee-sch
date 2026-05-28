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
const WORK_SHIFT_TYPES = ["open", "middle", "close"] as const;
const EDIT_SHIFT_TYPES = ["open", "middle", "close", "off"] as const;
const SHIFT_LABELS: Record<ShiftType, string> = { open: "오픈", middle: "미들", close: "마감", off: "휴무" };
const SHIFT_STYLES: Record<ShiftType, string> = {
  open: "bg-blue-100 text-blue-800 border-blue-200",
  middle: "bg-green-100 text-green-800 border-green-200",
  close: "bg-orange-100 text-orange-800 border-orange-200",
  off: "bg-gray-100 text-gray-600 border-gray-200",
};

type WorkShiftType = Exclude<ShiftType, "off">;
type ScheduleEmployee = { employeeId: number; employeeName: string };

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekLabel(monday: Date): string {
  const start = new Date(monday.getFullYear(), 0, 1);
  const week = Math.ceil(((monday.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
  return `${monday.getFullYear()}-W${String(week).padStart(2, "0")}`;
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
    employees.set(slot.employeeId, { employeeId: slot.employeeId, employeeName: slot.employeeName });
  }
  for (const employee of day.offEmployees) {
    employees.set(employee.employeeId, employee);
  }

  return [...employees.values()];
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

  if (shiftType === "off") {
    return { ...day, slots, offEmployees: [...offEmployees, employee] };
  }

  return {
    ...day,
    slots: [...slots, { shiftType, ...employee }],
    offEmployees,
  };
}

export default function GeneratePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => formatDate(getMonday(new Date())));
  const [preview, setPreview] = useState<DaySchedule[] | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [selectedEditDate, setSelectedEditDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftType>("off");
  const consecutiveOffNames = useMemo(() => preview ? getConsecutiveOffNames(preview) : [], [preview]);
  const selectedDay = useMemo(
    () => preview?.find((day) => day.date === selectedEditDate) ?? preview?.[0],
    [preview, selectedEditDate]
  );

  async function handleGenerate() {
    setGenerating(true);
    const monday = new Date(selectedDate);
    const label = getWeekLabel(monday);
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
            <label className="text-sm font-medium text-gray-700">시작 날짜 (월요일)</label>
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
            </CardContent>
          </Card>
          )}

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-blue-800 font-medium">💡 생성 기준</p>
              <p className="text-sm text-blue-700 mt-1">
                공평 지표가 높은 직원(보상 우선)부터 선호 파트를 우선 배정합니다.
                주말·공휴일 휴무도 보상 우선 직원에게 먼저 돌아갑니다.
                성향(👍/👎)은 부담 가중치에 ×0.5/×1.5로 반영됩니다.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
