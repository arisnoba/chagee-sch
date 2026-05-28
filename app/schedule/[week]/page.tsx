"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScheduleCalendar, type CalendarDay } from "@/components/schedule-calendar";
import type { Schedule, ShiftLog, Employee } from "@/lib/db/schema";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type WeekData = { schedule: Schedule; logs: ShiftLog[]; employees: Employee[]; holidays?: Record<string, string> };

function buildCalendarDays(
  dates: string[],
  byDate: Record<string, ShiftLog[]>,
  empMap: Record<number, string>,
  holidays: Record<string, string> = {}
): CalendarDay[] {
  return dates.map((date) => {
    const dayLogs = byDate[date];
    const dow = new Date(date).getDay();
    const dayType = dayLogs[0]?.dayType ?? "weekday";
    const workLogs = dayLogs
      .filter((log) => log.shiftType !== "off")
      .sort((a, b) => {
        const order = { open: 0, middle: 1, close: 2 };
        return (order[a.shiftType as keyof typeof order] ?? 3) - (order[b.shiftType as keyof typeof order] ?? 3);
      });

    return {
      date,
      dayLabel: DAY_LABELS[dow],
      dayType,
      holidayName: holidays[date],
      shifts: (["open", "middle", "close"] as const)
        .map((shiftType) => ({
          shiftType,
          names: workLogs
            .filter((log) => log.shiftType === shiftType)
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

export default function WeekPage() {
  const { week } = useParams<{ week: string }>();
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    fetch(`/api/schedule/${week}`)
      .then((r) => r.json())
      .then((d) => {
        if (ignore) return;
        setData(d);
        setLoading(false);
      });

    return () => { ignore = true; };
  }, [week]);

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!data) return <div className="text-center py-20 text-red-400">스케줄을 찾을 수 없습니다.</div>;

  const { schedule, logs, employees } = data;
  const scheduleMonth = schedule.startDate.slice(0, 7);
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  const byDate = logs.reduce<Record<string, ShiftLog[]>>((acc, log) => {
    acc[log.date] = acc[log.date] ?? [];
    acc[log.date].push(log);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort();
  const calendarDays = buildCalendarDays(dates, byDate, empMap, data.holidays);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{week} 근무표</h1>
          <p className="text-sm text-gray-500 mt-1">시작일: {schedule.startDate}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={schedule.status === "confirmed" ? "default" : "secondary"}>
            {schedule.status === "confirmed" ? "✅ 확정됨" : "초안"}
          </Badge>
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

      <ScheduleCalendar days={calendarDays} />

      <Card className="bg-gray-50">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">직원별 이번 주 요약</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {employees.map((emp) => {
              const empLogs = logs.filter((l) => l.employeeId === emp.id);
              const counts = { open: 0, middle: 0, close: 0, off: 0 };
              empLogs.forEach((l) => { counts[l.shiftType as keyof typeof counts]++; });
              return (
                <div key={emp.id} className="bg-white rounded border p-2 text-xs">
                  <p className="font-semibold text-gray-800 mb-1">{emp.name}</p>
                  <div className="space-y-0.5 text-gray-600">
                    <p>오픈 {counts.open} · 미들 {counts.middle}</p>
                    <p>마감 {counts.close} · 휴무 {counts.off}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
