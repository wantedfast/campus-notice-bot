export async function register() {
  if(process.env.NEXT_RUNTIME==='nodejs' && process.env.NOTICE_WORKER_ENABLED==='true') {
    const { startNoticeWorker }=await import('./lib/organization-worker');
    startNoticeWorker();
  }
}
