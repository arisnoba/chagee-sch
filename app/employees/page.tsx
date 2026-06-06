"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Employee } from "@/lib/db/schema";

const PREF_LABELS: Record<string, string> = { like: "👍 선호", neutral: "😐 보통", dislike: "👎 기피" };
const PREF_COLORS: Record<string, string> = {
  like: "text-green-700 bg-green-50 border-green-200",
  neutral: "text-gray-500 bg-gray-50 border-gray-200",
  dislike: "text-red-600 bg-red-50 border-red-200",
};
const PREF_OPTIONS = ["like", "neutral", "dislike"] as const;
const PREF_OPTION_LABELS: Record<string, string> = { like: "👍 선호", neutral: "😐 보통", dislike: "👎 기피" };

type Preference = (typeof PREF_OPTIONS)[number];
type EmployeeForm = {
  name: string;
  openPreference: Preference;
  middlePreference: Preference;
  closePreference: Preference;
};

function sortEmployeesByName(rows: Employee[]): Employee[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EmployeeForm | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const data = await fetch("/api/employees").then((r) => r.json());
    setEmployees(sortEmployeesByName(data));
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;

    fetch("/api/employees")
      .then((r) => r.json())
      .then((data) => {
        if (ignore) return;
        setEmployees(sortEmployeesByName(data));
        setLoading(false);
      });

    return () => { ignore = true; };
  }, []);

  function startEdit(emp: Employee) {
    setEditingId(emp.id);
    setEditForm({
      name: emp.name,
      openPreference: emp.openPreference,
      middlePreference: emp.middlePreference,
      closePreference: emp.closePreference,
    });
    setError(null);
  }

  async function saveEdit(empId: number) {
    if (!editForm) return;
    if (!editForm.name.trim()) {
      setError("직원 이름을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch(`/api/employees/${empId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "직원 정보를 저장하지 못했습니다.");
      setSaving(false);
      return;
    }

    setEditingId(null);
    setEditForm(null);
    setSaving(false);
    await load();
  }

  async function addEmployee() {
    const name = newName.trim();

    if (!name) {
      setError("추가할 직원 이름을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    const response = await fetch("/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "직원을 추가하지 못했습니다.");
      setSaving(false);
      return;
    }

    setNewName("");
    setSaving(false);
    await load();
  }

  async function deleteEmployee(emp: Employee) {
    if (!window.confirm(`${emp.name} 직원을 삭제할까요?`)) return;

    setDeletingId(emp.id);
    setError(null);
    const response = await fetch(`/api/employees/${emp.id}`, { method: "DELETE" });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "직원을 삭제하지 못했습니다.");
      setDeletingId(null);
      return;
    }

    if (editingId === emp.id) {
      setEditingId(null);
      setEditForm(null);
    }

    setDeletingId(null);
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">직원 관리</h1>
        <p className="text-sm text-gray-500 mt-1">직원 이름과 파트 성향을 관리합니다</p>
      </div>

      <Card>
        <CardHeader className="pb-1">
          <CardTitle className="text-base">직원 추가</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addEmployee();
              }}
              className="h-9 flex-1 rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/15"
              placeholder="직원 이름"
            />
            <Button onClick={addEmployee} disabled={saving} className="sm:w-auto">
              <Plus aria-hidden />
              추가
            </Button>
          </div>
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-base">직원 목록</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">이름</TableHead>
                  <TableHead>오픈</TableHead>
                  <TableHead>미들</TableHead>
                  <TableHead>마감</TableHead>
                  <TableHead className="pr-4 text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-28 text-center text-gray-400">
                      등록된 직원이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((emp) => {
                    const isEditing = editingId === emp.id;
                    const preferences = [
                      { key: "openPreference" as const, value: emp.openPreference },
                      { key: "middlePreference" as const, value: emp.middlePreference },
                      { key: "closePreference" as const, value: emp.closePreference },
                    ];

                    return (
                      <TableRow key={emp.id}>
                        <TableCell className="pl-4 font-medium">
                          {isEditing ? (
                            <input
                              value={editForm?.name ?? ""}
                              onChange={(event) =>
                                setEditForm((prev) => prev ? { ...prev, name: event.target.value } : prev)
                              }
                              className="h-8 w-36 rounded-lg border border-gray-300 px-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-gray-900/15"
                            />
                          ) : (
                            emp.name
                          )}
                        </TableCell>
                        {preferences.map(({ key, value }) => (
                          <TableCell key={key}>
                            {isEditing ? (
                              <select
                                value={editForm?.[key] ?? "neutral"}
                                onChange={(event) =>
                                  setEditForm((prev) => prev ? { ...prev, [key]: event.target.value as Preference } : prev)
                                }
                                className="h-8 w-24 rounded-lg border border-gray-300 bg-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/15"
                              >
                                {PREF_OPTIONS.map((opt) => (
                                  <option key={opt} value={opt}>{PREF_OPTION_LABELS[opt]}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={`inline-flex rounded border px-2 py-1 text-xs font-medium ${PREF_COLORS[value]}`}>
                                {PREF_LABELS[value]}
                              </span>
                            )}
                          </TableCell>
                        ))}
                        <TableCell className="pr-4">
                          {!isEditing ? (
                            <div className="flex justify-end gap-1">
                              <Button
                                onClick={() => startEdit(emp)}
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${emp.name} 수정`}
                                title="수정"
                              >
                                <Pencil data-icon="inline-start" aria-hidden />
                              </Button>
                              <Button
                                onClick={() => deleteEmployee(emp)}
                                disabled={deletingId === emp.id}
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${emp.name} 삭제`}
                                title="삭제"
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 data-icon="inline-start" aria-hidden />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-1">
                              <Button
                                onClick={() => saveEdit(emp.id)}
                                disabled={saving}
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${emp.name} 저장`}
                                title="저장"
                                className="text-green-700 hover:text-green-800"
                              >
                                <Save data-icon="inline-start" aria-hidden />
                              </Button>
                              <Button
                                onClick={() => { setEditingId(null); setEditForm(null); setError(null); }}
                                variant="ghost"
                                size="icon-xs"
                                aria-label={`${emp.name} 취소`}
                                title="취소"
                              >
                                <X data-icon="inline-start" aria-hidden />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
