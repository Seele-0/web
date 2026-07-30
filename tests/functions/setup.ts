import { applyD1Migrations, env, reset } from "cloudflare:test";
import { afterAll, beforeEach, vi } from "vitest";

vi.useFakeTimers();
vi.setSystemTime(new Date("2026-07-30T12:00:00.000Z"));

beforeEach(async () => {
  await reset();
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

afterAll(() => {
  vi.useRealTimers();
});
