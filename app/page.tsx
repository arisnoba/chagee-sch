"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import type { EmployeeWithScore } from "@/lib/scheduler/fairness";

const PREF_COLORS = { like: "text-green-600 bg-green-50", neutral: "text-gray-500 bg-gray-100", dislike: "text-red-500 bg-red-50" };
const PREF_ICONS = { like: "👍", neutral: "😐", dislike: "👎" };

function PreferenceBadge({ label, value }: { label: string; value: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${PREF_COLORS[value as keyof typeof PREF_COLORS]}`}>
      {PREF_ICONS[value as keyof typeof PREF_ICONS]} {label}
    </span>
  );
}

type Tier = "보상 우선" | "양호" | "꿀";

function getTier(score: number, thresholds: { low: number; high: number }): Tier {
  if (score >= thresholds.high) return "보상 우선";
  if (score <= thresholds.low) return "꿀";
  return "양호";
}

function getTierStyle(tier: Tier) {
  if (tier === "보상 우선") return { badge: "destructive" as const, bar: "#ef4444" };
  if (tier === "꿀") return { badge: null, bar: "#eab308", className: "bg-yellow-100 text-yellow-800 border border-yellow-300" };
  return { badge: "secondary" as const, bar: "#6b7280" };
}

export default function DashboardPage() {
  const [scores, setScores] = useState<EmployeeWithScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  async function loadScores() {
    setLoading(true);
    const res = await fetch("/api/fairness");
    if (res.ok) setScores(await res.json());
    setLoading(false);
  }

  async function handleSetup() {
    setSeeding(true);
    await fetch("/api/migrate", { method: "POST" });
    await fetch("/api/seed", { method: "POST" });
    await loadScores();
    setSeeding(false);
  }

  useEffect(() => {
    let ignore = false;

    fetch("/api/fairness")
      .then((res) => res.ok ? res.json() : [])
      .then((data) => {
        if (ignore) return;
        setScores(data);
        setLoading(false);
      });

    return () => { ignore = true; };
  }, []);

  // 3단계 티어 임계값: 하위 1/3 = 꿀, 상위 1/3 = 보상우선
  const sortedAsc = [...scores].map((e) => e.fairnessScore).sort((a, b) => a - b);
  const n = sortedAsc.length;
  const thresholds = {
    low: n > 0 ? (sortedAsc[Math.ceil(n / 3) - 1] ?? 0) : 0,   // 꿀: score <= low
    high: n > 0 ? (sortedAsc[Math.floor(2 * n / 3)] ?? 0) : 0, // 보상우선: score >= high
  };

  const chartData = [...scores].reverse();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">직원별 공평 지표를 확인하고 근무표를 생성하세요</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={handleSetup} disabled={seeding}>
            {seeding ? "설정 중..." : "🔄 목업 데이터 초기화"}
          </Button>
          <Link href="/schedule/generate">
            <Button>근무표 생성하기 →</Button>
          </Link>
          <Link href="/schedule/month">
            <Button variant="outline">월간 근무표</Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : scores.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <p className="text-gray-500">데이터가 없습니다. 목업 데이터를 초기화하세요.</p>
            <Button onClick={handleSetup} disabled={seeding}>
              {seeding ? "설정 중..." : "목업 데이터 초기화"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* 티어 범례 */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block" />
              <span className="font-medium text-red-700">보상 우선</span>
              <span className="text-gray-500">— 힘든 근무를 많이 소화한 직원, 다음 배정 우선권</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-gray-400 inline-block" />
              <span className="font-medium text-gray-600">양호</span>
              <span className="text-gray-500">— 균형 잡힌 상태</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <span className="w-3 h-3 rounded-full bg-yellow-400 inline-block" />
              <span className="font-medium text-yellow-700">꿀</span>
              <span className="text-gray-500">— 좋은 근무 위주, 다음 배정 시 고려 필요</span>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                공평 지표 — 높을수록 더 힘든 근무를 소화한 직원 (다음 좋은 근무 우선 배정)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 48 }}>
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={72} tick={{ fontSize: 13 }} />
                  <Tooltip
                    formatter={(val) => {
                      const n = typeof val === "number" ? val : Number(val);
                      return [`${n.toFixed(1)}점`, "공평 지표"];
                    }}
                    cursor={{ fill: "#f3f4f6" }}
                  />
                  <Bar dataKey="fairnessScore" radius={[0, 4, 4, 0]} fill="#22c55e" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">직원별 상세</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">이름</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">파트 성향</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">공평 지표</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scores.map((emp) => {
                    const tier = getTier(emp.fairnessScore, thresholds);
                    const style = getTierStyle(tier);
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium">{emp.name}</td>
                        <td className="px-4 py-3">
                          <span className="flex gap-1 flex-wrap">
                            <PreferenceBadge label="오픈" value={emp.openPreference} />
                            <PreferenceBadge label="미들" value={emp.middlePreference} />
                            <PreferenceBadge label="마감" value={emp.closePreference} />
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">
                          {emp.fairnessScore.toFixed(1)}
                        </td>
                        <td className="px-4 py-3">
                          {style.badge ? (
                            <Badge variant={style.badge}>{tier}</Badge>
                          ) : (
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.className}`}>
                              {tier}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
