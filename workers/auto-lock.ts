import { ensureAutomaticLock } from "../functions/_lib/automatic-lock";
import { getShanghaiBusinessDate } from "../functions/_lib/date";
import type { AutoLockEnv } from "../functions/_lib/env";

export default {
  async scheduled(controller: ScheduledController, env: AutoLockEnv, _ctx: ExecutionContext): Promise<void> {
    const scheduled = new Date(controller.scheduledTime);
    await ensureAutomaticLock(env.DB, {
      orderDate: getShanghaiBusinessDate(scheduled),
      now: scheduled.toISOString(),
      source: "cron",
      executionToken: `cron-${controller.scheduledTime}-${crypto.randomUUID()}`,
    });
  },
} satisfies ExportedHandler<AutoLockEnv>;
