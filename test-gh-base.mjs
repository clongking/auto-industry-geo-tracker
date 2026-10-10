import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
const outDir = '/cursor/stores/bc-a438253a-cb4f-4745-9de1-27b558da08e2/media';
fs.mkdirSync(outDir, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', '43226', '--directory', 'dist'], { cwd: '/workspace', stdio: 'ignore' });
await new Promise(r => setTimeout(r, 1500));
try {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://127.0.0.1:43226/auto-industry-geo-tracker/');
  await page.waitForTimeout(2000);
  await page.fill('#pw', 'woaini1314');
  await page.click('#submit');
  await page.waitForTimeout(25000);
  const info = await page.evaluate(() => ({ appHidden: document.getElementById('app').classList.contains('hidden'), refreshExists: !!document.getElementById('refresh-btn'), updated: document.getElementById('meta-updated')?.textContent }));
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: `${outDir}/site-gh-base.png`, fullPage: true });
  if(!info.appHidden && info.refreshExists) {
    await page.evaluate(() => document.getElementById('refresh-btn').click());
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${outDir}/site-gh-base-refresh.png`, fullPage: true });
  }
  await browser.close();
} finally { server.kill(); }
