import { listNotices } from '@/lib/db';
import { json, errorResponse } from '@/lib/http';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase().slice(0,120) || '';
    const all = listNotices();
    return json({ notices: all.filter(n => !q || `${n.title}\n${n.body}`.toLowerCase().includes(q)),
      updatedAt: all.map(n => n.updatedAt).sort().at(-1) || null,
      chatReady: !!process.env.DEEPSEEK_API_KEY });
  } catch (e) { return errorResponse(e); }
}
