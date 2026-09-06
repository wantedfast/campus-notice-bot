'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, GraduationCap, LoaderCircle, LockKeyhole, LogOut, Plus, Save, Send, Sparkles, X } from 'lucide-react';
import { dateLabel, noticeLabel, type Notice } from '@/lib/types';
import { CATEGORIES, categoryLabel, analysisLabel, type NoticeCategory } from '@/lib/categories';
import { apiPath } from '@/lib/urls';
import CategoryFilter from '@/components/category-filter';

type Form={id?:string;title:string;body:string;status:Notice['status'];categoryMode:'auto'|NoticeCategory;summaryMode:'auto'|'manual';manualSummary:string};
const emptyForm=():Form=>({title:'',body:'',status:'draft',categoryMode:'auto',summaryMode:'auto',manualSummary:''});
export default function Admin() {
  const [auth,setAuth]=useState<boolean|null>(null),[configured,setConfigured]=useState(true),[analysisConfigured,setAnalysisConfigured]=useState(false);
  const [password,setPassword]=useState(''),[notices,setNotices]=useState<Notice[]>([]),[category,setCategory]=useState<'all'|NoticeCategory>('all');
  const [form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
  const api=useCallback(async(path:string,init?:RequestInit)=>{
    const response=await fetch(apiPath(path),{...init,headers:{'Content-Type':'application/json',...init?.headers}});
    const data=await response.json();
    if(!response.ok){if(response.status===401)setAuth(false);throw new Error(data.error||'操作失败，请重试');}return data;
  },[]);
  const refresh=useCallback(async()=>{const data=await api('/api/admin/notices');setNotices(data.notices);setAnalysisConfigured(data.analysisConfigured);},[api]);
  useEffect(()=>{void(async()=>{try{const data=await api('/api/admin/session');setAuth(data.authenticated);setConfigured(data.configured);if(data.authenticated)await refresh();}catch{setError('无法连接服务，请刷新页面重试');}})();},[api,refresh]);
  useEffect(()=>{if(!auth)return;const tick=()=>{if(document.visibilityState==='visible')void refresh().catch(()=>setError('通知更新失败，请稍后重试'));};const timer=setInterval(tick,3000);return()=>clearInterval(timer);},[auth,refresh]);
  async function login(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{await api('/api/admin/session',{method:'POST',body:JSON.stringify({password})});setAuth(true);setPassword('');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  const current=form?.id?notices.find(n=>n.id===form.id):undefined;
  const contentChanged=!!(current&&form&&(form.title!==current.title||form.body!==current.body));
  function overrides(){
    if(!form)return {};
    return {categoryOverride:form.categoryMode==='auto'?(current?.categoryLocked?null:undefined):form.categoryMode,
      summaryOverride:form.summaryMode==='auto'?(current?.summaryLocked?null:undefined):form.manualSummary};
  }
  async function save(status:Notice['status']){
    if(!form||busy)return;setError('');setSuccess('');if(!form.body.trim()){setError('请填写通知正文');return;}setBusy(true);
    try{await api(`/api/admin/notices${form.id?`/${form.id}`:''}`,{method:form.id?'PUT':'POST',body:JSON.stringify({title:form.title,body:form.body,status,...overrides()})});
      setForm(null);setSuccess(status==='published'?'已发布，分类和摘要将在后台自动整理。':'已存为草稿，学生端不可见。');await refresh();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function saveOrganization(){
    if(contentChanged){setError('标题或正文有未保存修改，请使用下方发布或保存草稿按钮。');return;}
    if(!form?.id||busy)return;const changes=overrides();if(!Object.values(changes).some(v=>v!==undefined)){setSuccess('当前使用自动整理，无需保存修正。');return;}
    setBusy(true);setError('');setSuccess('');
    try{await api(`/api/admin/notices/${form.id}/organization`,{method:'PATCH',body:JSON.stringify(changes)});await refresh();setForm(null);setSuccess('分类与摘要已保存，手动修正会被保留。');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function organize(id?:string){
    if(busy)return;setBusy(true);setError('');setSuccess('');
    try{const data=await api(id?`/api/admin/notices/${id}/organization`:'/api/admin/organization',{method:'POST'});await refresh();setSuccess(data.queued?`已安排 ${data.queued} 条通知整理，手动修正会被保留。`:'通知已在整理中，或没有待整理的历史通知。');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function withdraw(notice:Notice){
    if(!window.confirm(`撤下“${noticeLabel(notice)}”？撤下后将不再用于新的回答。`))return;setBusy(true);setError('');setSuccess('');
    try{await api(`/api/admin/notices/${notice.id}`,{method:'PUT',body:JSON.stringify({title:notice.title,body:notice.body,status:'draft'})});await refresh();setSuccess('通知已撤下，历史对话中的原回答不会被自动删除。');}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function logout(){try{await api('/api/admin/session',{method:'DELETE'});setAuth(false);setNotices([]);setForm(null);setSuccess('');}catch(e){setError((e as Error).message);}}
  function edit(n:Notice){setForm({id:n.id,title:n.title,body:n.body,status:n.status,categoryMode:n.categoryLocked?n.category:'auto',summaryMode:n.summaryLocked?'manual':'auto',manualSummary:n.summary});setError('');setSuccess('');}
  const pending=notices.filter(n=>['pending','running'].includes(n.analysisState)).length;
  const filtered=notices.filter(n=>category==='all'||n.category===category);
  return <div className="admin-page">
    <header className="admin-header"><Link href="/" className="brand"><span className="brand-mark"><GraduationCap size={23}/></span><span>课间 <small>通知管理</small></span></Link><Link className="back-link" href="/"><ArrowLeft size={16}/>学生端</Link></header>
    {auth===null?<div className="center-state"><LoaderCircle className="spin"/>{error||'正在连接管理后台…'}</div>:!auth?
      <main className="login-card"><span className="dialog-icon"><LockKeyhole size={27}/></span><span className="eyebrow">给同学们带来新消息</span><h1>管理员登录</h1><p className="muted">发布一条通知，让每个问题都有据可查。</p>
        {!configured&&<p className="info-banner">管理后台尚未配置。请在服务器设置 ADMIN_PASSWORD（至少 6 字符）和 SESSION_SECRET（至少 32 字符），然后重启。</p>}
        <form onSubmit={login}><label>管理员密码<input type="password" autoComplete="current-password" required value={password} maxLength={256} onChange={e=>setPassword(e.target.value)} placeholder="输入管理密码"/></label>
          {error&&<p className="error-text" role="alert">{error}</p>}<button className="primary" disabled={busy||!configured}>{busy?<LoaderCircle className="spin" size={18}/>:<ArrowUpRight size={18}/>}进入后台</button></form>
      </main>:
      <main className="admin-main"><div className="admin-title"><div><span className="eyebrow">NOTICE STUDIO</span><h1>把新消息，告诉同学们。</h1><p className="muted">粘贴正文即可发布，分类与摘要交给课间。</p></div><button className="secondary" onClick={logout} disabled={busy}><LogOut size={16}/>退出</button></div>
        {error&&<div className="info-banner error-text" role="alert">{error}</div>}{success&&<div className="success-banner" role="status"><Check size={17}/>{success}</div>}
        {!analysisConfigured&&<p className="info-banner">AI 尚未配置，发布和手动分类可正常使用；配置后会继续整理待处理通知。</p>}
        {form?<section className="editor"><div className="section-heading"><h2>{form.id?'编辑通知':'新建通知'}</h2><button className="icon-button" aria-label="关闭编辑" disabled={busy} onClick={()=>{if((!form.body&&!form.title)||window.confirm('放弃未保存的修改？'))setForm(null);}}><X size={20}/></button></div>
          <label>通知标题（选填）<input value={form.title} maxLength={120} onChange={e=>setForm({...form,title:e.target.value})} placeholder={current?.generatedTitle?`留空时使用：${current.generatedTitle}`:'可留空，发布后会自动生成简短标题'}/></label>
          <p className="field-hint">发布时间自动记录为点击发布时的时间（北京时间）。</p>
          <label>通知正文<textarea rows={10} value={form.body} maxLength={16000} onChange={e=>setForm({...form,body:e.target.value})} placeholder="将群通知粘贴到这里。请保留时间、地点、适用对象和注意事项。"/><span className="field-hint">{form.body.length} / 16000 · 发布的内容可被持有链接的任何人查看</span></label>
          <section className="organization-editor" aria-label="分类与摘要"><div className="section-heading"><h2><Sparkles size={17}/>分类与摘要</h2>{current&&<span className={`analysis-badge ${current.analysisState}`}>{analysisLabel(current.analysisState,analysisConfigured)}</span>}</div>
            <p className="field-hint">自动整理会保留原文。选择手动分类或摘要后，之后的自动整理会保留你的修正。</p>
            <label>通知分类<select aria-label="通知分类" value={form.categoryMode} onChange={e=>setForm({...form,categoryMode:e.target.value as Form['categoryMode']})}><option value="auto">自动识别{current?`（当前：${categoryLabel(current.category)}）`:''}</option>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
            <label className="check-label"><input type="checkbox" checked={form.summaryMode==='manual'} onChange={e=>setForm({...form,summaryMode:e.target.checked?'manual':'auto',manualSummary:form.manualSummary||current?.summary||''})}/>手动编辑摘要</label>
            {form.summaryMode==='manual'?<label>通知摘要<textarea aria-label="通知摘要" rows={3} maxLength={160} value={form.manualSummary} onChange={e=>setForm({...form,manualSummary:e.target.value})} placeholder="用一两句话说明主要安排"/><span className="field-hint">{form.manualSummary.length} / 160</span></label>:<div className="auto-summary">{current?.summary||'发布后自动生成一句话摘要；整理完成前直接展示正文。'}</div>}
            {current?.analysisError&&<p className="analysis-error">{current.analysisError}</p>}
            {contentChanged&&<p className="field-hint">标题或正文有未保存修改，请用下方“发布通知”或保存草稿按钮一并保存。</p>}
            {form.id&&<div className="organization-actions"><button className="secondary" disabled={busy||contentChanged} onClick={saveOrganization}><Save size={16}/>保存分类与摘要</button>{form.status==='published'&&<button className="text-button" disabled={busy||contentChanged||!analysisConfigured||current?.analysisState==='running'||current?.analysisState==='pending'} onClick={()=>void organize(form.id)}><Sparkles size={16}/>重新自动整理</button>}</div>}
          </section>
          <div className="editor-actions"><button disabled={busy} className="secondary" onClick={()=>void save('draft')}><Save size={17}/>{form.status==='published'?'撤下并保存草稿':'保存草稿'}</button><button disabled={busy} className="primary" onClick={()=>void save('published')}>{busy?<LoaderCircle className="spin" size={17}/>:<Send size={17}/>}发布通知</button></div>
        </section>:<>
          <div className="organization-overview"><span><Sparkles size={20}/><span><strong>通知自动整理</strong><small>{pending?`${pending} 条通知${analysisConfigured?'等待整理或正在整理':'等待配置 AI'}`:'分类、标题和摘要，让通知更好找'}</small></span></span><button className="secondary" disabled={busy||!analysisConfigured} onClick={()=>void organize()}>整理历史通知</button></div>
          <div className="section-heading"><h2>全部通知 <span className="count">{notices.length}</span></h2><button className="primary" onClick={()=>{setForm(emptyForm());setError('');setSuccess('');}}><Plus size={18}/>新建通知</button></div>
          <CategoryFilter value={category} onChange={setCategory} notices={notices}/>
          <div className="admin-notice-list">{!filtered.length?<div className="large-empty"><Send size={30}/><h2>{notices.length?'这个分类还没有通知':'从第一条通知开始'}</h2><p>{notices.length?'可以切换分类查看。':'点击“新建通知”，粘贴你准备发布的内容。'}</p></div>:filtered.map(n=><article key={n.id} className="admin-notice"><div><div className="notice-badges"><span className={`notice-tag ${n.status==='draft'?'draft':''}`}>{n.status==='published'?'已发布':'草稿'}</span><span className="notice-tag" data-category={n.category}>{categoryLabel(n.category)}</span><span className={`analysis-badge ${n.analysisState}`}>{analysisLabel(n.analysisState,analysisConfigured)}</span>{(n.categoryLocked||n.summaryLocked)&&<span className="manual-badge"><LockKeyhole size={11}/>已手动修正</span>}</div>
            <h3>{noticeLabel(n)}</h3>{n.summary&&<p className="admin-summary">{n.summary}</p>}<p className="muted">{n.status==='published'?'发布于':'草稿保存于'} {dateLabel(n.status==='published'?n.noticeAt:n.updatedAt)} · 北京时间</p></div>
            <div className="admin-actions"><button className="secondary" onClick={()=>edit(n)}>编辑</button>{n.status==='published'&&<button className="text-button" disabled={busy} onClick={()=>void withdraw(n)}>撤下</button>}</div></article>)}</div>
        </>}
      </main>}
  </div>;
}
