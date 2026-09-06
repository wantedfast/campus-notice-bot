import { listNotices } from '@/lib/db';
import { chatSchema, readJson, errorResponse, HttpError } from '@/lib/http';
import { sameOrigin, rateLimit, clientKey, acquireChat } from '@/lib/security';
import { retrieve } from '@/lib/retrieval';
import { openCompletion, readCompletion } from '@/lib/deepseek';
import { noticeLabel } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request) {
  const start = Date.now();
  let release: (() => void) | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  const abort = new AbortController();
  const disconnect = () => abort.abort(); request.signal.addEventListener('abort', disconnect, { once: true });
  let status = 'ok';
  const clean = () => {
    clearTimeout(timer); release?.(); request.signal.removeEventListener('abort', disconnect);
    console.info(JSON.stringify({ event: 'chat', status, durationMs: Date.now() - start }));
  };
  try {
    sameOrigin(request);
    rateLimit('chat-global', 60, 60000);
    rateLimit(`chat:${clientKey(request)}`, process.env.TRUST_PROXY === 'true' ? 12 : 60, 60000);
    const { messages } = chatSchema.parse(await readJson(request, 52000));
    if (!process.env.DEEPSEEK_API_KEY) throw new HttpError(503, '问答服务尚未配置，你可以先浏览通知');
    release = acquireChat();
    const notices = retrieve(listNotices(), messages);
    const sources = notices.map((n,i) => ({ number: i+1, id: n.id, title: noticeLabel(n), noticeAt: n.noticeAt }));
    timer = setTimeout(() => abort.abort(), Math.max(100, Math.min(Number(process.env.CHAT_TIMEOUT_MS) || 45000, 120000)));
    if (request.signal.aborted) abort.abort();
    const upstream = notices.length ? await openCompletion(notices, messages, abort.signal) : null;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        try {
          emit('sources', sources);
          if (upstream) await readCompletion(upstream, notices.length, text => emit('token', { text }));
          else emit('token', { text: '现有通知中没有找到相关信息。可以补充活动名称，或先看看通知栏；具体安排请向发布者确认。' });
          emit('done', {});
        } catch (error) {
          status = abort.signal.aborted ? 'aborted' : 'upstream_error';
          try { emit('error', { error: abort.signal.aborted ? '回答等待超时或已停止，请重试' : error instanceof HttpError ? error.message : '回答连接中断，请重试' }); } catch {}
        } finally { clean(); try { controller.close(); } catch {} }
      },
      cancel() { status = 'cancelled'; abort.abort(); }
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' } });
  } catch (error) {
    status = abort.signal.aborted ? 'timeout' : 'rejected'; clean();
    return errorResponse(abort.signal.aborted ? new HttpError(504, '回答等待超时，请重试') : error);
  }
}
