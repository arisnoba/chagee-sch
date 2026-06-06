"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { MonthScheduleCalendar, type MonthCalendarDay } from "@/components/month-schedule-calendar";
import type { Employee, ShiftLog } from "@/lib/db/schema";
import type { DayType } from "@/lib/scheduler/fairness";
import type { WorkShiftPart } from "@/lib/shift-parts";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type MonthData = {
  month: string;
  dates: string[];
  logs: ShiftLog[];
  employees: Employee[];
  holidays?: Record<string, string>;
  shiftParts?: WorkShiftPart[];
};

function formatMonth(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function shiftMonth(month: string, diff: number): string {
  const [year, monthIndex] = month.split("-").map(Number);
  return formatMonth(new Date(year, monthIndex - 1 + diff, 1));
}

function getMonthDates(month: string): string[] {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();

  return Array.from({ length: lastDay }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return `${month}-${day}`;
  });
}

function buildEmptyMonthData(month: string): MonthData {
  return {
    month,
    dates: getMonthDates(month),
    logs: [],
    employees: [],
    holidays: {},
    shiftParts: [
      { code: "open", label: "오픈", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
      { code: "middle", label: "미들", startTime: "12:00", endTime: "21:00", sortOrder: 1 },
      { code: "close", label: "마감", startTime: "15:00", endTime: "00:00", sortOrder: 2 },
    ],
  };
}

function getFallbackDayType(date: string, holidays: Record<string, string>): DayType {
  if (holidays[date]) return "holiday";
  const dow = new Date(date).getDay();
  return dow === 0 || dow === 6 ? "weekend" : "weekday";
}

function buildMonthCalendarDays(data: MonthData): MonthCalendarDay[] {
  const empMap = Object.fromEntries(data.employees.map((employee) => [employee.id, employee.name]));
  const holidays = data.holidays ?? {};
  const shiftParts = data.shiftParts ?? [
    { code: "open", label: "오픈", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
    { code: "middle", label: "미들", startTime: "12:00", endTime: "21:00", sortOrder: 1 },
    { code: "close", label: "마감", startTime: "15:00", endTime: "00:00", sortOrder: 2 },
  ];
  const byDate = data.logs.reduce<Record<string, ShiftLog[]>>((acc, log) => {
    acc[log.date] = acc[log.date] ?? [];
    acc[log.date].push(log);
    return acc;
  }, {});

  return data.dates.map((date) => {
    const dayLogs = byDate[date] ?? [];
    const workLogs = dayLogs
      .filter((log) => log.shiftType !== "off")
      .sort((a, b) => {
        const left = shiftParts.findIndex((part) => part.code === a.shiftType);
        const right = shiftParts.findIndex((part) => part.code === b.shiftType);
        return (left === -1 ? 99 : left) - (right === -1 ? 99 : right);
      });
    const dow = new Date(date).getDay();

    return {
      date,
      dayLabel: DAY_LABELS[dow],
      dayType: dayLogs[0]?.dayType ?? getFallbackDayType(date, holidays),
      holidayName: holidays[date],
      hasSchedule: dayLogs.length > 0,
      shifts: shiftParts
        .map((part) => ({
          shiftType: part.code,
          label: part.label,
          startTime: part.startTime,
          endTime: part.endTime,
          names: workLogs
            .filter((log) => log.shiftType === part.code)
            .map((log) => empMap[log.employeeId])
            .filter(Boolean),
        }))
        .filter((shift) => shift.names.length > 0),
      offNames: dayLogs
        .filter((log) => log.shiftType === "off")
        .map((log) => empMap[log.employeeId])
        .filter(Boolean),
    };
  });
}

function MonthScheduleContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedMonth = searchParams.get("month");
  const month = requestedMonth && /^\d{4}-\d{2}$/.test(requestedMonth)
    ? requestedMonth
    : formatMonth(new Date());
  const [data, setData] = useState<MonthData | null>(null);
  const [errorMonth, setErrorMonth] = useState<string | null>(null);
  const error = errorMonth === month;

  useEffect(() => {
    let ignore = false;

    fetch(`/api/schedule/month?month=${month}`)
      .then((res) => {
        if (!res.ok) throw new Error("월간 근무표 요청 실패");
        return res.json();
      })
      .then((nextData) => {
        if (ignore) return;
        setData(nextData);
        setErrorMonth(null);
      })
      .catch(() => {
        if (ignore) return;
        setErrorMonth(month);
      });

    return () => { ignore = true; };
  }, [month]);

  const calendarDays = useMemo(() => {
    const displayData = data?.month === month ? data : buildEmptyMonthData(month);
    return buildMonthCalendarDays(displayData);
  }, [data, month]);
  const loading = !data || data.month !== month;

  function moveMonth(diff: number) {
    router.push(`/schedule/month?month=${shiftMonth(month, diff)}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">월간 근무표</h1>
          <p className="text-sm text-gray-500 mt-1">저장된 근무표를 한 달 단위로 확인합니다</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => moveMonth(-1)}>이전 달</Button>
          <input
            type="month"
            value={month}
            onChange={(event) => router.push(`/schedule/month?month=${event.target.value}`)}
            className="h-9 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Button variant="outline" onClick={() => moveMonth(1)}>다음 달</Button>
          <Link href="/schedule/generate">
            <Button>근무표 생성</Button>
          </Link>
        </div>
      </div>

      {loading && !error && (
        <div className="text-center text-sm text-gray-400">저장된 근무표를 불러오는 중입니다.</div>
      )}
      {error && (
        <div className="text-center text-sm text-red-400">저장된 근무표를 불러오지 못해 달력만 표시합니다.</div>
      )}

      <MonthScheduleCalendar days={calendarDays} />
    </div>
  );
}

export default function MonthSchedulePage() {
  return (
    <Suspense fallback={<div className="text-center py-20 text-gray-400">불러오는 중...</div>}>
      <MonthScheduleContent />
    </Suspense>
  );
}
