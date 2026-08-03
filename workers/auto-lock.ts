import { ensureAutomaticLock } from "../functions/_lib/automatic-lock";
import { getShanghaiBusinessDate, getShanghaiDateTimeParts } from "../functions/_lib/date";
import type { AutoLockEnv } from "../functions/_lib/env";
import type { MealPeriod } from "../src/domain/meal-period";

export default {
  async scheduled(controller: ScheduledController, env: AutoLockEnv, _ctx: ExecutionContext): Promise<void> {
    const scheduled = new Date(controller.scheduledTime);
    const { hour } = getShanghaiDateTimeParts(scheduled);
    const mealPeriod: MealPeriod = hour >= 21 ? "dinner" : "lunch";
    await ensureAutomaticLock(env.DB, {
      orderDate: getShanghaiBusinessDate(scheduled),
      mealPeriod,
      now: scheduled.toISOString(),
      source: "cron",
      executionToken: `cron-${controller.scheduledTime}-${crypto.randomUUID()}`,
    });
  },
} satisfies ExportedHandler<AutoLockEnv>;
