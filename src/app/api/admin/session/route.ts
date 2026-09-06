import { z } from 'zod';
import { adminConfigured, isAdmin, sameOrigin, passwordMatches, makeSession, sessionCookie, rateLimit, clientKey } from '@/lib/security';
import { json, readJson, errorResponse, HttpError } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) { return json({ authenticated: isAdmin(request), configured: adminConfigured() }); }
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    rateLimit('login-global', 30, 15 * 60000);
    rateLimit(`login:${clientKey(request)}`, 8, 15 * 60000);
    if (!adminConfigured()) throw new HttpError(503, '管理后台尚未配置，请设置管理员密码和会话密钥');
    const { password } = z.object({ password: z.string().max(256) }).parse(await readJson(request, 2000));
    if (!passwordMatches(password)) throw new HttpError(401, '密码不正确');
    const response = json({ ok: true }); response.headers.set('Set-Cookie', sessionCookie(makeSession())); return response;
  } catch (e) { return errorResponse(e); }
}
export function DELETE(request: Request) {
  try { sameOrigin(request); const response = json({ ok: true }); response.headers.set('Set-Cookie', sessionCookie('', 0)); return response; }
  catch (e) { return errorResponse(e); }
}
