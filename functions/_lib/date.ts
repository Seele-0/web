const shanghaiDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

type ShanghaiDateTimeParts = { year: number; month: number; day: number; hour: number; minute: number };

export function getShanghaiDateTimeParts(date = new Date()): ShanghaiDateTimeParts {
  const values = Object.fromEntries(
    shanghaiDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  ) as Record<"year" | "month" | "day" | "hour" | "minute", number>;
  return values;
}

export function getShanghaiBusinessDate(date = new Date()): string {
  const { year, month, day } = getShanghaiDateTimeParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getPreviousBusinessDate(orderDate: string): string {
  const [year, month, day] = orderDate.split("-").map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1, 12));
  return getShanghaiBusinessDate(previous);
}
