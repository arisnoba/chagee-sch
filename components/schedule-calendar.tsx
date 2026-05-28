import { Badge } from "@/components/ui/badge";
import type { DayType, ShiftType } from "@/lib/scheduler/fairness";

type WorkShiftType = Exclude<ShiftType, "off">;

export type CalendarDay = {
  date: string;
  dayLabel: string;
  dayType: DayType;
  holidayName?: string;
  shifts: { shiftType: WorkShiftType; names: string[] }[];
  offNames: string[];
};

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const SHIFT_LABELS: Record<WorkShiftType, string> = { open: "오픈", middle: "미들", close: "마감" };
const SHIFT_COLORS: Record<WorkShiftType, string> = {
  open: "bg-blue-100 text-blue-800",
  middle: "bg-green-100 text-green-800",
  close: "bg-orange-100 text-orange-800",
};

function dayClass(dayType: DayType): string {
  if (dayType === "holiday") return "border-red-200 bg-red-50/50";
  if (dayType === "weekend") return "border-orange-200 bg-orange-50/40";
  return "border-gray-200 bg-white";
}

export function ScheduleCalendar({
  days,
  selectedDate,
  onDaySelect,
}: {
  days: CalendarDay[];
  selectedDate?: string;
  onDaySelect?: (date: string) => void;
}) {
  const sortedDays = [...days].sort((a, b) => new Date(a.date).getDay() - new Date(b.date).getDay());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[980px] overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 bg-gray-50">
          {WEEKDAY_HEADERS.map((day) => (
            <div key={day} className="border-r border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-600 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {sortedDays.map((day) => {
            const className = `min-h-[300px] border-r border-t p-3 text-left last:border-r-0 ${dayClass(day.dayType)} ${
              selectedDate === day.date ? "ring-2 ring-blue-500 ring-inset" : ""
            } ${onDaySelect ? "cursor-pointer hover:bg-blue-50/40" : ""}`;
            const content = (
              <>
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {day.date.slice(5)} <span className="text-xs font-normal text-gray-500">{day.dayLabel}</span>
                  </p>
                  {day.holidayName && (
                    <p className="mt-0.5 text-xs font-medium text-red-600">{day.holidayName}</p>
                  )}
                </div>
                {day.dayType === "holiday" && <Badge variant="destructive">공휴일</Badge>}
                {day.dayType === "weekend" && <Badge variant="outline">주말</Badge>}
              </div>

              <div className="space-y-2">
                {day.shifts.map((shift) => (
                  <div key={shift.shiftType} className="rounded-md border border-gray-100 bg-white/80 p-2">
                    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${SHIFT_COLORS[shift.shiftType]}`}>
                      {SHIFT_LABELS[shift.shiftType]}
                    </span>
                    <p className="mt-1 text-xs leading-5 text-gray-700">{shift.names.join(", ")}</p>
                  </div>
                ))}

                {day.offNames.length > 0 && (
                  <div className="rounded-md border border-gray-100 bg-white/70 p-2">
                    <p className="text-xs font-medium text-gray-400">휴무 ({day.offNames.length}명)</p>
                    <p className="mt-1 text-xs leading-5 text-gray-500">{day.offNames.join(", ")}</p>
                  </div>
                )}
              </div>
              </>
            );

            return onDaySelect ? (
              <button key={day.date} type="button" onClick={() => onDaySelect(day.date)} className={className}>
                {content}
              </button>
            ) : (
              <div key={day.date} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
