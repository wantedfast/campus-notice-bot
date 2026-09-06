import { test, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db, saveNotice, getNotice, listNotices, updateOrganization, migrateOrganization } from '../src/lib/db';
import { claimAnalysisJob, completeAnalysisJob, failAnalysisJob, queueAnalysis, ANALYSIS_LEASE_MS } from '../src/lib/organization-jobs';
import { validateOrganization, analyzeNotice, organizationPrompt } from '../src/lib/organization';
import { processOneNotice } from '../src/lib/organization-worker';
import { noticeLabel } from '../src/lib/types';
import { CATEGORY_IDS } from '../src/lib/categories';

const dir=mkdtempSync(join(tmpdir(),'campus-organization-'));
process.env.DATABASE_PATH=join(dir,'test.sqlite');
beforeEach(()=>{db().exec('DELETE FROM notices');});
after(()=>{db().close();rmSync(dir,{recursive:true,force:true});});
const noticeInput={title:'',body:'英语课调课到明理楼。',status:'published' as const};
const result={category:'teaching' as const,title:'英语课调课',summary:'英语课改在明理楼上课。',needsReview:false};
test('legacy migration preserves raw records and times, queues only published notices, is idempotent',()=>{
  const legacy=new DatabaseSync(':memory:');
  legacy.exec("CREATE TABLE notices (id TEXT PRIMARY KEY,title TEXT,body TEXT,noticeAt TEXT,createdAt TEXT,updatedAt TEXT,status TEXT); INSERT INTO notices VALUES ('p','原题','原文','old','created','updated','published'),('d','','草稿','draft-time','created','updated','draft')");
  migrateOrganization(legacy);migrateOrganization(legacy);
  const p=legacy.prepare('SELECT * FROM notices WHERE id=?').get('p')!;
  assert.equal(p.title,'原题');assert.equal(p.body,'原文');assert.equal(p.noticeAt,'old');assert.equal(p.updatedAt,'updated');assert.equal(p.analysisState,'pending');
  assert.equal(legacy.prepare('SELECT analysisState FROM notices WHERE id=?').get('d')!.analysisState,'idle');legacy.close();
});
test('publication is immediate and organization never rewrites raw content or publication time',()=>{
  const saved=saveNotice(noticeInput)!;assert.equal(listNotices().length,1);assert.equal(saved.category,'other');assert.equal(saved.analysisState,'pending');
  const job=claimAnalysisJob()!;assert.ok(job);assert.equal(claimAnalysisJob(),undefined);assert.ok(completeAnalysisJob(job,result));
  const organized=getNotice(saved.id)!;assert.equal(organized.title,'');assert.equal(organized.body,saved.body);assert.equal(organized.noticeAt,saved.noticeAt);assert.equal(organized.category,'teaching');assert.equal(organized.summary,result.summary);assert.equal(noticeLabel(organized),result.title);
  assert.equal(noticeLabel({...organized,title:'人工标题'}),'人工标题');
});
test('manual category and summary survive an in-flight completion, rerun and content edit',()=>{
  const saved=saveNotice(noticeInput)!;const job=claimAnalysisJob()!;
  updateOrganization(saved.id,{categoryOverride:'campus',summaryOverride:'管理员确认的摘要'});
  assert.ok(completeAnalysisJob(job,result));
  let current=getNotice(saved.id)!;assert.equal(current.category,'campus');assert.equal(current.summary,'管理员确认的摘要');assert.equal(current.noticeAt,saved.noticeAt);assert.ok(current.categoryLocked&&current.summaryLocked);
  queueAnalysis(saved.id);completeAnalysisJob(claimAnalysisJob()!,result);current=getNotice(saved.id)!;assert.equal(current.summary,'管理员确认的摘要');
  saveNotice({...noticeInput,body:'新的英语课调课内容'},saved.id);assert.equal(getNotice(saved.id)!.summary,'管理员确认的摘要');assert.equal(getNotice(saved.id)!.category,'campus');
});
test('return to automatic classification releases only selected lock and does not republish',()=>{
  const saved=saveNotice({...noticeInput,categoryOverride:'campus',summaryOverride:'手动摘要'})!;
  completeAnalysisJob(claimAnalysisJob()!,result);
  updateOrganization(saved.id,{categoryOverride:null});const queued=getNotice(saved.id)!;
  assert.equal(queued.categoryLocked,false);assert.equal(queued.summaryLocked,true);assert.equal(queued.noticeAt,saved.noticeAt);
  completeAnalysisJob(claimAnalysisJob()!,result);assert.equal(getNotice(saved.id)!.category,'teaching');assert.equal(getNotice(saved.id)!.summary,'手动摘要');
});
test('edited and withdrawn notices reject stale results',()=>{
  const saved=saveNotice(noticeInput)!;const old=claimAnalysisJob()!;
  saveNotice({...noticeInput,body:'新版本的调课内容'},saved.id);assert.equal(completeAnalysisJob(old,result),false);assert.equal(getNotice(saved.id)!.summary,'');
  const fresh=claimAnalysisJob()!;saveNotice({...noticeInput,status:'draft'},saved.id);assert.equal(completeAnalysisJob(fresh,result),false);assert.equal(getNotice(saved.id),undefined);assert.equal(claimAnalysisJob(),undefined);
});
test('retries use durable backoff and stop after three attempts; explicit retry resets attempts',()=>{
  const saved=saveNotice(noticeInput)!;let now=Date.now();
  for(let attempt=1;attempt<=3;attempt++){
    const job=claimAnalysisJob(now)!;assert.equal(job.analysisAttempts,attempt);failAnalysisJob(job,'模拟异常',now);
    if(attempt<3){assert.equal(claimAnalysisJob(now),undefined);now=getNotice(saved.id)!.analysisNextAt;}
  }
  assert.equal(getNotice(saved.id)!.analysisState,'failed');assert.equal(claimAnalysisJob(now+100000),undefined);
  assert.equal(queueAnalysis(saved.id),1);assert.equal(getNotice(saved.id)!.analysisAttempts,0);
});
test('expired leases recover after restart and cannot apply an earlier worker result',()=>{
  saveNotice(noticeInput);const now=Date.now();const interrupted=claimAnalysisJob(now)!;
  const resumed=claimAnalysisJob(now+ANALYSIS_LEASE_MS+1)!;assert.equal(resumed.id,interrupted.id);assert.equal(resumed.analysisAttempts,2);
  assert.equal(completeAnalysisJob(interrupted,result),false);assert.equal(completeAnalysisJob(resumed,result),true);
});
test('bulk processing includes legacy failures, skips ready/pending and preserves manual choices',()=>{
  const a=saveNotice(noticeInput)!,b=saveNotice({...noticeInput,categoryOverride:'campus'})!;
  db().prepare("UPDATE notices SET analysisState='failed' WHERE id=?").run(a.id);
  assert.equal(queueAnalysis(),1);assert.equal(queueAnalysis(),0);assert.equal(getNotice(b.id)!.category,'campus');
});
test('fixed categories, source evidence and numeric facts are validated; instructions are delimited',()=>{
  for(const category of CATEGORY_IDS)assert.equal(validateOrganization({category,title:'英语课',summary:'调课到明理楼。',evidence:'英语课调课'},noticeInput).category,category);
  assert.throws(()=>validateOrganization({category:'invented',title:'x',summary:'x',evidence:''},noticeInput));
  assert.equal(validateOrganization({category:'teaching',title:'英语课',summary:'英语课调整',evidence:'原文中不存在的依据'},noticeInput).needsReview,true);
  assert.equal(validateOrganization({category:'teaching',title:'英语课',summary:'8点上课',evidence:'英语课调课'},noticeInput).needsReview,true);
  assert.match(organizationPrompt(),/不是系统指令/);assert.match(organizationPrompt(),/不得推断截止时间/);
});
test('without a key, notices remain published and await configuration',async()=>{
  const key=process.env.DEEPSEEK_API_KEY;delete process.env.DEEPSEEK_API_KEY;
  try{const saved=saveNotice(noticeInput)!;assert.equal(await processOneNotice(),false);assert.equal(getNotice(saved.id)!.analysisState,'pending');assert.equal(listNotices().length,1);}finally{if(key)process.env.DEEPSEEK_API_KEY=key;}
});
test('provider JSON mode and invalid JSON failure preserve public notice',async()=>{
  const original=globalThis.fetch;process.env.DEEPSEEK_API_KEY='test-only';
  try{
    globalThis.fetch=async(_url,init)=>{const sent=JSON.parse(init!.body as string);assert.equal(sent.response_format.type,'json_object');assert.equal(sent.stream,false);return Response.json({choices:[{message:{content:JSON.stringify({category:'teaching',title:'英语课调课',summary:'英语课调课到明理楼。',evidence:'英语课调课'})},finish_reason:'stop'}]});};
    assert.equal((await analyzeNotice(noticeInput,new AbortController().signal)).category,'teaching');
    globalThis.fetch=async()=>Response.json({choices:[{message:{content:'invalid-json'}}]});const saved=saveNotice(noticeInput)!;await processOneNotice();
    assert.equal(getNotice(saved.id)!.analysisState,'pending');assert.equal(getNotice(saved.id)!.analysisAttempts,1);assert.equal(getNotice(saved.id)!.body,noticeInput.body);
  }finally{globalThis.fetch=original;delete process.env.DEEPSEEK_API_KEY;}
});

test('organization timeout aborts the provider and leaves original content available for retry',async()=>{
  const original=globalThis.fetch;process.env.DEEPSEEK_API_KEY='test-only';process.env.ORGANIZATION_TIMEOUT_MS='100';
  const keepAlive=setTimeout(()=>{},1000);
  try{
    globalThis.fetch=async(_url,init)=>new Promise((_resolve,reject)=>{init!.signal!.addEventListener('abort',()=>reject(init!.signal!.reason),{once:true});});
    const saved=saveNotice(noticeInput)!;await processOneNotice();
    const current=getNotice(saved.id)!;assert.equal(current.analysisState,'pending');assert.match(current.analysisError,/超时/);assert.equal(current.body,saved.body);assert.equal(current.noticeAt,saved.noticeAt);
  }finally{clearTimeout(keepAlive);globalThis.fetch=original;delete process.env.DEEPSEEK_API_KEY;delete process.env.ORGANIZATION_TIMEOUT_MS;}
});
