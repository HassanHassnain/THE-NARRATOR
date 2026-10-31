import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 432 } });
  await page.setContent(`<html><body style="margin:0;background:#e4dcc6;font-family:Arial;color:#172b24"><div style="padding:14px;background:#172b24;color:white">SIMULATED GAME SCENE · LOCAL MODEL TEST</div><div style="position:absolute;left:25px;top:75px;width:180px;height:20px;background:#444"><div style="width:20%;height:100%;background:#ce3232"></div></div><p style="position:absolute;left:25px;top:95px">HEALTH: 20 / 100</p><div style="position:absolute;bottom:0;width:100%;height:105px;background:#367bc0"></div><div style="position:absolute;left:420px;bottom:105px;width:135px;height:205px;background:#b73232;border:12px solid #5a3e2b"><b style="display:block;margin:30px 10px;color:white">LOCKED</b><span style="position:absolute;right:12px;top:110px;color:#f8d971;font-size:32px">●</span></div><div style="position:absolute;left:130px;bottom:105px;font-size:70px">♟</div><p style="position:absolute;bottom:8px;left:22px;color:white;font-size:22px">BLUE RIVER · RED DOOR · KEY MISSING</p></body></html>`);
  await page.screenshot({ path: 'fixtures/local-scene.jpg', type: 'jpeg', quality: 80 });
} finally { await browser.close(); }
