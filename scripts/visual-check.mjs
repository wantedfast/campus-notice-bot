import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch();
const base = process.env.VISUAL_URL || 'http://localhost:3000';
mkdirSync('previews',{recursive:true});
try {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  for (const [name,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',360,740]]) {
    await page.setViewportSize({width,height}); await page.goto(base); await page.waitForSelector('.empty-notice, .latest-list');
    await page.screenshot({path:`previews/${name}.png`,fullPage:true});
    const check = await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,fontSize:getComputedStyle(document.querySelector('.composer textarea')).fontSize,composerBottom:document.querySelector('.composer').getBoundingClientRect().bottom,height:innerHeight}));
    if (check.overflow || parseFloat(check.fontSize)<16 || check.composerBottom>check.height) throw new Error(`${name}: ${JSON.stringify(check)}`);
  }
  // Approximate the viewport contraction caused by a software keyboard.
  await page.setViewportSize({width:390,height:430}); await page.getByRole('textbox',{name:'输入你的问题'}).focus();
  await page.waitForTimeout(100);
  const bottom = await page.locator('.composer').evaluate(el=>el.getBoundingClientRect().bottom);
  if (bottom>430) throw new Error('Composer obscured in contracted viewport');
  await page.screenshot({path:'previews/keyboard-viewport.png',fullPage:true});
  await page.goto(`${base}/admin`); await page.getByLabel('管理员密码').waitFor();
  await page.setViewportSize({width:390,height:844}); await page.screenshot({path:'previews/admin-mobile.png',fullPage:true});
  if(errors.length) throw new Error(errors.join('\n'));
  console.log('视觉检查通过：1440、390、360px 无横向溢出；输入字号16px；缩小视口时输入框可见；无浏览器运行错误。');
} finally { await browser.close(); }
