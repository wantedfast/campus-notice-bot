import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env.local')) { console.log('.env.local 已存在，未修改。'); }
else {
  const env = readFileSync('.env.example','utf8')
    .replace(/^ADMIN_PASSWORD=$/m,`ADMIN_PASSWORD=${randomBytes(18).toString('base64url')}`)
    .replace(/^SESSION_SECRET=$/m,`SESSION_SECRET=${randomBytes(32).toString('hex')}`);
  writeFileSync('.env.local',env,{flag:'wx',mode:0o600});
  console.log('已生成 .env.local 和随机管理员密码。请在本机文件中查看 ADMIN_PASSWORD；DeepSeek Key 保持为空。');
}
