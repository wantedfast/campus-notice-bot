import { saveNotice, listNotices } from '../src/lib/db';
import { existsSync } from 'node:fs';
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
if (listNotices(true).length) { console.error('数据库已有通知，拒绝混入演示数据。请使用单独的 DATABASE_PATH。'); process.exit(1); }
const entries = [
  { title: '【演示】新学期见面会安排', body: '这是一条演示通知，不是真实校园安排。\n新学期见面会将于 2026 年 9 月 11 日（周五）15:00 在图书馆二楼报告厅举行。\n请提前 10 分钟到场，携带学生证、笔和笔记本。面向全体新生。', noticeAt: '2026-09-06T10:00:00+08:00' },
  { title: '【演示】图书馆开放时间调整', body: '这是一条演示通知。\n9 月 7 日起，图书馆开放时间调整为每天 08:00—22:00。\n进入阅览区请保持安静，饮料请放在指定区域。', noticeAt: '2026-09-05T16:30:00+08:00' },
  { title: '【演示】校园摄影作品征集', body: '这是一条演示通知。\n主题为“校园里的一小片绿”，作品提交截止时间为 9 月 20 日 18:00。\n每人最多提交 3 张原创照片，具体提交方式请联系班级负责人。', noticeAt: '2026-09-04T09:00:00+08:00' }
];
for (const entry of entries) saveNotice({ title: entry.title, body: entry.body, status: 'published' });
console.log('已显式创建 3 条带有【演示】标记的通知。');
