"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Schedule, ShiftLog, Employee } from "@/lib/db/schema";

const SHIFT_LABELS: Record<string, string> = { open: "오픈", middle: "미들", close: "마감", off: "휴무" };
const SHIFT_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  middle: "bg-green-100 text-green-800",
  close: "bg-orange-100 text-orange-800",
  off: "bg-gray-100 text-gray-500",
};
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type WeekData = {
  schedule: Schedule;
  logs: ShiftLog[];
  employees: Employee[];
};

export default function WeekPage() {
  const { week } = useParams<{ week: string }>();
  const [data, setData] = useState<WeekData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/schedule/${week}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); });
  }, [week]);

  if (loading) return <div className="text-center py-20 text-gray-400">불러오는 중...</div>;
  if (!data) return <div className="text-center py-20 text-red-400">스케줄을 찾을 수 없습니다.</div>;

  const { schedule, logs, employees } = data;
  const empMap = Object.fromEntries(employees.map((e) => [e.id, e.name]));

  // 날짜별로 그룹핑
  const byDate = logs.reduce<Record<string, ShiftLog[]>>((acc, log) => {
    acc[log.date] = acc[log.date] ?? [];
    acc[log.date].push(log);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort();

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
          <Link href="/">
            <Button variant="outline">대시보드</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {dates.map((date) => {
          const dayLogs = byDate[date];
          const dow = new Date(date).getDay();
          const dayType = dayLogs[0]?.dayType ?? "weekday";
          const shifts = dayLogs.filter((l) => l.shiftType !== "off").sort((a, b) => {
            const order = { open: 0, middle: 1, close: 2 };
            return (order[a.shiftType as keyof typeof order] ?? 3) - (order[b.shiftType as keyof typeof order] ?? 3);
          });
          const offs = dayLogs.filter((l) => l.shiftType === "off");

          return (
            <Card key={date} className={dayType !== "weekday" ? "border-orange-200 bg-orange-50/30" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">
                    {DAY_LABELS[dow]}요일 <span className="text-sm font-normal text-gray-500">{date.slice(5)}</span>
                  </CardTitle>
                  {dayType === "holiday" && <Badge variant="destructive">공휴일</Badge>}
                  {dayType === "weekend" && <Badge variant="outline">주말</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {shifts.map((log) => (
                  <div key={log.id} className="flex items-center justify-between text-sm">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${SHIFT_COLORS[log.shiftType]}`}>
                      {SHIFT_LABELS[log.shiftType]}
                    </span>
                    <span className="text-gray-700 font-medium">{empMap[log.employeeId]}</span>
                  </div>
                ))}
                {offs.length > 0 && (
                  <div className="pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-400 mb-1">휴무 ({offs.length}명)</p>
                    <p className="text-xs text-gray-500">{offs.map((o) => empMap[o.employeeId]).join(", ")}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="bg-gray-50">
        <CardContent className="pt-4 pb-4">
          <p className="text-sm font-medium text-gray-700 mb-2">직원별 이번 주 요약</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {employees.map((emp) => {
              const empLogs = logs.filter((l) => l.employeeId === emp.id);
              const shiftCounts = { open: 0, middle: 0, close: 0, off: 0 };
              empLogs.forEach((l) => { shiftCounts[l.shiftType as keyof typeof shiftCounts]++; });
              return (
                <div key={emp.id} className="bg-white rounded border p-2 text-xs">
                  <p className="font-semibold text-gray-800 mb-1">{emp.name}</p>
                  <div className="space-y-0.5 text-gray-600">
                    <p>오픈 {shiftCounts.open}회 · 미들 {shiftCounts.middle}회</p>
                    <p>마감 {shiftCounts.close}회 · 휴무 {shiftCounts.off}일</p>
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
