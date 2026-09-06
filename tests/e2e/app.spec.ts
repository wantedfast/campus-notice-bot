import { test, expect } from '@playwright/test';
const origin = 'http://127.0.0.1:3199';
const base = { title:'新生见面会',body:'新生见面会周五15点在图书馆举行，请带学生证。',noticeAt:'2026-09-06T02:00:00.000Z',status:'draft' };
test('admin lifecycle, CSRF, draft privacy and immediate public updates',async ({request})=>{
  expect((await request.post('/api/admin/notices',{data:base,headers:{origin}})).status()).toBe(401);
  expect((await request.post('/api/admin/session',{data:{password:'e2e-only-password'},headers:{origin:'https://evil.example'}})).status()).toBe(403);
  expect((await request.post('/api/admin/session',{data:{password:'e2e-only-password'},headers:{origin}})).ok()).toBeTruthy();
  const created = await request.post('/api/admin/notices',{data:base,headers:{origin}}); expect(created.status()).toBe(201);
  const {notice} = await created.json();
  expect((await request.get(`/api/notices/${notice.id}`)).status()).toBe(404);
  expect((await request.put(`/api/admin/notices/${notice.id}`,{data:{...base,status:'published'},headers:{origin}})).ok()).toBeTruthy();
  expect((await (await request.get(`/api/notices/${notice.id}`)).json()).notice.body).toContain('周五');
  await request.put(`/api/admin/notices/${notice.id}`,{data:{...base,status:'published',body:'更正：新生见面会改为周六15点。'},headers:{origin}});
  expect((await (await request.get(`/api/notices/${notice.id}`)).json()).notice.body).toContain('周六');
  await request.put(`/api/admin/notices/${notice.id}`,{data:base,headers:{origin}});
  expect((await request.get(`/api/notices/${notice.id}`)).status()).toBe(404);
  await request.delete('/api/admin/session',{headers:{origin}});
  expect((await request.get('/api/admin/notices')).status()).toBe(401);
});
test('mobile chat streams, cites actual notices, persists and clears',async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/');
  await expect(page.getByRole('heading',{name:/今天想了解什么/})).toBeVisible();
  await page.getByRole('textbox',{name:'输入你的问题'}).fill('新生见面会几点开始？');
  await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.locator('.message.assistant .message-text')).toContainText('见面会的安排');
  await expect(page.getByRole('button',{name:'停止生成'})).toHaveCount(0);
  await expect(page.locator('.message.assistant')).not.toContainText('[999]');
  await expect(page.locator('.source-list a')).toHaveCount(1);
  await page.reload(); await expect(page.locator('.message.user')).toContainText('新生见面会');
  await page.getByRole('button',{name:'清空对话'}).click(); await page.getByRole('button',{name:'清空并开始'}).click();
  await expect(page.locator('.message')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});
test('error states: balance, timeout, disconnect and retry',async ({page})=>{
  await page.goto('/');
  for (const [query,error] of [['新生见面会额度测试','额度不足'],['新生见面会超时测试','超时'],['新生见面会断网测试','连接中断']]) {
    await page.getByRole('textbox',{name:'输入你的问题'}).fill(query); await page.getByRole('button',{name:'发送问题'}).click();
    await expect(page.locator('.chat-error')).toContainText(error);
    await expect(page.getByRole('button',{name:'重试',exact:true})).toBeVisible();
  }
  await page.getByRole('button',{name:'重试',exact:true}).click(); await expect(page.locator('.chat-error')).toContainText('连接中断');
});
test('stop generation and no matching source',async ({page})=>{
  await page.goto('/'); await page.getByRole('textbox',{name:'输入你的问题'}).fill('新生见面会停止测试'); await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.locator('.message.assistant .message-text')).toContainText('根据已发布通知');
  await page.getByRole('button',{name:'停止生成'}).click();
  await expect(page.locator('.message.assistant')).toContainText('已停止');
  await page.getByRole('textbox',{name:'输入你的问题'}).fill('火星气象预报'); await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.locator('.message.assistant').last()).toContainText('没有找到相关信息');
});
test('360px, desktop, search, notice page and admin editor',async ({page})=>{
  await page.setViewportSize({width:360,height:740}); await page.goto('/notices');
  await page.getByRole('textbox',{name:'搜索通知'}).fill('新生');
  await page.locator('.notice-card').first().click(); await expect(page.locator('.notice-body')).toContainText('学生证');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.goto('/admin'); await page.getByLabel('管理员密码').fill('e2e-only-password'); await page.getByRole('button',{name:'进入后台'}).click();
  await page.getByRole('button',{name:'新建通知'}).click(); await page.getByLabel('通知标题').fill('移动端测试草稿'); await page.getByLabel('通知正文').fill('长内容'.repeat(300));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.getByRole('button',{name:'保存草稿',exact:true}).click(); await expect(page.getByRole('status')).toContainText('草稿');
  await page.setViewportSize({width:1440,height:1000}); await page.goto('/'); await expect(page.locator('.sidebar')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test('long mobile answer respects user scroll and remains within viewport',async ({page})=>{
  await page.setViewportSize({width:360,height:740}); await page.goto('/');
  await page.getByRole('textbox',{name:'输入你的问题'}).fill('新生见面会长文测试'); await page.getByRole('button',{name:'发送问题'}).click();
  await expect(page.locator('.message.assistant .message-text')).toContainText('详细说明');
  await page.locator('.chat-feed').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
  await expect(page.getByRole('button',{name:'停止生成'})).toHaveCount(0);
  expect(await page.locator('.chat-feed').evaluate(el=>el.scrollTop)).toBeLessThan(10);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
test('publish body without title or date and display automatic publication time',async ({page})=>{
  await page.setViewportSize({width:390,height:844}); await page.goto('/admin');
  await page.getByLabel('管理员密码').fill('e2e-only-password'); await page.getByRole('button',{name:'进入后台'}).click();
  await page.getByRole('button',{name:'新建通知'}).click();
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await page.getByLabel('通知正文').fill('无标题专项通知正文\n请查看具体安排。');
  const before = Date.now();
  const publishedResponse = page.waitForResponse(r=>r.url().endsWith('/api/admin/notices') && r.request().method()==='POST');
  await page.getByRole('button',{name:'发布通知',exact:true}).click();
  const {notice} = await (await publishedResponse).json();
  expect(notice.title).toBe(''); expect(Date.parse(notice.noticeAt)).toBeGreaterThanOrEqual(before);
  expect(Date.parse(notice.noticeAt)).toBeLessThanOrEqual(Date.now());
  await expect(page.getByRole('heading',{name:'无标题专项通知正文'})).toBeVisible();
  await page.goto(`/notices/${notice.id}`); await expect(page.getByRole('heading',{name:'无标题专项通知正文'})).toBeVisible();
  await expect(page.locator('.notice-body')).toContainText('请查看具体安排');
});
