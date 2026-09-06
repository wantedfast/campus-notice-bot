import { z } from 'zod';
import { CATEGORY_IDS } from './categories';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const noticeSchema = z.object({
  title: z.string().trim().max(120).optional().default(''),
  body: z.string().trim().min(1).max(16000),
  status: z.enum(['draft', 'published']),
  categoryOverride: z.enum(CATEGORY_IDS).nullable().optional(),
  summaryOverride: z.string().trim().max(160).nullable().optional()
});
export const organizationSchema = noticeSchema.pick({ categoryOverride: true, summaryOverride: true })
  .refine(v => v.categoryOverride !== undefined || v.summaryOverride !== undefined, '请提交需要调整的分类或摘要');
export const chatSchema = z.object({ messages: z.array(z.object({
  role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(4000)
})).min(1).max(12) }).refine(v => v.messages.at(-1)?.role === 'user', '最后一条必须是问题');
export async function readJson(request: Request, maxBytes = 70000): Promise<unknown> {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new HttpError(415, '请使用 JSON 请求');
  if (Number(request.headers.get('content-length')) > maxBytes) throw new HttpError(413, '内容过长，请缩短后重试');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '请求内容为空');
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maxBytes) { await reader.cancel(); throw new HttpError(413, '内容过长，请缩短后重试'); }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '请求格式不正确');
  } finally { reader.releaseLock(); }
}
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: '请填写通知正文，并检查内容长度' }, 400);
  console.error(JSON.stringify({ event: 'request_error', type: error instanceof Error ? error.name : 'unknown' }));
  return json({ error: '服务暂时不可用，请稍后重试' }, 500);
}
