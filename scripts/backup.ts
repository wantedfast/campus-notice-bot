import { backup } from 'node:sqlite';
import { mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { db } from '../src/lib/db';
async function main() {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  const target = resolve(process.argv[2] || `backups/campus-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`);
  mkdirSync(dirname(target), { recursive: true });
  await backup(db(), target); console.log(`备份完成：${target}`);
}
main().catch(() => { console.error('备份失败，请检查目录权限和数据库路径。'); process.exitCode = 1; });
