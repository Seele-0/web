import type { Env } from "./env";
import { HttpError } from "./http";

const COOKIE_NAME = "admin_session";
const MAX_AGE_SECONDS = 14_400;
const encoder = new TextEncoder();

type SessionPayload = { issuedAt: number; expiresAt: number };

function assertConfigured(env: Env): void {
  if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET || env.ADMIN_SESSION_SECRET.length < 16) {
    throw new HttpError(500, "admin_not_configured", "管理员安全配置缺失");
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sign(payload: string, secret: string): Promise<string> {
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(payload))));
}

export async function passwordsMatch(submitted: string, expected: string): Promise<boolean> {
  const [left, right] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(submitted)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left);
  const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function createAdminSessionCookie(env: Env, now = Date.now()): Promise<string> {
  assertConfigured(env);
  const payload: SessionPayload = { issuedAt: now, expiresAt: now + MAX_AGE_SECONDS * 1000 };
  const encodedPayload = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await sign(encodedPayload, env.ADMIN_SESSION_SECRET);
  return `${COOKIE_NAME}=${encodedPayload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearAdminSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function verifyAdminRequest(request: Request, env: Env, now = Date.now()): Promise<SessionPayload> {
  assertConfigured(env);
  const cookie = request.headers.get("cookie") ?? "";
  const token = cookie.split(/;\s*/).find((part) => part.startsWith(`${COOKIE_NAME}=`))?.slice(COOKIE_NAME.length + 1);
  if (!token) throw new HttpError(401, "admin_required", "需要管理员登录");
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) throw new HttpError(401, "invalid_admin_session", "管理员会话无效");
  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await key(env.ADMIN_SESSION_SECRET),
      fromBase64Url(signaturePart).buffer as ArrayBuffer,
      encoder.encode(payloadPart),
    );
    if (!valid) throw new Error("invalid signature");
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart))) as SessionPayload;
    if (!Number.isFinite(payload.issuedAt) || !Number.isFinite(payload.expiresAt) || payload.issuedAt > now || payload.expiresAt <= now) {
      throw new Error("expired session");
    }
    return payload;
  } catch {
    throw new HttpError(401, "invalid_admin_session", "管理员会话无效或已过期");
  }
}
