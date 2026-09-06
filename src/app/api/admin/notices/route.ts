import { listNotices, saveNotice } from '@/lib/db';
import { requireAdmin } from '@/lib/security';
import { json, readJson, noticeSchema, errorResponse } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  try { requireAdmin(request); return json({ notices: listNotices(true), analysisConfigured: !!process.env.DEEPSEEK_API_KEY }); } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request) {
  try { requireAdmin(request, true); return json({ notice: saveNotice(noticeSchema.parse(await readJson(request))) }, 201); }
  catch (e) { return errorResponse(e); }
}
