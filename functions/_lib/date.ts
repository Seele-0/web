const shanghaiDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function getShanghaiBusinessDate(date = new Date()): string {
  return shanghaiDateFormatter.format(date);
}
