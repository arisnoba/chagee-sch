"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScheduleCalendar, type CalendarDay } from "@/components/schedule-calendar";
import type { DaySchedule } from "@/lib/scheduler/generate";
import type { ShiftType } from "@/lib/scheduler/fairness";
import type { WorkShiftPart } from "@/lib/shift-parts";

const MAX_OFF_PER_DAY = 4;
const DEFAULT_SHIFT_PARTS: WorkShiftPart[] = [
  { code: "open", label: "오픈", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
  { code: "middle", label: "미들", startTime: "12:00", endTime: "21:00", sortOrder: 1 },
  { code: "close", label: "마감", startTime: "15:00", endTime: "00:00", sortOrder: 2 },
];
const SHIFT_STYLE_CLASSES = [
  "bg-blue-100 text-blue-800 border-blue-200",
  "bg-green-100 text-green-800 border-green-200",
  "bg-orange-100 text-orange-800 border-orange-200",
  "bg-purple-100 text-purple-800 border-purple-200",
  "bg-cyan-100 text-cyan-800 border-cyan-200",
  "bg-rose-100 text-rose-800 border-rose-200",
];
const OFF_SHIFT_STYLE = "bg-gray-100 text-gray-600 border-gray-200";

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

function getShiftLabel(shiftParts: WorkShiftPart[], shiftType: ShiftType): string {
  if (shiftType === "off") return "휴무";
  return shiftParts.find((part) => part.code === shiftType)?.label ?? shiftType;
}

function getShiftStyle(shiftParts: WorkShiftPart[], shiftType: ShiftType): string {
  if (shiftType === "off") return OFF_SHIFT_STYLE;
  const index = shiftParts.findIndex((part) => part.code === shiftType);
  return SHIFT_STYLE_CLASSES[(index >= 0 ? index : 0) % SHIFT_STYLE_CLASSES.length];
}

function toCalendarDays(days: DaySchedule[], shiftParts: WorkShiftPart[]): CalendarDay[] {
  return days.map((day) => ({
    date: day.date,
    dayLabel: day.dayLabel,
    dayType: day.dayType,
    holidayName: day.holidayName,
    shifts: shiftParts
      .map((part) => ({
        shiftType: part.code,
        label: part.label,
        startTime: part.startTime,
        endTime: part.endTime,
        names: day.slots
          .filter((slot) => slot.shiftType === part.code)
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

function getCloseOpenNames(days: DaySchedule[], shiftParts: WorkShiftPart[]): string[] {
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const names: string[] = [];
  const firstShift = shiftParts[0]?.code;
  const lastShift = shiftParts[shiftParts.length - 1]?.code;
  if (!firstShift || !lastShift) return names;

  for (let index = 1; index < sortedDays.length; index++) {
    const previousDay = sortedDays[index - 1];
    const currentDay = sortedDays[index];
    const previousCloseIds = new Set(
      previousDay.slots
        .filter((slot) => slot.shiftType === lastShift)
        .map((slot) => slot.employeeId)
    );

    for (const slot of currentDay.slots) {
      if (slot.shiftType === firstShift && previousCloseIds.has(slot.employeeId)) {
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

function getLeastLoadedWorkShift(day: DaySchedule, shiftParts: WorkShiftPart[], excludeShift?: ShiftType): WorkShiftType {
  const counts = Object.fromEntries(shiftParts.map((part) => [part.code, 0]));
  for (const slot of day.slots) counts[slot.shiftType as WorkShiftType]++;

  return [...shiftParts]
    .map((part) => part.code)
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
    const knownOrder = ["open", "middle", "close", "off"];
    const shiftDiff = (knownOrder.indexOf(a.shiftType) === -1 ? 99 : knownOrder.indexOf(a.shiftType))
      - (knownOrder.indexOf(b.shiftType) === -1 ? 99 : knownOrder.indexOf(b.shiftType));
    if (shiftDiff !== 0) return shiftDiff;
    return a.employeeName.localeCompare(b.employeeName, "ko");
  });
}

export default function GeneratePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => formatDate(getSunday(new Date())));
  const [preview, setPreview] = useState<DaySchedule[] | null>(null);
  const [shiftParts, setShiftParts] = useState<WorkShiftPart[]>(DEFAULT_SHIFT_PARTS);
  const [weekLabel, setWeekLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generateError, setGenerateError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [selectedEditDate, setSelectedEditDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftType>("off");
  const consecutiveOffNames = useMemo(() => preview ? getConsecutiveOffNames(preview) : [], [preview]);
  const closeOpenNames = useMemo(() => preview ? getCloseOpenNames(preview, shiftParts) : [], [preview, shiftParts]);
  const selectedDay = useMemo(
    () => preview?.find((day) => day.date === selectedEditDate) ?? preview?.[0],
    [preview, selectedEditDate]
  );

  async function handleGenerate() {
    setGenerating(true);
    setGenerateError("");
    setSaveError("");
    const sunday = new Date(selectedDate);
    const label = getWeekLabel(sunday);
    setWeekLabel(label);

    try {
      const res = await fetch("/api/schedule/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekLabel: label, startDate: selectedDate }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setPreview(null);
        setSelectedEditDate("");
        setGenerateError(data?.error ?? "스케줄 생성에 실패했습니다.");
        return;
      }

      setShiftParts(data.shiftParts ?? DEFAULT_SHIFT_PARTS);
      setPreview(data.days);
      setSelectedEditDate(data.days[0]?.date ?? "");
      if (data.warning === "SCHEDULE_CONFIRMED") {
        setSaveError("이미 확정된 같은 주차 근무표가 있습니다. 확정 시 교체 여부를 확인합니다.");
      }
    } catch {
      setPreview(null);
      setSelectedEditDate("");
      setGenerateError("스케줄 생성 요청에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveAndConfirm(options: { replaceConfirmed?: boolean } = {}) {
    if (!preview) return;
    setSaving(true);
    setSaveError("");
    const saveRes = await fetch(`/api/schedule/${weekLabel}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ days: preview, replaceConfirmed: options.replaceConfirmed === true }),
    });

    if (!saveRes.ok) {
      const body = await saveRes.json().catch(() => null);
      if (saveRes.status === 409 && body?.code === "SCHEDULE_CONFIRMED" && !options.replaceConfirmed) {
        setSaving(false);
        setReplaceDialogOpen(true);
        return;
      }

      setSaveError(body?.error ?? "수정한 휴무를 저장하지 못했습니다.");
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

  async function handleConfirm() {
    await saveAndConfirm();
  }

  async function handleReplaceConfirmedSchedule() {
    setReplaceDialogOpen(false);
    await saveAndConfirm({ replaceConfirmed: true });
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
          ? getLeastLoadedWorkShift(day, shiftParts)
          : getLeastLoadedWorkShift(day, shiftParts, selectedShift);
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
              onChange={(e) => { setSelectedDate(e.target.value); setPreview(null); setSelectedEditDate(""); setGenerateError(""); setSaveError(""); }}
              className="block border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "생성 중..." : "🗓 스케줄 자동 생성"}
          </Button>
          <Link href={`/schedule/month?month=${selectedDate.slice(0, 7)}`}>
            <Button variant="outline">월간 근무표</Button>
          </Link>
          {generateError ? <p className="text-sm text-red-500">{generateError}</p> : null}
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
            days={toCalendarDays(preview, shiftParts)}
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
                  <p className="text-xs text-red-500">마지막 파트 후 첫 파트: {closeOpenNames.join(", ")}</p>
                )}
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                {[...shiftParts.map((part) => part.code), "off"].map((shiftType) => (
                  <button
                    key={shiftType}
                    type="button"
                    onClick={() => setSelectedShift(shiftType)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                      selectedShift === shiftType
                        ? getShiftStyle(shiftParts, shiftType)
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {getShiftLabel(shiftParts, shiftType)}
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
                        checked ? getShiftStyle(shiftParts, selectedShift) : "border-gray-200 bg-white text-gray-700"
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
                      <span className="text-[11px] text-gray-400">{getShiftLabel(shiftParts, currentShift)}</span>
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
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${getShiftStyle(shiftParts, assignment.shiftType)}`}>
                          {getShiftLabel(shiftParts, assignment.shiftType)}
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

          <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>같은 주차 근무표를 교체할까요?</AlertDialogTitle>
                <AlertDialogDescription>
                  이미 확정된 {weekLabel} 근무표가 있습니다. 새로 생성한 근무표로 기존 내용을 교체하고 다시 확정합니다.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>취소</AlertDialogCancel>
                <AlertDialogAction onClick={handleReplaceConfirmedSchedule}>
                  교체하기
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </div>
  );
}
