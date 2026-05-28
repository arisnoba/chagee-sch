import { Badge } from "@/components/ui/badge";
import type { DayType, ShiftType } from "@/lib/scheduler/fairness";

type WorkShiftType = Exclude<ShiftType, "off">;

export type MonthCalendarDay = {
  date: string;
  dayLabel: string;
  dayType: DayType;
  holidayName?: string;
  shifts: { shiftType: WorkShiftType; names: string[] }[];
  offNames: string[];
  hasSchedule: boolean;
};

const WEEKDAY_HEADERS = ["일", "월", "화", "수", "목", "금", "토"];
const SHIFT_LABELS: Record<WorkShiftType, string> = { open: "오픈", middle: "미들", close: "마감" };
const SHIFT_COLORS: Record<WorkShiftType, string> = {
  open: "bg-blue-100 text-blue-800",
  middle: "bg-green-100 text-green-800",
  close: "bg-orange-100 text-orange-800",
};

function dayClass(day: MonthCalendarDay): string {
  if (!day.hasSchedule) return "border-gray-200 bg-gray-50/60";
  if (day.dayType === "holiday") return "border-red-200 bg-red-50/50";
  if (day.dayType === "weekend") return "border-orange-200 bg-orange-50/40";
  return "border-gray-200 bg-white";
}

function getLeadingBlankCount(firstDate: string): number {
  return new Date(firstDate).getDay();
}

export function MonthScheduleCalendar({ days }: { days: MonthCalendarDay[] }) {
  const leadingBlankCount = days.length > 0 ? getLeadingBlankCount(days[0].date) : 0;
  const blanks = Array.from({ length: leadingBlankCount }, (_, index) => index);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1120px] overflow-hidden rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 bg-gray-50">
          {WEEKDAY_HEADERS.map((day) => (
            <div key={day} className="border-r border-gray-200 px-3 py-2 text-center text-xs font-semibold text-gray-600 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {blanks.map((blank) => (
            <div key={`blank-${blank}`} className="min-h-[220px] border-r border-t border-gray-200 bg-gray-50/40 last:border-r-0" />
          ))}

          {days.map((day) => (
            <div key={day.date} className={`min-h-[220px] border-r border-t p-3 last:border-r-0 ${dayClass(day)}`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {day.date.slice(8)} <span className="text-xs font-normal text-gray-500">{day.dayLabel}</span>
                  </p>
                  {day.holidayName && (
                    <p className="mt-0.5 text-xs font-medium text-red-600">{day.holidayName}</p>
                  )}
                </div>
                {day.dayType === "holiday" && <Badge variant="destructive">공휴일</Badge>}
                {day.dayType === "weekend" && <Badge variant="outline">주말</Badge>}
              </div>

              {day.hasSchedule ? (
                <div className="space-y-1.5">
                  {day.shifts.map((shift) => (
                    <div key={shift.shiftType} className="rounded-md border border-gray-100 bg-white/80 p-1.5">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${SHIFT_COLORS[shift.shiftType]}`}>
                        {SHIFT_LABELS[shift.shiftType]}
                      </span>
                      <p className="mt-1 text-xs leading-4 text-gray-700">{shift.names.join(", ")}</p>
                    </div>
                  ))}

                  {day.offNames.length > 0 && (
                    <div className="rounded-md border border-gray-100 bg-white/70 p-1.5">
                      <p className="text-[11px] font-medium text-gray-400">휴무 ({day.offNames.length}명)</p>
                      <p className="mt-1 text-xs leading-4 text-gray-500">{day.offNames.join(", ")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="mt-8 text-center text-xs text-gray-400">근무표 없음</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
