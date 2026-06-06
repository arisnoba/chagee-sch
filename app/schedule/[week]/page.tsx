"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Copy, Printer } from "lucide-react";
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
import type { Schedule, ShiftLog, Employee } from "@/lib/db/schema";
import type { WorkShiftPart } from "@/lib/shift-parts";

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type WeekData = {
  schedule: Schedule;
  logs: ShiftLog[];
  employees: Employee[];
  holidays?: Record<string, string>;
  shiftParts?: WorkShiftPart[];
};

function buildCalendarDays(
  dates: string[],
  byDate: Record<string, ShiftLog[]>,
  empMap: Record<number, string>,
  shiftParts: WorkShiftPart[],
  holidays: Record<string, string> = {}
): CalendarDay[] {
  return dates.map((date) => {
    const dayLogs = byDate[date];
    const dow = new Date(date).getDay();
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

export default function WeekPage() {
  const { week } = useParams<{ week: string }>();
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");

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

  const { schedule, logs, employees } = data;
  const shiftParts = data.shiftParts ?? [
    { code: "open", label: "오픈", startTime: "09:00", endTime: "18:00", sortOrder: 0 },
    { code: "middle", label: "미들", startTime: "12:00", endTime: "21:00", sortOrder: 1 },
    { code: "close", label: "마감", startTime: "15:00", endTime: "00:00", sortOrder: 2 },
  ];
  const scheduleMonth = schedule.startDate.slice(0, 7);
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  const byDate = logs.reduce<Record<string, ShiftLog[]>>((acc, log) => {
    acc[log.date] = acc[log.date] ?? [];
    acc[log.date].push(log);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort();
  const calendarDays = buildCalendarDays(dates, byDate, empMap, shiftParts, data.holidays);
  const summaryRows = employees
    .filter((emp) => emp.isActive || logs.some((log) => log.employeeId === emp.id))
    .map((emp) => {
      const empLogs = logs.filter((log) => log.employeeId === emp.id);
      const counts = Object.fromEntries(shiftParts.map((part) => [part.code, 0]));
      let offCount = 0;

      empLogs.forEach((log) => {
        if (log.shiftType === "off") {
          offCount++;
          return;
        }

        counts[log.shiftType] = (counts[log.shiftType] ?? 0) + 1;
      });

      return {
        employee: emp,
        counts,
        offCount,
        totalCount: empLogs.length,
      };
    });

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

      <ScheduleCalendar days={calendarDays} />

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
