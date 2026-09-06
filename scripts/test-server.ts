import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { saveNotice, db } from '../src/lib/db';
const dir = mkdtempSync(join(tmpdir(),'campus-e2e-'));
process.env.DATABASE_PATH = join(dir,'test.sqlite');
saveNotice({title:'新生见面会',body:'新生见面会周五15点在图书馆举行，请带学生证。',status:'published'});
const mock = createServer(async (req,res) => {
  let body = ''; for await (const chunk of req) body += chunk;
  const payload = JSON.parse(body); const last = payload.messages.at(-1).content as string;
  if(payload.response_format?.type==='json_object'){
    const input=JSON.parse(last);const raw=input.body as string;
    if(raw.includes('整理格式异常')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:'invalid-json'}}]}));return;}
    const category=raw.includes('调课')?'teaching':raw.includes('作业')?'assignments':raw.includes('招聘')?'careers':raw.includes('摄影')?'activities':raw.includes('缴费')?'campus':'other';
    const title=raw.split('\n')[0].slice(0,30);const summary=raw.slice(0,100);
    const result={category,title,summary,evidence:category==='other'?'':raw.slice(0,100)};
    const timer=setTimeout(()=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(result)},finish_reason:'stop'}]}));},raw.includes('慢速整理')?650:20);
    res.on('close',()=>clearTimeout(timer));return;
  }
  if (last.includes('额度测试')) { res.writeHead(402); res.end(); return; }
  if (last.includes('超时测试')) { const timer = setTimeout(()=>res.end(),5000); res.on('close',()=>clearTimeout(timer)); return; }
  res.writeHead(200,{'Content-Type':'text/event-stream'});
  const write = (text:string) => res.write(`data: ${JSON.stringify({ choices:[{delta:{content:text}}] })}\n\n`);
  write(last.includes('长文测试') ? ('这是见面会的详细说明，请查看通知原文[1]。\n'.repeat(60)) : '根据已发布通知，');
  const timer = setTimeout(()=>{
    write('见面会的安排请查看原文[1]。');
    if (last.includes('断网测试')) { res.end(); return; }
    write('无效编号不会保留[999]。'); res.end('data: [DONE]\n\n');
  },last.includes('停止测试') ? 4000 : last.includes('长文测试') ? 650 : 80);
  res.on('close',()=>clearTimeout(timer));
});
mock.listen(3198,'127.0.0.1',()=>{
  const child = spawn(process.execPath,['scripts/start.mjs'],{
    stdio:'inherit', env:{...process.env,HOSTNAME:'127.0.0.1',PORT:'3199',APP_URL:'http://127.0.0.1:3199',DATABASE_PATH:join(dir,'test.sqlite'),ADMIN_PASSWORD:'e2e-only-password',SESSION_SECRET:'test-only-secret-'.repeat(4),DEEPSEEK_API_KEY:'mock-key',DEEPSEEK_BASE_URL:'http://127.0.0.1:3198',CHAT_TIMEOUT_MS:'1200',TRUST_PROXY:'false'}
  });
  const stop = () => { child.kill(); mock.close(); };
  process.on('SIGINT',stop); process.on('SIGTERM',stop);
  child.on('exit',code=>{ mock.close(); db().close(); try { rmSync(dir,{recursive:true,force:true}); } catch {} process.exit(code || 0); });
});
