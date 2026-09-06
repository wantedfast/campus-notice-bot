import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { HttpError } from './http';

function equal(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function adminConfigured() {
  return (process.env.ADMIN_PASSWORD?.length || 0) >= 6 && (process.env.SESSION_SECRET?.length || 0) >= 32;
}
export function passwordMatches(value: string) {
  if (!adminConfigured()) return false;
  const hash = (v: string) => createHmac('sha256', process.env.SESSION_SECRET!).update(v).digest('hex');
  return equal(hash(value), hash(process.env.ADMIN_PASSWORD!));
}
function sign(payload: string) {
  return createHmac('sha256', process.env.SESSION_SECRET!).update(payload).update(process.env.ADMIN_PASSWORD!).digest('base64url');
}
export function makeSession() {
  const payload = `${Date.now() + 8 * 3600000}.${randomBytes(16).toString('hex')}`;
  return `${payload}.${sign(payload)}`;
}
export function validSession(token: string) {
  if (!adminConfigured() || token.length > 200) return false;
  const parts = token.split('.'); if (parts.length !== 3) return false;
  const [expires, nonce, signature] = parts;
  return Number(expires) > Date.now() && equal(signature, sign(`${expires}.${nonce}`));
}
export function isAdmin(request: Request) {
  const token = request.headers.get('cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith('campus_admin='))?.slice(13);
  return !!token && validSession(token);
}
export function sameOrigin(request: Request) {
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (request.headers.get('origin') !== expected) throw new HttpError(403, '请求来源不被允许');
}
export function requireAdmin(request: Request, mutation = false) {
  if (mutation) sameOrigin(request);
  if (!isAdmin(request)) throw new HttpError(401, '请先登录管理后台');
}
export function sessionCookie(token: string, maxAge = 28800) {
  const secure = process.env.APP_URL?.startsWith('https://');
  const path = process.env.NEXT_PUBLIC_BASE_PATH || '/';
  return `campus_admin=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}
const globalState = globalThis as unknown as { campusLimits?: Map<string, { count: number; reset: number }>; campusActive?: number };
const limits = globalState.campusLimits ??= new Map();
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  for (const [k, v] of limits) if (v.reset <= now) limits.delete(k);
  let bucket = limits.get(key);
  if (!bucket) {
    if (limits.size >= 2000) throw new HttpError(429, '请求较多，请稍后重试');
    bucket = { count: 0, reset: now + windowMs }; limits.set(key, bucket);
  }
  if (++bucket.count > max) throw new HttpError(429, '操作太频繁，请稍后再试');
}
export function clientKey(request: Request) {
  return process.env.TRUST_PROXY === 'true' ? (request.headers.get('x-forwarded-for')?.split(',')[0].trim().slice(0,64) || 'shared') : 'shared';
}
export function acquireChat() {
  if ((globalState.campusActive || 0) >= 4) throw new HttpError(429, '同学们正在提问，请稍后再试');
  globalState.campusActive = (globalState.campusActive || 0) + 1;
  let released = false;
  return () => { if (!released) { released = true; globalState.campusActive = Math.max(0, (globalState.campusActive || 1) - 1); } };
}
