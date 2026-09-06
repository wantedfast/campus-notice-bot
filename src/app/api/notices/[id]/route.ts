import { getNotice } from '@/lib/db';
import { json, errorResponse } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const notice = getNotice((await context.params).id);
    return notice ? json({ notice }) : json({ error: '通知不存在或已撤下' }, 404);
  } catch (e) { return errorResponse(e); }
}
