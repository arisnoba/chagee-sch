"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DaySchedule } from "@/lib/scheduler/generate";

const SHIFT_LABELS: Record<string, string> = { open: "오픈", middle: "미들", close: "마감" };
const SHIFT_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  middle: "bg-green-100 text-green-800",
  close: "bg-orange-100 text-orange-800",
};
const DAY_TYPE_LABELS: Record<string, string> = { weekday: "평일", weekend: "주말", holiday: "공휴일" };
const DAY_TYPE_COLORS: Record<string, string> = { weekday: "secondary", weekend: "outline", holiday: "destructive" };

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

export default function GeneratePage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(() => formatDate(getMonday(new Date())));
  const [preview, setPreview] = useState<DaySchedule[] | null>(null);
  const [weekLabel, setWeekLabel] = useState("");
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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
    }
    setGenerating(false);
  }

  async function handleConfirm() {
    setSaving(true);
    await fetch(`/api/schedule/${weekLabel}`, { method: "PATCH" });
    router.push(`/schedule/${weekLabel}`);
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
              onChange={(e) => { setSelectedDate(e.target.value); setPreview(null); }}
              className="block border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? "생성 중..." : "🗓 스케줄 자동 생성"}
          </Button>
        </CardContent>
      </Card>

      {preview && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">생성된 초안 — {weekLabel}</h2>
            <Button onClick={handleConfirm} disabled={saving}>
              {saving ? "확정 중..." : "✅ 확정하기"}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {preview.map((day) => (
              <Card key={day.date} className={day.dayType !== "weekday" ? "border-orange-200 bg-orange-50/30" : ""}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      {day.dayLabel}요일 <span className="text-sm font-normal text-gray-500">{day.date.slice(5)}</span>
                    </CardTitle>
                    <Badge variant={DAY_TYPE_COLORS[day.dayType] as "secondary" | "outline" | "destructive"}>
                      {DAY_TYPE_LABELS[day.dayType]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {day.slots.map((slot, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${SHIFT_COLORS[slot.shiftType]}`}>
                        {SHIFT_LABELS[slot.shiftType]}
                      </span>
                      <span className="text-gray-700 font-medium">{slot.employeeName}</span>
                    </div>
                  ))}
                  {day.offEmployees.length > 0 && (
                    <div className="pt-1 border-t border-gray-100">
                      <p className="text-xs text-gray-400 mb-1">휴무</p>
                      <p className="text-xs text-gray-500">{day.offEmployees.map((o) => o.employeeName).join(", ")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4 pb-4">
              <p className="text-sm text-blue-800 font-medium">💡 생성 기준</p>
              <p className="text-sm text-blue-700 mt-1">
                공평 지표가 높은 직원(더 힘든 근무를 소화한 직원)에게 선호 파트 및 좋은 휴무를 우선 배정했습니다.
                성향(like/dislike)은 부담 가중치에 ×0.5/×1.5로 반영됩니다.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
