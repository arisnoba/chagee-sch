"use client";

import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addNineHours, MAX_SHIFT_PARTS } from "@/lib/shift-parts";

type ShiftPartForm = {
  clientId: string;
  code?: string;
  label: string;
  startTime: string;
  endTime: string;
  sortOrder: number;
};

function buildTimeOptions(): string[] {
  return Array.from({ length: 48 }, (_, index) => {
    const hour = Math.floor(index / 2);
    const minute = index % 2 === 0 ? "00" : "30";
    return `${String(hour).padStart(2, "0")}:${minute}`;
  });
}

function createClientId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `part-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeRows(rows: ShiftPartForm[]): ShiftPartForm[] {
  return rows.map((row, index) => ({
    ...row,
    clientId: row.clientId ?? row.code ?? createClientId(),
    endTime: addNineHours(row.startTime),
    sortOrder: index,
  }));
}

type SortablePartRowProps = {
  part: ShiftPartForm;
  index: number;
  partCount: number;
  timeOptions: string[];
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, updates: Partial<ShiftPartForm>) => void;
};

function SortablePartRow({
  part,
  index,
  partCount,
  timeOptions,
  onMove,
  onRemove,
  onUpdate,
}: SortablePartRowProps) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: part.clientId });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid gap-3 rounded-lg border border-gray-200 bg-white p-3 md:grid-cols-[40px_56px_1fr_160px_160px_40px] md:items-end ${
        isDragging ? "shadow-lg ring-2 ring-gray-900/10" : ""
      }`}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex h-9 w-9 cursor-grab items-center justify-center rounded-lg border border-gray-200 bg-gray-50 text-gray-500 outline-none transition hover:bg-gray-100 active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-gray-900/20 md:self-end"
        aria-label={`${part.label} 드래그해서 순서 변경`}
        title="드래그해서 순서 변경"
        {...attributes}
        {...listeners}
      >
        <GripVertical aria-hidden className="size-4" />
      </button>
      <div className="flex items-end gap-1 md:h-full md:flex-col md:justify-end">
        <Button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          variant="outline"
          size="icon-sm"
          aria-label={`${part.label} 위로 이동`}
          title="위로 이동"
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          onClick={() => onMove(index, 1)}
          disabled={index === partCount - 1}
          variant="outline"
          size="icon-sm"
          aria-label={`${part.label} 아래로 이동`}
          title="아래로 이동"
        >
          <ArrowDown aria-hidden />
        </Button>
      </div>
      <label className="space-y-1">
        <span className="text-xs font-medium text-gray-500">파트 이름</span>
        <input
          value={part.label}
          onChange={(event) => onUpdate(index, { label: event.target.value })}
          className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/15"
        />
      </label>
      <label className="space-y-1">
        <span className="text-xs font-medium text-gray-500">시작 시간</span>
        <select
          value={part.startTime}
          onChange={(event) => onUpdate(index, { startTime: event.target.value })}
          className="h-9 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/15"
        >
          {timeOptions.map((time) => (
            <option key={time} value={time}>{time}</option>
          ))}
        </select>
      </label>
      <div className="space-y-1">
        <span className="text-xs font-medium text-gray-500">종료 시간</span>
        <div className="flex h-9 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm text-gray-700">
          {part.endTime}
        </div>
      </div>
      <Button
        onClick={() => onRemove(index)}
        disabled={partCount <= 1}
        variant="ghost"
        size="icon-sm"
        aria-label={`${part.label} 삭제`}
        title="삭제"
        className="text-red-600 hover:text-red-700 md:self-end"
      >
        <Trash2 aria-hidden />
      </Button>
    </div>
  );
}

export default function ShiftPartsPage() {
  const [parts, setParts] = useState<ShiftPartForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const timeOptions = useMemo(() => buildTimeOptions(), []);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function load() {
    const response = await fetch("/api/shift-parts");
    if (!response.ok) {
      setError("파트 설정을 불러오지 못했습니다.");
      setLoading(false);
      return;
    }

    const data = await response.json();
    setParts(normalizeRows(data));
    setLoading(false);
  }

  useEffect(() => {
    let ignore = false;

    fetch("/api/shift-parts")
      .then((response) => {
        if (!response.ok) throw new Error("파트 설정 요청 실패");
        return response.json();
      })
      .then((data) => {
        if (ignore) return;
        setParts(normalizeRows(data));
        setLoading(false);
      })
      .catch(() => {
        if (ignore) return;
        setError("파트 설정을 불러오지 못했습니다.");
        setLoading(false);
      });

    return () => { ignore = true; };
  }, []);

  function updatePart(index: number, updates: Partial<ShiftPartForm>) {
    setParts((current) => normalizeRows(
      current.map((part, partIndex) => partIndex === index ? { ...part, ...updates } : part)
    ));
    setSavedMessage(null);
    setError(null);
  }

  function addPart() {
    if (parts.length >= MAX_SHIFT_PARTS) {
      setError(`파트는 최대 ${MAX_SHIFT_PARTS}개까지 만들 수 있습니다.`);
      return;
    }

    setParts((current) => normalizeRows([
      ...current,
      {
        clientId: createClientId(),
        label: `파트 ${current.length + 1}`,
        startTime: "09:00",
        endTime: "18:00",
        sortOrder: current.length,
      },
    ]));
    setSavedMessage(null);
    setError(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setParts((current) => {
      const oldIndex = current.findIndex((part) => part.clientId === active.id);
      const newIndex = current.findIndex((part) => part.clientId === over.id);

      if (oldIndex === -1 || newIndex === -1) return current;

      return normalizeRows(arrayMove(current, oldIndex, newIndex));
    });
    setSavedMessage(null);
    setError(null);
  }

  function removePart(index: number) {
    if (parts.length <= 1) {
      setError("파트는 최소 1개 이상 필요합니다.");
      return;
    }

    setParts((current) => normalizeRows(current.filter((_, partIndex) => partIndex !== index)));
    setSavedMessage(null);
    setError(null);
  }

  function movePart(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;

    if (nextIndex < 0 || nextIndex >= parts.length) return;

    setParts((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return normalizeRows(next);
    });
    setSavedMessage(null);
    setError(null);
  }

  async function saveParts() {
    const invalid = parts.find((part) => !part.label.trim());
    if (invalid) {
      setError("파트 이름을 입력하세요.");
      return;
    }

    setSaving(true);
    setError(null);
    setSavedMessage(null);
    const response = await fetch("/api/shift-parts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parts }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "파트 설정을 저장하지 못했습니다.");
      setSaving(false);
      return;
    }

    setParts(normalizeRows(await response.json()));
    setSavedMessage("파트 설정을 저장했습니다.");
    setSaving(false);
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">파트 관리</h1>
          <p className="text-sm text-gray-500 mt-1">30분 단위 시작 시간으로 9시간 근무 파트를 관리합니다</p>
        </div>
        <Button onClick={saveParts} disabled={saving || loading}>
          <Save aria-hidden />
          {saving ? "저장 중" : "저장"}
        </Button>
      </div>

      <Card className="border-blue-100 bg-blue-50/60">
        <CardContent className="pt-4 pb-4">
          <div className="grid gap-2 text-sm text-blue-800 md:grid-cols-2">
            <p>파트는 최대 {MAX_SHIFT_PARTS}개까지 만들 수 있습니다.</p>
            <p>종료 시간은 시작 시간에서 9시간 뒤로 자동 계산됩니다.</p>
            <p>시작 시간은 00분 또는 30분 단위만 선택할 수 있습니다.</p>
            <p>저장한 파트는 새 근무표 생성과 달력 표시 순서에 반영됩니다.</p>
            <p>드래그하거나 위/아래 버튼으로 표시 순서와 생성 배정 순서를 조정할 수 있습니다.</p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-20 text-gray-400">불러오는 중...</div>
      ) : (
        <Card>
          <CardHeader className="pb-1">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">파트 목록</CardTitle>
              <Button onClick={addPart} disabled={parts.length >= MAX_SHIFT_PARTS} variant="outline">
                <Plus aria-hidden />
                추가
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={parts.map((part) => part.clientId)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {parts.map((part, index) => (
                    <SortablePartRow
                      key={part.clientId}
                      part={part}
                      index={index}
                      partCount={parts.length}
                      timeOptions={timeOptions}
                      onMove={movePart}
                      onRemove={removePart}
                      onUpdate={updatePart}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
            {savedMessage ? <p className="mt-3 text-sm text-green-700">{savedMessage}</p> : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
