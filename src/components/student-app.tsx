'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUp, ArrowUpRight, BookOpen, Check, ChevronRight, CircleHelp, Clock3, GraduationCap, LoaderCircle, MessageCircle, Plus, Search, ShieldCheck, Sparkles, Square, X } from 'lucide-react';
import { dateLabel, noticeLabel, type DisplayMessage, type Notice, type Source } from '@/lib/types';
import { apiPath } from '@/lib/urls';
import { categoryLabel, type NoticeCategory } from '@/lib/categories';
import CategoryFilter from './category-filter';

const storageKey = 'campus-chat-v1';
const newId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint32Array(4))).map(v => v.toString(16)).join('-');
const examples = [ { icon: '↗', title: '最近有哪些新通知？', sub: '不错过重要的校园安排' }, { icon: '◷', title: '活动的时间和地点在哪里？', sub: '告诉我活动名称，一起找答案' }, { icon: '✓', title: '参加活动需要准备什么？', sub: '把要带的东西和注意事项理清楚' } ];

function AnswerText({ content, sources = [] }: { content: string; sources?: Source[] }) {
  return <>{content.split(/(\[\d+\])/g).map((part,i) => {
    const match = /^\[(\d+)\]$/.exec(part);
    const source = match && sources.find(s => s.number === Number(match[1]));
    return source ? <Link key={i} className="inline-source" href={`/notices/${source.id}`} title={source.title}>{source.number}</Link> : <span key={i}>{match ? '' : part}</span>;
  })}</>;
}

export default function StudentApp({ initialTab = 'chat' }: { initialTab?: 'chat' | 'notices' }) {
  const [tab, setTab] = useState(initialTab);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [updated, setUpdated] = useState<string | null>(null);
  const [chatReady, setChatReady] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [question, setQuestion] = useState('');
  const [search, setSearch] = useState('');
  const [category,setCategory]=useState<'all'|NoticeCategory>('all');
  const pendingOrganization=useRef(false), lastRefresh=useRef(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const abort = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const feed = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const dialog = useRef<HTMLElement>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(apiPath('/api/notices'), { cache: 'no-store' });
      if (!response.ok) throw new Error('通知暂时加载失败，请重试');
      const data = await response.json(); pendingOrganization.current=data.notices.some((n:Notice)=>['pending','running'].includes(n.analysisState)); lastRefresh.current=Date.now(); setNotices(data.notices); setUpdated(data.updatedAt); setChatReady(data.chatReady); setLoadError('');
    } catch (e) { setLoadError(e instanceof Error ? e.message : '通知暂时加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const onFocus = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onFocus);
    const timer = setInterval(()=>{if(pendingOrganization.current || Date.now()-lastRefresh.current>=30000) onFocus();},3000);
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(parsed)) setMessages(parsed.filter(m => m && typeof m.id === 'string' && ['user','assistant'].includes(m.role) && typeof m.content === 'string').slice(-40).map(m => ({ ...m, sources: Array.isArray(m.sources) ? m.sources.filter((s: Source) => typeof s?.id === 'string' && typeof s?.number === 'number') : [] })));
    } catch { setStorageWarning('浏览器未能恢复历史对话，你仍可开始提问。'); }
    setHydrated(true);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onFocus); abort.current?.abort(); };
  }, [refresh]);
  useEffect(() => {
    if (!hydrated || busy) return;
    try { localStorage.setItem(storageKey, JSON.stringify(messages.slice(-40))); }
    catch { setStorageWarning('当前浏览器无法保存对话，关闭页面后记录可能丢失。'); }
  }, [messages, hydrated, busy]);
  useEffect(() => { if (follow.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [messages, busy, error]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => { document.documentElement.style.setProperty('--app-height', `${viewport?.height || window.innerHeight}px`); };
    resize(); viewport?.addEventListener('resize', resize); window.addEventListener('resize', resize);
    return () => { viewport?.removeEventListener('resize', resize); window.removeEventListener('resize', resize); document.documentElement.style.removeProperty('--app-height'); };
  }, []);
  useEffect(() => { if (input.current) { input.current.style.height = 'auto'; input.current.style.height = `${Math.min(input.current.scrollHeight,128)}px`; } }, [question]);
  useEffect(() => {
    if (!clearOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const trap = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setClearOpen(false); return; }
      if (e.key !== 'Tab') return;
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [clearOpen]);

  async function send(text = question, retryIndex?: number) {
    if (inFlight.current || !text.trim()) return;
    const history = retryIndex === undefined ? messages : messages.slice(0,retryIndex);
    const user: DisplayMessage = { id: newId(), role: 'user', content: text.trim() };
    const id = newId();
    const next = [...history, user];
    inFlight.current = true; setBusy(true); setError(''); setQuestion(''); follow.current = true;
    setMessages([...next, { id, role: 'assistant', content: '' }]);
    const controller = new AbortController(); abort.current = controller;
    const update = (fn: (m: DisplayMessage) => DisplayMessage) => setMessages(prev => prev.map(m => m.id === id ? fn(m) : m));
    try {
      const response = await fetch(apiPath('/api/chat'), { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.filter(m => m.content && !m.failed && !m.interrupted).slice(-12).map(m => ({ role: m.role, content: m.content.slice(0,4000) })) }), signal: controller.signal });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || '暂时无法回答，请重试'); }
      if (!response.body) throw new Error('连接中断，请重试');
      const reader = response.body.getReader(), decoder = new TextDecoder(); let pending = '', doneEvent = false;
      try {
        while (true) {
          const { value, done } = await reader.read(); if (done) break;
          pending += decoder.decode(value, { stream: true }); let boundary: number;
          while ((boundary = pending.indexOf('\n\n')) >= 0) {
            const block = pending.slice(0,boundary); pending = pending.slice(boundary+2);
            const event = block.match(/^event: (.*)$/m)?.[1]; const payload = block.match(/^data: (.*)$/m)?.[1];
            if (!payload) continue; const data = JSON.parse(payload);
            if (event === 'sources') update(m => ({ ...m, sources: data }));
            if (event === 'token') update(m => ({ ...m, content: m.content + data.text }));
            if (event === 'error') throw new Error(data.error);
            if (event === 'done') doneEvent = true;
          }
        }
        if (!doneEvent) throw new Error('回答连接中断，请重试');
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    } catch (e) {
      if (controller.signal.aborted) update(m => ({ ...m, interrupted: true }));
      else { setError(e instanceof Error ? e.message : '网络异常，请重试'); update(m => ({ ...m, failed: true })); }
    } finally { inFlight.current = false; setBusy(false); abort.current = null; }
  }
  function clearChat() { if (busy) return; setMessages([]); setError(''); setClearOpen(false); try { localStorage.removeItem(storageKey); } catch {} }
  function retry() { const index = messages.findLastIndex(m => m.role === 'user'); if (index >= 0) void send(messages[index].content,index); }
  const searched = notices.filter(n => `${n.title}\n${n.generatedTitle}\n${n.summary}\n${n.body}`.toLowerCase().includes(search.toLowerCase()));
  const filtered=searched.filter(n=>category==='all' || n.category===category);
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand"><span className="brand-mark"><GraduationCap size={25}/></span><span>课间<span className="brand-sub">校园通知助手</span></span></Link>
      <div className="sidebar-main"><span className="section-label">你的校园小助手</span><nav aria-label="主要导航">
        <button className={`nav-item ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}><MessageCircle size={19}/> 问问课间 <ChevronRight size={16}/></button>
        <button className={`nav-item ${tab === 'notices' ? 'active' : ''}`} onClick={() => setTab('notices')}><BookOpen size={19}/> 通知栏 <span className="count">{notices.length}</span></button>
      </nav><button className="new-chat" disabled={busy || !messages.length} onClick={() => setClearOpen(true)}><Plus size={18}/> 开启新对话</button>
      <div className="sidebar-note"><span className="note-icon"><Sparkles size={19}/></span><p>少翻一会儿记录，<br/>多留一点时间给自己。</p><span>通知里的事，在这里问清楚。</span><div className="note-art"><span/><span/><span/></div></div></div>
      <div className="sidebar-footer"><span><ShieldCheck size={15}/> 回答有出处，安排更清楚</span><Link href="/admin">通知管理 <ArrowUpRight size={13}/></Link></div>
    </aside>
    <main className="main-panel">
      <header className="topbar"><div className="desktop-heading">{tab === 'chat' ? '问问课间' : '通知栏'}<span className="topbar-divider"/><span className="muted">让每条通知，都有答案</span></div>
        <Link className="mobile-brand" href="/"><GraduationCap size={24}/>课间</Link>
        <span className="service-label"><span className={`status-dot ${chatReady === false ? 'neutral' : ''}`}/>{chatReady === null ? '正在连接' : chatReady ? '通知问答' : '通知浏览可用'}</span>
      </header>
      <nav className="mobile-tabs" aria-label="手机导航"><button className={tab === 'chat' ? 'selected' : ''} onClick={() => setTab('chat')}><MessageCircle size={17}/>问问课间</button><button className={tab === 'notices' ? 'selected' : ''} onClick={() => setTab('notices')}><BookOpen size={17}/>通知栏</button>{tab === 'chat' && messages.length > 0 && <button aria-label="清空对话" disabled={busy} onClick={() => setClearOpen(true)}><Plus size={18}/></button>}</nav>
      {tab === 'chat' ? <>
        <div className="chat-feed" ref={feed} onScroll={() => { const el = feed.current; if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90; }}>
          {!messages.length ? <div className="welcome"><div className="welcome-symbol"><Sparkles size={32} strokeWidth={1.6}/><span className="mini-spark">✦</span></div>
            <span className="eyebrow">把校园里的小事，安排明白</span><h1>嗨，同学。<br/>今天想了解什么？</h1><p className="welcome-description">不用翻遍群消息，问问这里。<br className="mobile-only"/>我会根据已发布的通知，为你找到答案。</p>
            <div className="suggestions">{examples.map(e => <button key={e.title} onClick={() => { setQuestion(e.title); input.current?.focus(); }}><span className="suggestion-icon">{e.icon}</span><strong>{e.title}</strong><span>{e.sub}</span><ArrowUpRight size={16} className="suggestion-arrow"/></button>)}</div>
            <div className="latest-section"><div className="section-heading"><h2><span className="tiny-dot"/> 最近发布</h2><button className="text-button" onClick={() => setTab('notices')}>全部通知 <ArrowUpRight size={15}/></button></div>
              {loading ? <p className="empty-inline"><LoaderCircle className="spin" size={18}/>正在获取通知…</p> : loadError ? <p className="empty-inline">{loadError}<button onClick={() => void refresh()} className="text-button">重试</button></p> : notices.length ? <div className="latest-list">{notices.slice(0,3).map(n => <Link key={n.id} href={`/notices/${n.id}`}><span className="notice-list-icon"><BookOpen size={17}/></span><span className="latest-title">{noticeLabel(n)}<small><span className="mini-category" data-category={n.category}>{categoryLabel(n.category)}</span>{dateLabel(n.noticeAt)}</small></span><ChevronRight size={17}/></Link>)}</div> : <div className="empty-notice"><BookOpen size={23}/><span>还没有发布通知<small>发布后，这里会第一时间更新。</small></span></div>}
            </div>
          </div> : <div className="conversation"><div className="conversation-note"><ShieldCheck size={14}/> 回答依据已发布通知，具体安排以通知原文为准</div>{messages.map((m,i) => <div key={m.id} className={`message ${m.role}`}>
            {m.role === 'assistant' && <span className="assistant-avatar"><Sparkles size={17}/></span>}<div className="message-main">{m.role === 'assistant' && <div className="message-name">课间 <span>通知助手</span></div>}
              <div className="message-text">{m.content ? <AnswerText content={m.content} sources={m.sources}/> : busy && i === messages.length-1 ? <span className="thinking"><span/><span/><span/> 正在查阅通知</span> : m.failed ? '这次没能完成回答。' : '已停止生成。'}</div>
              {m.sources && m.sources.length > 0 && m.content && <div className="source-list"><span>参考通知</span>{m.sources.map(s => <Link key={s.id} href={`/notices/${s.id}`}><span>{s.number}</span>{s.title}<ArrowUpRight size={13}/></Link>)}</div>}
              {m.interrupted && m.content && <small className="muted">已停止 · 回答未完成</small>}{m.failed && m.content && <small className="muted">连接异常 · 回答未完成</small>}
            </div></div>)}<div aria-live="polite" className="sr-only">{busy ? '正在生成回答' : '回答已结束'}</div></div>}
        </div>
        <div className="composer-wrap">{storageWarning && <p className="composer-alert">{storageWarning}</p>}{chatReady === false && <p className="composer-alert"><CircleHelp size={14}/>问答服务尚未配置，你可以先浏览通知。</p>}{error && <div className="chat-error" role="alert"><span>{error}</span><button onClick={retry} disabled={busy}>重试</button><button aria-label="关闭错误提示" onClick={() => setError('')}><X size={16}/></button></div>}
          <form className="composer" onSubmit={e => { e.preventDefault(); void send(); }}><textarea ref={input} aria-label="输入你的问题" placeholder="问问通知里的事，比如：最近有哪些新通知？" value={question} maxLength={2000} rows={1} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer:fine)').matches) { e.preventDefault(); void send(); } }}/>{busy ? <button type="button" className="send-button stop" aria-label="停止生成" onClick={() => abort.current?.abort()}><Square size={17} fill="currentColor"/></button> : <button className="send-button" aria-label="发送问题" disabled={!question.trim() || chatReady === false || loading}><ArrowUp size={22}/></button>}</form>
          <div className="composer-foot"><span><ShieldCheck size={12}/> 对话仅保存在当前浏览器</span><span>{updated ? `通知更新于 ${dateLabel(updated)}` : '以已发布通知为依据'}</span></div>
        </div></> : <div className="notices-view"><div className="notices-heading"><span className="eyebrow">CAMPUS BULLETIN</span><h1>校园里的事，都在这里。</h1><p className="muted">查看最新安排，也可以回到对话里继续问。</p></div><label className="search-box"><Search size={19}/><input placeholder="搜索通知标题或内容" aria-label="搜索通知" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button aria-label="清空搜索" onClick={() => setSearch('')}><X size={16}/></button>}</label><CategoryFilter value={category} onChange={setCategory} notices={searched}/><p className="result-count">共 {filtered.length} 条通知{category!=='all' && ` · ${categoryLabel(category)}`}</p>{loading ? <p className="empty-inline">正在加载通知…</p> : loadError ? <p role="alert">{loadError}<button className="text-button" onClick={() => void refresh()}>重试</button></p> : !filtered.length ? <div className="large-empty"><BookOpen size={32}/><h2>{search || category!=='all' ? '没有找到相关通知' : '通知栏还是空的'}</h2><p>{search || category!=='all' ? '换个关键词，或选择其他分类试试。' : '管理员发布后，就会显示在这里。'}</p></div> : <div className="notice-cards">{filtered.map(n => <Link className="notice-card" href={`/notices/${n.id}`} key={n.id}><div className="notice-card-top"><span className="notice-tag" data-category={n.category}>{categoryLabel(n.category)}</span><span className="card-meta">{['pending','running'].includes(n.analysisState) && <small>归类中</small>}<ArrowUpRight size={19}/></span></div><h2>{noticeLabel(n)}</h2><p>{n.summary || n.body}</p><span className="time"><Clock3 size={14}/>{dateLabel(n.noticeAt)}</span></Link>)}</div>}</div>}
    </main>
    {clearOpen && <div className="modal-backdrop" onClick={() => setClearOpen(false)}><section ref={dialog} role="dialog" aria-modal="true" aria-labelledby="clear-title" className="confirm-dialog" onClick={e => e.stopPropagation()}><span className="dialog-icon"><MessageCircle size={25}/></span><h2 id="clear-title">开始一段新对话？</h2><p>当前浏览器中的对话记录将被清除，已发布通知不受影响。</p><div className="dialog-actions"><button autoFocus className="secondary" onClick={() => setClearOpen(false)}>保留对话</button><button className="primary" onClick={clearChat}><Check size={16}/>清空并开始</button></div></section></div>}
  </div>;
}
