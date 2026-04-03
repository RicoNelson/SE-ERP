import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toDateInputValue } from '../../features/sales/constants';

interface DateRangeCalendarProps {
  startDate: string;
  endDate: string;
  onChange: (next: { startDate: string; endDate: string }) => void;
}

const WEEKDAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addMonths = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear()
  && a.getMonth() === b.getMonth()
  && a.getDate() === b.getDate();

const isBetween = (target: Date, start?: Date | null, end?: Date | null) => {
  if (!start || !end) return false;
  const value = target.getTime();
  return value > start.getTime() && value < end.getTime();
};

export default function DateRangeCalendar({ startDate, endDate, onChange }: DateRangeCalendarProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(startDate ? new Date(`${startDate}T00:00:00`) : new Date()));

  const start = startDate ? new Date(`${startDate}T00:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T00:00:00`) : null;

  const days = useMemo(() => {
    const monthStart = startOfMonth(visibleMonth);
    const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const firstWeekday = monthStart.getDay();
    const cells: Array<Date | null> = [];

    for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
    for (let day = 1; day <= monthEnd.getDate(); day += 1) {
      cells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [visibleMonth]);

  const handleDayClick = (day: Date) => {
    const iso = toDateInputValue(day);

    if (!startDate || endDate) {
      onChange({ startDate: iso, endDate: '' });
      return;
    }

    if (iso < startDate) {
      onChange({ startDate: iso, endDate: startDate });
      return;
    }

    onChange({ startDate, endDate: iso });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
          className="ai-button-ghost rounded-full p-2 text-slate-600"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-center">
          <p className="text-sm font-bold text-slate-900">
            {visibleMonth.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
          </p>
          <p className="text-xs text-slate-500">Pilih tanggal awal lalu tanggal akhir</p>
        </div>
        <button
          type="button"
          onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
          className="ai-button-ghost rounded-full p-2 text-slate-600"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {WEEKDAYS.map((day) => (
          <div key={day} className="py-1">{day}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <div key={`empty-${index}`} className="aspect-square" />;

          const isStart = start ? isSameDay(day, start) : false;
          const isEnd = end ? isSameDay(day, end) : false;
          const inRange = isBetween(day, start, end);

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => handleDayClick(day)}
              className={[
                'aspect-square rounded-2xl text-sm font-semibold transition',
                isStart || isEnd
                  ? 'bg-sky-600 text-white shadow-[0_14px_28px_rgba(37,99,235,0.24)]'
                  : inRange
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100',
              ].join(' ')}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <span className="font-semibold text-slate-900">Terpilih:</span>{' '}
        {startDate || '-'} sampai {endDate || '-'}
      </div>
    </div>
  );
}
