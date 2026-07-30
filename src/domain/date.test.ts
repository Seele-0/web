import { getShanghaiBusinessDate } from "./date";

it("returns the calendar date in Asia/Shanghai", () => {
  expect(getShanghaiBusinessDate(new Date("2026-07-30T16:30:00.000Z"))).toBe("2026-07-31");
});
