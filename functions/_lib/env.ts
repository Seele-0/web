export interface AutoLockEnv {
  DB: D1Database;
}

export interface Env extends AutoLockEnv {
  ADMIN_PASSWORD: string;
  ADMIN_SESSION_SECRET: string;
}
