import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.toml" },
      miniflare: {
        bindings: {
          TEST_MIGRATIONS: migrations,
          ADMIN_PASSWORD: "test-admin-password",
          ADMIN_SESSION_SECRET: "test-session-secret-at-least-32-characters",
        },
      },
    }),
  ],
  test: {
    globals: true,
    include: ["tests/functions/**/*.test.ts"],
    setupFiles: ["./tests/functions/setup.ts"],
  },
});
