import { spawn } from 'node:child_process';
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','0.0.0.0',...process.argv.slice(2)],{
  stdio:'inherit',env:{...process.env,NOTICE_WORKER_ENABLED:process.env.NOTICE_WORKER_ENABLED || 'true'}
});
process.on('SIGINT',()=>child.kill());process.on('SIGTERM',()=>child.kill());child.on('exit',code=>process.exit(code||0));
