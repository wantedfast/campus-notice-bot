import { saveNotice } from '@/lib/db';
import { requireAdmin } from '@/lib/security';
import { json, readJson, noticeSchema, errorResponse } from '@/lib/http';
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireAdmin(request, true);
    const notice = saveNotice(noticeSchema.parse(await readJson(request)), (await context.params).id);
    return notice ? json({ notice }) : json({ error: '通知不存在' }, 404);
  } catch (e) { return errorResponse(e); }
}
