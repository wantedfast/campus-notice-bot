import {test,expect,type APIRequestContext} from '@playwright/test';
const origin='http://127.0.0.1:3199';
const headers={origin};
async function login(request:APIRequestContext){expect((await request.post('/api/admin/session',{headers,data:{password:'e2e-only-password'}})).ok()).toBeTruthy();}
async function create(request:APIRequestContext,body:string,title=''){
  const response=await request.post('/api/admin/notices',{headers,data:{body,title,status:'published'}});expect(response.status()).toBe(201);return (await response.json()).notice;
}
async function ready(request:APIRequestContext,id:string){await expect.poll(async()=>((await (await request.get(`/api/notices/${id}`)).json()).notice?.analysisState),{timeout:15000}).toBe('ready');return (await (await request.get(`/api/notices/${id}`)).json()).notice;}
test('six categories, asynchronous processing, malformed fallback, manual lock and stale edits',async({request})=>{
  await login(request);
  const samples=[['teaching','自动测试英语调课到明理楼。'],['assignments','自动测试数据库作业本周提交。'],['activities','自动测试校园摄影报名。'],['careers','自动测试企业招聘登记。'],['campus','自动测试宿舍缴费说明。'],['other','自动测试尚未说明具体事项。']];
  const created=[];
  for(const [category,body]of samples){const n=await create(request,body);expect(n.body).toBe(body);created.push({id:n.id,category,body,noticeAt:n.noticeAt});}
  for(const sample of created){const n=await ready(request,sample.id);expect(n.category).toBe(sample.category);expect(n.title).toBe('');expect(n.generatedTitle).toBeTruthy();expect(n.summary).toBeTruthy();expect(n.body).toBe(sample.body);expect(n.noticeAt).toBe(sample.noticeAt);}
  const filtered=await(await request.get('/api/notices?category=careers&q=自动测试')).json();expect(filtered.notices).toHaveLength(1);expect(filtered.notices[0].id).toBe(created[3].id);
  expect((await request.get('/api/notices?category=invalid')).status()).toBe(400);
  const sample=created[0];expect((await request.patch(`/api/admin/notices/${sample.id}/organization`,{headers:{origin:'https://evil.example'},data:{categoryOverride:'campus'}})).status()).toBe(403);
  expect((await request.patch(`/api/admin/notices/${sample.id}/organization`,{headers,data:{categoryOverride:'campus',summaryOverride:'手动确认摘要'}})).ok()).toBeTruthy();
  await request.post(`/api/admin/notices/${sample.id}/organization`,{headers});const manual=await ready(request,sample.id);expect(manual.category).toBe('campus');expect(manual.summary).toBe('手动确认摘要');expect(manual.noticeAt).toBe(sample.noticeAt);
  const broken=await create(request,'整理格式异常：这条原文仍然可以阅读。');
  await expect.poll(async()=>((await(await request.get(`/api/notices/${broken.id}`)).json()).notice?.analysisAttempts),{timeout:10000}).toBeGreaterThan(0);
  expect((await(await request.get(`/api/notices/${broken.id}`)).json()).notice.body).toContain('原文仍然可以阅读');
  const slow=await create(request,'慢速整理：旧的英语调课说明。');
  await expect.poll(async()=>((await(await request.get(`/api/notices/${slow.id}`)).json()).notice?.analysisState),{intervals:[30,50,50],timeout:10000}).toBe('running');
  await request.put(`/api/admin/notices/${slow.id}`,{headers,data:{body:'新版本作业提交说明。',status:'published'}});
  const latest=await ready(request,slow.id);expect(latest.category).toBe('assignments');expect(latest.summary).toContain('新版本');expect(latest.summary).not.toContain('旧的');
});
test('mobile filters, summary detail and administrator corrections',async({page},info)=>{
  await page.setViewportSize({width:390,height:844});await login(page.request);
  const n=await create(page.request,'手机验收摄影活动\n请提交原创摄影作品。','手机验收摄影活动');await ready(page.request,n.id);
  await page.goto('/notices');await page.getByRole('textbox',{name:'搜索通知'}).fill('手机验收');
  const filter=page.getByRole('group',{name:'按通知分类'});
  await filter.getByRole('button',{name:/活动报名/}).click();await expect(page.locator('.notice-card')).toHaveCount(1);
  await filter.getByRole('button',{name:/作业考试/}).click();await expect(page.getByRole('heading',{name:'没有找到相关通知'})).toBeVisible();
  await filter.getByRole('button',{name:/活动报名/}).click();await page.locator('.notice-card').click();await expect(page.locator('.notice-summary')).toContainText('原创摄影');await expect(page.locator('.notice-body')).toContainText('请提交原创摄影作品');
  await page.goto('/admin');await page.locator('.admin-notice').filter({has:page.getByRole('heading',{name:'手机验收摄影活动',exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();
  const bodyField=page.getByRole('textbox',{name:/通知正文/});const originalBody=await bodyField.inputValue();await bodyField.fill(originalBody+'未保存修改');await expect(page.getByRole('button',{name:'保存分类与摘要',exact:true})).toBeDisabled();await bodyField.fill(originalBody);
  await page.getByLabel('通知分类', {exact:true}).selectOption('campus');await page.getByLabel('手动编辑摘要').check();await page.getByLabel('通知摘要', {exact:true}).fill('管理员确认：作品需原创。');
  await page.getByRole('button',{name:'保存分类与摘要',exact:true}).click();await expect(page.getByRole('status')).toContainText('手动修正');
  const saved=(await(await page.request.get(`/api/notices/${n.id}`)).json()).notice;expect(saved.noticeAt).toBe(n.noticeAt);expect(saved.category).toBe('campus');expect(saved.summaryLocked).toBe(true);
  await page.goto('/notices');await page.getByRole('textbox',{name:'搜索通知'}).fill('手机验收');await page.getByRole('group',{name:'按通知分类'}).getByRole('button',{name:/校园事务/}).click();
  await expect(page.locator('.notice-card')).toContainText('管理员确认');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:info.outputPath('categories-mobile.png'),fullPage:true});
  await page.setViewportSize({width:360,height:740});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});
