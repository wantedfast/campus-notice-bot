import { HttpError } from './http';
import type { ChatMessage, Notice } from './types';
import { buildPrompt, CitationFilter } from './retrieval';

export async function openCompletion(notices: Notice[], messages: ChatMessage[], signal: AbortSignal) {
  const base = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
    body: JSON.stringify({ model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash', stream: true,
      thinking: { type: 'disabled' }, max_tokens: 1800,
      messages: [{ role: 'system', content: buildPrompt(notices) }, ...messages] })
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 402) throw new HttpError(503, '问答服务额度不足，请联系管理员');
    if (response.status === 401 || response.status === 403) throw new HttpError(503, '问答服务配置异常，请联系管理员');
    if (response.status === 429) throw new HttpError(503, '问答服务繁忙，请稍后重试');
    throw new HttpError(502, '问答服务暂时不可用，请稍后重试');
  }
  if (!response.body) throw new HttpError(502, '问答服务没有返回内容');
  return response;
}
export async function readCompletion(response: Response, count: number, onText: (text: string) => void) {
  const reader = response.body!.getReader(); const decoder = new TextDecoder();
  const filter = new CitationFilter(count);
  let pending = '', complete = false, outputLength = 0;
  try {
    while (!complete) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      if (pending.length > 100000) throw new Error('Invalid upstream stream');
      let index: number;
      while ((index = pending.indexOf('\n')) >= 0) {
        const line = pending.slice(0,index).trim(); pending = pending.slice(index+1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { complete = true; break; }
        const event = JSON.parse(data);
        if (event.error) throw new Error('Upstream stream error');
        const finish = event.choices?.[0]?.finish_reason;
        if (finish === 'length') throw new HttpError(502, '回答长度达到上限，请缩小问题范围后重试');
        const delta = event.choices?.[0]?.delta?.content;
        if (typeof delta === 'string') {
          outputLength += delta.length;
          if (outputLength > 24000) throw new Error('Output limit exceeded');
          const text = filter.push(delta); if (text) onText(text);
        }
      }
    }
    if (!complete || !outputLength) throw new HttpError(502, '回答连接中断，请重试');
    const remaining = filter.push('', true); if (remaining) onText(remaining);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
