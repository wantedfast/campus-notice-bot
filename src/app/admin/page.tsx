'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, GraduationCap, LoaderCircle, LockKeyhole, LogOut, Plus, Save, Send, X } from 'lucide-react';
import { dateLabel, noticeLabel, type Notice } from '@/lib/types';
import { apiPath } from '@/lib/urls';
type Form = { id?: string; title: string; body: string; status: Notice['status'] };

const emptyForm = (): Form => ({ title: '', body: '', status: 'draft' });
export default function Admin() {
  const [auth,setAuth] = useState<boolean | null>(null), [configured,setConfigured] = useState(true);
  const [password,setPassword] = useState(''), [notices,setNotices] = useState<Notice[]>([]);
  const [form,setForm] = useState<Form | null>(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [success,setSuccess] = useState('');
  async function api(path: string, init?: RequestInit) {
    const response = await fetch(apiPath(path), { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
    const data = await response.json(); if (!response.ok) { if (response.status === 401) setAuth(false); throw new Error(data.error || '操作失败，请重试'); } return data;
  }
  async function refresh() { const data = await api('/api/admin/notices'); setNotices(data.notices); }
  useEffect(() => { void (async () => { try { const data = await api('/api/admin/session'); setAuth(data.authenticated); setConfigured(data.configured); if (data.authenticated) await refresh(); } catch { setError('无法连接服务，请刷新页面重试'); } })(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/admin/session', { method: 'POST', body: JSON.stringify({ password }) }); setAuth(true); setPassword(''); await refresh(); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function save(status: Notice['status']) {
    if (!form || busy) return;
    setError(''); setSuccess('');
    if (!form.body.trim()) { setError('请填写通知正文'); return; }
    setBusy(true);
    try {
      await api(`/api/admin/notices${form.id ? `/${form.id}` : ''}`, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify({ title: form.title, body: form.body, status }) });
      setForm(null); setSuccess(status === 'published' ? '已发布，学生现在可以查询这条通知。' : '已存为草稿，学生端不可见。'); await refresh();
    } catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function withdraw(notice: Notice) {
    if (!window.confirm(`撤下“${noticeLabel(notice)}”？撤下后将不再用于新的回答。`)) return;
    setBusy(true); setError(''); setSuccess('');
    try { await api(`/api/admin/notices/${notice.id}`, { method: 'PUT', body: JSON.stringify({ title: notice.title, body: notice.body, status: 'draft' }) }); await refresh(); setSuccess('通知已撤下，历史对话中的原回答不会被自动删除。'); }
    catch(e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  async function logout() { try { await api('/api/admin/session', { method: 'DELETE' }); setAuth(false); setNotices([]); setForm(null); setSuccess(''); } catch(e) { setError((e as Error).message); } }
  return <div className="admin-page"><header className="admin-header"><Link href="/" className="brand"><span className="brand-mark"><GraduationCap size={23}/></span><span>课间 <small>通知管理</small></span></Link><Link className="back-link" href="/"><ArrowLeft size={16}/>学生端</Link></header>
    {auth === null ? <div className="center-state"><LoaderCircle className="spin"/>{error || '正在连接管理后台…'}</div> : !auth ? <main className="login-card"><span className="dialog-icon"><LockKeyhole size={27}/></span><span className="eyebrow">给同学们带来新消息</span><h1>管理员登录</h1><p className="muted">发布一条通知，让每个问题都有据可查。</p>{!configured && <p className="info-banner">管理后台尚未配置。请在服务器设置 ADMIN_PASSWORD（至少 6 字符）和 SESSION_SECRET（至少 32 字符），然后重启。</p>}<form onSubmit={login}><label>管理员密码<input type="password" autoComplete="current-password" required value={password} maxLength={256} onChange={e => setPassword(e.target.value)} placeholder="输入管理密码"/></label>{error && <p className="error-text" role="alert">{error}</p>}<button className="primary" disabled={busy || !configured}>{busy ? <LoaderCircle className="spin" size={18}/> : <ArrowUpRight size={18}/>}进入后台</button></form></main> : <main className="admin-main"><div className="admin-title"><div><span className="eyebrow">NOTICE STUDIO</span><h1>把新消息，告诉同学们。</h1><p className="muted">粘贴通知、确认内容，发布后即可用于问答。</p></div><button className="secondary" onClick={logout} disabled={busy}><LogOut size={16}/>退出</button></div>
      {error && <div className="info-banner error-text" role="alert">{error}</div>}{success && <div className="success-banner" role="status"><Check size={17}/>{success}</div>}
      {form ? <section className="editor"><div className="section-heading"><h2>{form.id ? '编辑通知' : '新建通知'}</h2><button className="icon-button" aria-label="关闭编辑" disabled={busy} onClick={() => { if ((!form.body && !form.title) || window.confirm('放弃未保存的修改？')) setForm(null); }}><X size={20}/></button></div><label>通知标题（选填）<input value={form.title} maxLength={120} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="可留空，直接粘贴下方正文即可"/></label><p className="field-hint">发布时间自动记录为点击发布时的时间（北京时间）。</p><label>通知正文<textarea rows={12} value={form.body} maxLength={16000} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="将群通知粘贴到这里。请保留时间、地点、适用对象和注意事项。"/><span className="field-hint">{form.body.length} / 16000 · 发布的内容可被持有链接的任何人查看</span></label><div className="editor-actions"><button disabled={busy} className="secondary" onClick={() => void save('draft')}><Save size={17}/>{form.status === 'published' ? '撤下并保存草稿' : '保存草稿'}</button><button disabled={busy} className="primary" onClick={() => void save('published')}>{busy ? <LoaderCircle className="spin" size={17}/> : <Send size={17}/>}发布通知</button></div></section> : <><div className="section-heading"><h2>全部通知 <span className="count">{notices.length}</span></h2><button className="primary" onClick={() => { setForm(emptyForm()); setError(''); setSuccess(''); }}><Plus size={18}/>新建通知</button></div><div className="admin-notice-list">{!notices.length ? <div className="large-empty"><Send size={30}/><h2>从第一条通知开始</h2><p>点击“新建通知”，粘贴你准备发布的内容。</p></div> : notices.map(n => <article key={n.id} className="admin-notice"><div><span className={`notice-tag ${n.status === 'draft' ? 'draft' : ''}`}>{n.status === 'published' ? '已发布' : '草稿'}</span><h3>{noticeLabel(n)}</h3><p className="muted">{n.status === 'published' ? '发布于' : '草稿保存于'} {dateLabel(n.status === 'published' ? n.noticeAt : n.updatedAt)} · 北京时间</p></div><div className="admin-actions"><button className="secondary" onClick={() => { setForm({ id: n.id, title: n.title, body: n.body, status: n.status }); setError(''); setSuccess(''); }}>编辑</button>{n.status === 'published' && <button className="text-button" disabled={busy} onClick={() => void withdraw(n)}>撤下</button>}</div></article>)}</div></>}
    </main>}</div>;
}
