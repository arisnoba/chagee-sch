"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/lib/db/schema";

const DAY_LABELS: Record<string, string> = {
  mon: "월", tue: "화", wed: "수", thu: "목", fri: "금", sat: "토", sun: "일",
};

const PREF_LABELS: Record<string, string> = { like: "👍 선호", neutral: "😐 보통", dislike: "👎 기피" };
const PREF_COLORS: Record<string, string> = {
  like: "text-green-700 bg-green-50 border-green-200",
  neutral: "text-gray-500 bg-gray-50 border-gray-200",
  dislike: "text-red-600 bg-red-50 border-red-200",
};

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => { setEmployees(data); setLoading(false); });
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
        <p className="text-sm text-gray-500 mt-1">등록된 직원 목록과 파트 성향을 확인합니다</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const days: string[] = JSON.parse(emp.availableDays);
            return (
              <Card key={emp.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{emp.name}</CardTitle>
                    <Badge variant={emp.employmentType === "fulltime" ? "default" : "secondary"}>
                      {emp.employmentType === "fulltime" ? "풀타임" : "파트타임"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">근무 가능 요일</p>
                    <div className="flex gap-1 flex-wrap">
                      {["mon","tue","wed","thu","fri","sat","sun"].map((d) => (
                        <span
                          key={d}
                          className={`text-xs w-7 h-7 flex items-center justify-center rounded-full border font-medium ${
                            days.includes(d)
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-gray-50 text-gray-300 border-gray-200"
                          }`}
                        >
                          {DAY_LABELS[d]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">파트 성향</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: "오픈", value: emp.openPreference },
                        { label: "미들", value: emp.middlePreference },
                        { label: "마감", value: emp.closePreference },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className={`text-center rounded border px-1 py-1.5 text-xs ${PREF_COLORS[value]}`}
                        >
                          <div className="font-medium text-gray-700 mb-0.5">{label}</div>
                          <div>{PREF_LABELS[value]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
