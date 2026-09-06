export type Notice = {
  id: string; title: string; body: string; noticeAt: string;
  createdAt: string; updatedAt: string; status: 'draft' | 'published';
};
export type Source = { number: number; id: string; title: string; noticeAt: string };
export type ChatMessage = { role: 'user' | 'assistant'; content: string };
export type DisplayMessage = ChatMessage & { id: string; sources?: Source[]; failed?: boolean; interrupted?: boolean };
export function noticeLabel(notice: Pick<Notice, 'title' | 'body'>) {
  if (notice.title.trim()) return notice.title;
  const text = notice.body.trim().split(/\r?\n/).find(line => line.trim())?.trim() || '校园通知';
  return text.length > 36 ? text.slice(0, 36) + '…' : text;
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
}
