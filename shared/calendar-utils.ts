const THURSDAY = 4;
const DAY_KEYS = ["thu", "fri", "sat", "sun", "mon", "tue", "wed"];

const asDate = (value: Date | string | number) => {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

export function formatLocalCalendarDate(value: Date | string | number) {
  const date = asDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getCalendarWeekStart(value: Date | string | number) {
  const date = asDate(value);
  const offset = (date.getDay() - THURSDAY + 7) % 7;
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - offset);
  return start;
}

export function isCalendarDateReached(date: Date | string | number, today?: Date | string | number) {
  return formatLocalCalendarDate(date) <= formatLocalCalendarDate(today || new Date());
}

export function getMonthCalendarWeeks(year: number, monthIndex: number) {
  const firstDay = new Date(year, monthIndex, 1, 12);
  const lastDay = new Date(year, monthIndex + 1, 0, 12);
  const start = getCalendarWeekStart(firstDay);
  const weeks: Date[][] = [];
  let cursor = new Date(start);
  while (weeks.length === 0 || cursor <= lastDay || weeks[weeks.length - 1][6].getMonth() === monthIndex) {
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + index);
      date.setHours(12, 0, 0, 0);
      return date;
    });
    weeks.push(week);
    cursor.setDate(cursor.getDate() + 7);
    if (weeks.length >= 6) break;
  }
  return weeks;
}

export function getCalendarWeekNumber(year: number, monthIndex: number, date: Date | string | number) {
  const target = asDate(date);
  const weeks = getMonthCalendarWeeks(year, monthIndex);
  const targetStart = formatLocalCalendarDate(getCalendarWeekStart(target));
  const index = weeks.findIndex(week => formatLocalCalendarDate(week[0]) === targetStart);
  return index >= 0 ? index + 1 : Math.max(1, Math.ceil(target.getDate() / 7));
}

export function getCalendarWeekDate(year: number, monthIndex: number, week: number, dayIndex: number | string) {
  const weeks = getMonthCalendarWeeks(year, monthIndex);
  const selectedWeek = weeks[Math.max(0, Number(week || 1) - 1)] || weeks[0];
  const index = typeof dayIndex === "string" ? Math.max(0, DAY_KEYS.indexOf(dayIndex)) : Math.max(0, Number(dayIndex) || 0);
  return new Date(selectedWeek[Math.min(6, index)] || selectedWeek[0]);
}

export function getWeekTaskDate(task: Record<string, any> = {}, year?: number) {
  if (task.plannedDate) return String(task.plannedDate).slice(0, 10);
  const taskYear = Number(task.year) || Number(year) || new Date().getFullYear();
  const monthIndex = Math.max(0, Number(String(task.month || "m1").replace("m", "")) - 1);
  const dayIndex = typeof task.day === "string" ? DAY_KEYS.indexOf(task.day) : Number(task.day) || 0;
  return formatLocalCalendarDate(getCalendarWeekDate(taskYear, monthIndex, Number(task.week) || 1, dayIndex));
}
