"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee } from "@/lib/db/schema";

const PREF_LABELS: Record<string, string> = { like: "👍 선호", neutral: "😐 보통", dislike: "👎 기피" };
const PREF_COLORS: Record<string, string> = {
  like: "text-green-700 bg-green-50 border-green-200",
  neutral: "text-gray-500 bg-gray-50 border-gray-200",
  dislike: "text-red-600 bg-red-50 border-red-200",
};
const PREF_OPTIONS = ["like", "neutral", "dislike"] as const;
const PREF_OPTION_LABELS: Record<string, string> = { like: "👍 선호", neutral: "😐 보통", dislike: "👎 기피" };

type PrefForm = { openPreference: string; middlePreference: string; closePreference: string };

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<PrefForm | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const data = await fetch("/api/employees").then((r) => r.json());
    setEmployees(data);
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;

    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => {
        if (ignore) return;
        setEmployees(data);
        setLoading(false);
      });

    return () => { ignore = true; };
  }, []);

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setEditForm({
      openPreference: emp.openPreference,
      middlePreference: emp.middlePreference,
      closePreference: emp.closePreference,
    });
  }

  async function saveEdit(empId: number) {
    if (!editForm) return;
    setSaving(true);
    await fetch(`/api/employees/${empId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    setEditingId(null);
    setEditForm(null);
    setSaving(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
        <p className="text-sm text-gray-500 mt-1">직원별 파트 성향을 확인하고 수정합니다</p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map((emp) => {
            const isEditing = editingId === emp.id;

            return (
              <Card key={emp.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{emp.name}</CardTitle>
                    <Badge variant="outline">스케줄 근무</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-medium text-gray-500">파트 성향</p>
                      {!isEditing ? (
                        <button
                          onClick={() => startEdit(emp)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          수정
                        </button>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(emp.id)}
                            disabled={saving}
                            className="text-xs text-green-600 hover:text-green-800 font-medium"
                          >
                            {saving ? "저장 중" : "저장"}
                          </button>
                          <button
                            onClick={() => { setEditingId(null); setEditForm(null); }}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            취소
                          </button>
                        </div>
                      )}
                    </div>

                    {!isEditing ? (
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
                    ) : (
                      <div className="grid grid-cols-3 gap-1.5">
                        {([
                          { key: "openPreference" as const, label: "오픈" },
                          { key: "middlePreference" as const, label: "미들" },
                          { key: "closePreference" as const, label: "마감" },
                        ] as const).map(({ key, label }) => (
                          <div key={key} className="space-y-1">
                            <p className="text-xs font-medium text-gray-600 text-center">{label}</p>
                            <select
                              value={editForm?.[key] ?? "neutral"}
                              onChange={(e) =>
                                setEditForm((prev) => prev ? { ...prev, [key]: e.target.value } : prev)
                              }
                              className="w-full text-xs border border-gray-300 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              {PREF_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{PREF_OPTION_LABELS[opt]}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    )}
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
