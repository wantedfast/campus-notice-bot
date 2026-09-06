import { listNotices } from '@/lib/db';
import { json, errorResponse } from '@/lib/http';
import { CATEGORY_IDS } from '@/lib/categories';
export const dynamic = 'force-dynamic';
export function GET(request: Request) {
  try {
    const q = new URL(request.url).searchParams.get('q')?.trim().toLowerCase().slice(0,120) || '';
    const all = listNotices();
    const category=new URL(request.url).searchParams.get('category');
    if(category && !(CATEGORY_IDS as readonly string[]).includes(category)) return json({error:'未知通知分类'},400);
    return json({ notices: all.filter(n => (!category || n.category===category) && (!q || `${n.title}\n${n.generatedTitle}\n${n.summary}\n${n.body}`.toLowerCase().includes(q))),
      updatedAt: all.map(n => n.updatedAt).sort().at(-1) || null,
      chatReady: !!process.env.DEEPSEEK_API_KEY });
  } catch (e) { return errorResponse(e); }
}
