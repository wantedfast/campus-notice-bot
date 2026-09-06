import { claimAnalysisJob, completeAnalysisJob, failAnalysisJob } from './organization-jobs';
import { analyzeNotice } from './organization';
import { HttpError } from './http';

export async function processOneNotice() {
  if(!process.env.DEEPSEEK_API_KEY) return false;
  const job=claimAnalysisJob(); if(!job) return false;
  const started=Date.now();
  const timeout=Math.max(100,Math.min(Number(process.env.ORGANIZATION_TIMEOUT_MS)||25000,45000));
  const abort=AbortSignal.timeout(timeout);
  try {
    const result=await analyzeNotice(job,abort);
    const applied=completeAnalysisJob(job,result);
    console.info(JSON.stringify({event:'notice_organization',status:applied ? result.needsReview ? 'needs_review':'ready':'stale',durationMs:Date.now()-started}));
  } catch(error) {
    const message=abort.aborted ? '整理超时，稍后可重试' : error instanceof HttpError ? error.message : '整理结果格式异常，稍后可重试';
    failAnalysisJob(job,message);
    console.info(JSON.stringify({event:'notice_organization',status:'failed',durationMs:Date.now()-started}));
  }
  return true;
}
const state=globalThis as unknown as {campusOrganizationWorker?:boolean};
export function startNoticeWorker() {
  if(state.campusOrganizationWorker) return;
  state.campusOrganizationWorker=true;
  const tick=async()=>{
    let worked=false;
    try { worked=await processOneNotice(); }
    catch { console.error(JSON.stringify({event:'notice_organization',status:'worker_error'})); }
    setTimeout(tick,worked ? 300 : 2000).unref();
  };
  setTimeout(tick,1000).unref();
}
