"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Copy, Pencil, Printer, RotateCcw, Save, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScheduleCalendar, type CalendarDay } from "@/components/schedule-calendar";
import { parseLocalDate } from "@/lib/calendar/date";
import type { Schedule, ShiftLog, Employee } from "@/lib/db/schema";
import { calcFairnessScore, type ShiftType } from "@/lib/scheduler/fairness";
import type { DaySchedule } from "@/lib/scheduler/generate";
import type { WorkShiftPart } from "@/lib/shift-parts";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
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

type WeekData = {
  schedule: Schedule;
  logs: ShiftLog[];
  employees: Employee[];
  holidays?: Record<string, string>;
  shiftParts?: WorkShiftPart[];
};
type ScheduleEmployee = { employeeId: number; employeeName: string; reasons?: string[] };
type WorkShiftType = Exclude<ShiftType, "off">;

function buildEditableDays(
  dates: string[],
  byDate: Record<string, ShiftLog[]>,
  empMap: Record<number, string>,
  shiftParts: WorkShiftPart[],
  holidays: Record<string, string> = {}
): DaySchedule[] {
  return dates.map((date) => {
    const dayLogs = byDate[date] ?? [];
    const dow = parseLocalDate(date).getDay();
    const dayType = dayLogs[0]?.dayType ?? "weekday";
    const workLogs = dayLogs
      .filter((log) => log.shiftType !== "off")
      .sort((a, b) => {
        const left = shiftParts.findIndex((part) => part.code === a.shiftType);
        const right = shiftParts.findIndex((part) => part.code === b.shiftType);
        return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
      });

    return {
      date,
      dayLabel: DAY_LABELS[dow],
      dayType,
      holidayName: holidays[date],
      slots: workLogs
        .map((log) => ({
          shiftType: log.shiftType,
          employeeId: log.employeeId,
          employeeName: empMap[log.employeeId],
          reasons: ["저장된 근무표"],
        }))
        .filter((slot) => Boolean(slot.employeeName)),
      offEmployees: dayLogs
        .filter((log) => log.shiftType === "off")
        .map((log) => ({
          employeeId: log.employeeId,
          employeeName: empMap[log.employeeId],
          reasons: ["저장된 휴무"],
        }))
        .filter((employee) => Boolean(employee.employeeName)),
    };
  });
}

function buildEditableDaysFromData(data: WeekData): DaySchedule[] {
  const shiftParts = data.shiftParts ?? DEFAULT_SHIFT_PARTS;
  const empMap = Object.fromEntries(data.employees.map((employee) => [employee.id, employee.name]));
  const byDate = data.logs.reduce<Record<string, ShiftLog[]>>((acc, log) => {
    acc[log.date] = acc[log.date] ?? [];
    acc[log.date].push(log);
    return acc;
  }, {});

  return buildEditableDays(Object.keys(byDate).sort(), byDate, empMap, shiftParts, data.holidays);
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

function getShiftLabel(shiftParts: WorkShiftPart[], shiftType: ShiftType): string {
  if (shiftType === "off") return "휴무";
  return shiftParts.find((part) => part.code === shiftType)?.label ?? shiftType;
}

function getShiftStyle(shiftParts: WorkShiftPart[], shiftType: ShiftType): string {
  if (shiftType === "off") return OFF_SHIFT_STYLE;
  const index = shiftParts.findIndex((part) => part.code === shiftType);
  return SHIFT_STYLE_CLASSES[(index >= 0 ? index : 0) % SHIFT_STYLE_CLASSES.length];
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

function getSelectedDayAssignments(day: DaySchedule, shiftParts: WorkShiftPart[]): {
  shiftType: ShiftType;
  employeeName: string;
  reasons: string[];
}[] {
  const knownOrder = [...shiftParts.map((part) => part.code), "off"];

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
    const left = knownOrder.indexOf(a.shiftType) === -1 ? 99 : knownOrder.indexOf(a.shiftType);
    const right = knownOrder.indexOf(b.shiftType) === -1 ? 99 : knownOrder.indexOf(b.shiftType);
    if (left !== right) return left - right;
    return a.employeeName.localeCompare(b.employeeName, "ko");
  });
}

function toSyntheticLogs(days: DaySchedule[], weekLabel: string): ShiftLog[] {
  let nextId = 1;
  return days.flatMap((day) => [
    ...day.slots.map((slot) => ({
      id: nextId++,
      employeeId: slot.employeeId,
      date: day.date,
      shiftType: slot.shiftType,
      dayType: day.dayType,
      weekLabel,
      isConfirmed: false,
      createdAt: null,
    })),
    ...day.offEmployees.map((employee) => ({
      id: nextId++,
      employeeId: employee.employeeId,
      date: day.date,
      shiftType: "off",
      dayType: day.dayType,
      weekLabel,
      isConfirmed: false,
      createdAt: null,
    })),
  ]);
}

export default function WeekPage() {
  const { week } = useParams<{ week: string }>();
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [draftDays, setDraftDays] = useState<DaySchedule[]>([]);
  const [editing, setEditing] = useState(false);
  const [selectedEditDate, setSelectedEditDate] = useState("");
  const [selectedShift, setSelectedShift] = useState<ShiftType>("off");
  const [actionError, setActionError] = useState("");
  const [saving, setSaving] = useState(false);

  const shiftParts = data?.shiftParts ?? DEFAULT_SHIFT_PARTS;
  const selectedDay = useMemo(
    () => draftDays.find((day) => day.date === selectedEditDate) ?? draftDays[0],
    [draftDays, selectedEditDate]
  );
  const calendarDays = useMemo(() => toCalendarDays(draftDays, shiftParts), [draftDays, shiftParts]);
  const summaryRows = useMemo(() => {
    if (!data) return [];

    return data.employees
      .filter((employee) => employee.isActive || draftDays.some((day) => (
        day.slots.some((slot) => slot.employeeId === employee.id)
        || day.offEmployees.some((offEmployee) => offEmployee.employeeId === employee.id)
      )))
      .map((employee) => {
        const counts = Object.fromEntries(shiftParts.map((part) => [part.code, 0]));
        let offCount = 0;

        for (const day of draftDays) {
          for (const slot of day.slots) {
            if (slot.employeeId === employee.id) counts[slot.shiftType] = (counts[slot.shiftType] ?? 0) + 1;
          }
          if (day.offEmployees.some((offEmployee) => offEmployee.employeeId === employee.id)) offCount++;
        }

        return {
          employee,
          counts,
          offCount,
          totalCount: Object.values(counts).reduce((sum, count) => sum + Number(count), 0) + offCount,
        };
      });
  }, [data, draftDays, shiftParts]);
  const projectedScores = useMemo(() => {
    if (!data) return [];
    const logs = toSyntheticLogs(draftDays, week);
    return data.employees
      .filter((employee) => summaryRows.some((row) => row.employee.id === employee.id))
      .map((employee) => ({
        employee,
        score: calcFairnessScore(employee, logs),
      }))
      .sort((a, b) => b.score - a.score);
  }, [data, draftDays, summaryRows, week]);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch(`/api/schedule/${week}`);
        const body = await res.json().catch(() => null);
        if (ignore) return;

        if (!res.ok) {
          setData(null);
          setError(body?.error ?? "스케줄을 불러오지 못했습니다.");
          return;
        }

        setData(body);
        const nextDraftDays = buildEditableDaysFromData(body);
        setDraftDays(nextDraftDays);
        setSelectedEditDate(nextDraftDays[0]?.date ?? "");
        setEditing(false);
        setActionError("");
      } catch {
        if (!ignore) {
          setData(null);
          setError("스케줄 요청에 실패했습니다.");
        }
      } finally {
        if (ignore) return;
        setLoading(false);
      }
    }

    void load();

    return () => { ignore = true; };
	  }, [week]);

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (error) return <div className="text-center py-20 text-red-400">{error}</div>;
  if (!data) return <div className="text-center py-20 text-red-400">스케줄을 찾을 수 없습니다.</div>;

  async function handleCopyLink() {
    setShareMessage("");

    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareMessage("링크를 복사했습니다.");
    } catch {
      setShareMessage("링크를 복사하지 못했습니다.");
    }
  }

  function handlePrint() {
    window.print();
  }

  async function reloadSchedule() {
    const res = await fetch(`/api/schedule/${week}`);
    const body = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(body?.error ?? "스케줄을 다시 불러오지 못했습니다.");
    }

    setData(body);
    const nextDraftDays = buildEditableDaysFromData(body);
    setDraftDays(nextDraftDays);
    setSelectedEditDate(nextDraftDays[0]?.date ?? "");
    setEditing(false);
  }

  async function saveDraft(options: { confirmAfterSave?: boolean } = {}) {
    setSaving(true);
    setActionError("");

    try {
      const saveRes = await fetch(`/api/schedule/${week}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: draftDays, replaceConfirmed: true }),
      });
      const saveBody = await saveRes.json().catch(() => null);

      if (!saveRes.ok) {
        setActionError(saveBody?.error ?? "수정한 근무표를 저장하지 못했습니다.");
        return;
      }

      if (options.confirmAfterSave) {
        const confirmRes = await fetch(`/api/schedule/${week}`, { method: "PATCH" });
        if (!confirmRes.ok) {
          setActionError("근무표를 확정하지 못했습니다.");
          return;
        }
      }

      await reloadSchedule();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "근무표 저장 요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirmSchedule() {
    setSaving(true);
    setActionError("");

    try {
      const confirmRes = await fetch(`/api/schedule/${week}`, { method: "PATCH" });
      if (!confirmRes.ok) {
        setActionError("근무표를 확정하지 못했습니다.");
        return;
      }
      await reloadSchedule();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "근무표 확정 요청에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function handleStartEdit() {
    const nextDraftDays = buildEditableDaysFromData(data);
    setDraftDays(nextDraftDays);
    setSelectedEditDate(nextDraftDays[0]?.date ?? "");
    setActionError("");
    setEditing(true);
  }

  function handleCancelEdit() {
    const nextDraftDays = buildEditableDaysFromData(data);
    setDraftDays(nextDraftDays);
    setSelectedEditDate(nextDraftDays[0]?.date ?? "");
    setActionError("");
    setEditing(false);
  }

  function handleToggleShift(employee: ScheduleEmployee, checked: boolean) {
    if (!selectedDay) return;

    setDraftDays((current) => current.map((day) => {
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
    }));
  }

  const { schedule } = data;
  const scheduleMonth = schedule.startDate.slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{week} 근무표</h1>
          <p className="text-sm text-gray-500 mt-1">시작일: {schedule.startDate}</p>
          {shareMessage ? (
            <p className="no-print mt-1 text-xs text-gray-500">{shareMessage}</p>
          ) : null}
        </div>
        <div className="no-print flex flex-wrap items-center gap-3">
          <Badge variant={schedule.status === "confirmed" ? "default" : "secondary"}>
            {schedule.status === "confirmed" ? "✅ 확정됨" : "초안"}
          </Badge>
          {editing ? (
            <>
              <Button onClick={() => saveDraft()} disabled={saving}>
                <Save className="size-4" aria-hidden="true" />
                {saving ? "저장 중..." : "수정 저장"}
              </Button>
              <Button variant="outline" onClick={() => saveDraft({ confirmAfterSave: true })} disabled={saving}>
                <CheckCircle2 className="size-4" aria-hidden="true" />
                저장 후 확정
              </Button>
              <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                <X className="size-4" aria-hidden="true" />
                취소
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={handleStartEdit} disabled={saving || draftDays.length === 0}>
                <Pencil className="size-4" aria-hidden="true" />
                수정
              </Button>
              {schedule.status === "confirmed" ? (
                <Button variant="outline" onClick={() => saveDraft()} disabled={saving || draftDays.length === 0}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  초안으로 되돌리기
                </Button>
              ) : (
                <Button onClick={handleConfirmSchedule} disabled={saving || draftDays.length === 0}>
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  {saving ? "확정 중..." : "확정하기"}
                </Button>
              )}
            </>
          )}
          <Button variant="outline" onClick={handleCopyLink}>
            <Copy className="size-4" aria-hidden="true" />
            링크 복사
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="size-4" aria-hidden="true" />
            인쇄
          </Button>
          <Link href="/schedule/generate">
            <Button variant="outline">새 스케줄 생성</Button>
          </Link>
          <Link href={`/schedule/month?month=${scheduleMonth}`}>
            <Button variant="outline">월간 근무표</Button>
          </Link>
          <Link href="/">
            <Button variant="outline">대시보드</Button>
          </Link>
        </div>
      </div>
      {actionError ? <p className="no-print text-sm text-red-500">{actionError}</p> : null}

      <ScheduleCalendar
        days={calendarDays}
        selectedDate={editing ? selectedDay?.date : undefined}
        onDaySelect={editing ? setSelectedEditDate : undefined}
      />

      {editing && selectedDay ? (
        <Card className="no-print">
          <CardContent className="pt-4 pb-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-700">
                  {selectedDay.date} {selectedDay.dayLabel}요일 수정
                </p>
                <p className="text-xs text-gray-400">휴무 {selectedDay.offEmployees.length}/{MAX_OFF_PER_DAY}</p>
              </div>
              <p className="text-xs text-gray-500">
                날짜를 선택한 뒤 파트를 고르고 직원을 체크하면 즉시 반영됩니다.
              </p>
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {[...shiftParts.map((part) => part.code), "off"].map((shiftType) => (
                <button
                  key={shiftType}
                  type="button"
                  aria-pressed={selectedShift === shiftType}
                  onClick={() => setSelectedShift(shiftType)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
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

            <div className="mt-5 grid gap-4 border-t border-gray-100 pt-4 lg:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-gray-700">배치 근거</p>
                <div className="mt-2 grid gap-2">
                  {getSelectedDayAssignments(selectedDay, shiftParts).map((assignment) => (
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

              <div>
                <p className="text-sm font-medium text-gray-700">수정 후 공평 지표</p>
                <div className="mt-2 overflow-hidden rounded-md border border-gray-100">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">직원</th>
                        <th className="px-3 py-2 text-right font-medium">점수</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {projectedScores.map(({ employee, score }) => (
                        <tr key={employee.id}>
                          <td className="px-3 py-2 font-medium text-gray-700">{employee.name}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-700">{score.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-gray-50">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">직원별 이번 주 요약</p>
          <div className="rounded-lg border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">직원</TableHead>
                  {shiftParts.map((part) => (
                    <TableHead key={part.code} className="text-right">
                      {part.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">휴무</TableHead>
                  <TableHead className="pr-4 text-right">합계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={shiftParts.length + 3}
                      className="h-20 text-center text-gray-400"
                    >
                      이번 주 근무 기록이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  summaryRows.map(({ employee, counts, offCount, totalCount }) => (
                    <TableRow key={employee.id}>
                      <TableCell className="pl-4 font-medium text-gray-800">
                        {employee.name}
                      </TableCell>
                      {shiftParts.map((part) => (
                        <TableCell key={part.code} className="text-right text-gray-600">
                          {counts[part.code] ?? 0}
                        </TableCell>
                      ))}
                      <TableCell className="text-right text-gray-600">{offCount}</TableCell>
                      <TableCell className="pr-4 text-right font-medium text-gray-800">
                        {totalCount}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
