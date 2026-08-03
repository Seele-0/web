export const MEAL_PERIODS = ["lunch", "dinner"] as const;
export type MealPeriod = (typeof MEAL_PERIODS)[number];

export const MEAL_PERIOD_LABEL: Record<MealPeriod, string> = {
  lunch: "中午",
  dinner: "晚上",
};

export const MEAL_PERIOD_LOCK_TIME: Record<MealPeriod, string> = {
  lunch: "15:00",
  dinner: "21:00",
};

const ORDER_STORAGE_ID_PATTERN = /^(\d{4}-\d{2}-\d{2})#(lunch|dinner)$/;

export function isMealPeriod(value: unknown): value is MealPeriod {
  return value === "lunch" || value === "dinner";
}

/** Stores newly-created meal orders separately while retaining compatibility with legacy date-only orders. */
export function getOrderStorageId(orderDate: string, mealPeriod?: MealPeriod): string {
  return mealPeriod ? `${orderDate}#${mealPeriod}` : orderDate;
}

export function getOrderSlotFromStorageId(storageId: string): { orderDate: string; mealPeriod: MealPeriod } {
  const match = ORDER_STORAGE_ID_PATTERN.exec(storageId);
  return match ? { orderDate: match[1], mealPeriod: match[2] as MealPeriod } : { orderDate: storageId, mealPeriod: "lunch" };
}

export function getShanghaiMealPeriod(date = new Date()): MealPeriod {
  const hour = Number(new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date));
  return hour < 15 ? "lunch" : "dinner";
}
