import { cpSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const standalone = resolve('.next/standalone');
if (!existsSync(`${standalone}/server.js`)) { console.error('请先运行 npm run build'); process.exit(1); }
cpSync('public', `${standalone}/public`, { recursive: true });
cpSync('.next/static', `${standalone}/.next/static`, { recursive: true });
const child = spawn(process.execPath,[`${standalone}/server.js`],{
  stdio:'inherit', env:{...process.env,NOTICE_WORKER_ENABLED:process.env.NOTICE_WORKER_ENABLED || 'true',HOSTNAME:process.env.HOSTNAME || '0.0.0.0',PORT:process.env.PORT || '3000',DATABASE_PATH:resolve(process.env.DATABASE_PATH || './data/campus.sqlite')}
});
process.on('SIGINT',()=>child.kill()); process.on('SIGTERM',()=>child.kill());
child.on('exit',code=>process.exit(code || 0));
