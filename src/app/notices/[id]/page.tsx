import Link from 'next/link';
import { ArrowLeft, BookOpen, Clock3 } from 'lucide-react';
import { getNotice } from '@/lib/db';
import { dateLabel, noticeLabel } from '@/lib/types';
import { categoryLabel } from '@/lib/categories';
import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const notice = getNotice((await params).id); if (!notice) notFound();
  return <main className="detail-page"><Link className="back-link" href="/notices"><ArrowLeft size={18}/> 返回通知栏</Link>
    <article className="notice-paper"><span className="eyebrow"><BookOpen size={16}/> {categoryLabel(notice.category)}</span><h1>{noticeLabel(notice)}</h1>
      <p className="muted time"><Clock3 size={15}/>{dateLabel(notice.noticeAt)} · 北京时间</p>
      {notice.summary && <aside className="notice-summary"><strong>通知速览</strong><p>{notice.summary}</p><small>{notice.summaryLocked ? '摘要经管理员编辑' : '自动整理，仅供速览'} · 具体安排以原文为准</small></aside>}
      <div className="notice-body">{notice.body}</div>
      <footer>更新于 {dateLabel(notice.updatedAt)}</footer></article><Link href="/" className="primary detail-ask">对通知有疑问？问问课间 <span>↗</span></Link></main>;
}
