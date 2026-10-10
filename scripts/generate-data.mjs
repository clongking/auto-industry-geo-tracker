#!/usr/bin/env node
/**
 * postbuild：生成并加密首页数据文件 public/data/latest-content.json.enc
 *
 * 环境变量：
 *   SITE_PASSWORD - 必填，用于加密数据文件
 *   SITE_NO_PASSWORD=1 - 跳过加密（仅用于本地明文测试）
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { encrypt } from './lib/crypto.mjs';

const PASSWORD = process.env.SITE_PASSWORD ?? '';

const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const isUserSite = repo && repo.toLowerCase() === `${owner}.github.io`.toLowerCase();
const BASE_PATH = (process.env.BASE_PATH || (repo && !isUserSite ? `/${repo}` : '/')).replace(/\/$/, '');

const DATA_FILE = 'public/data/latest-content.json';
const ENC_FILE = 'public/data/latest-content.json.enc';

function toBeijingDate(d = new Date()) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
}

function formatDate(d) {
  return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: md };
  const fm = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) {
      const key = line.slice(0, idx).trim();
      let val = line.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body: m[2] };
}

function extractSummary(body) {
  const m = body.match(/## 一句话判断\n+> ?([^\n]+)/);
  return m ? m[1].trim() : '';
}

function extractPoints(body) {
  const points = [];
  const re = /## ([^\n]+)\n+([\s\S]*?)(?=## |$)/g;
  let m;
  while ((m = re.exec(body))) {
    const title = m[1].trim();
    const content = m[2].trim();
    if (title.includes('美国') || title.includes('欧洲') || title.includes('日本')) {
      const bullets = content.split('\n').filter(l => l.trim().startsWith('-')).slice(0, 4);
      points.push({ region: title.replace(/美国|欧洲|日本/, '').trim() || title, bullets });
    }
  }
  return points;
}

async function main() {
  const contentDir = path.resolve('content');
  const briefsDir = path.join(contentDir, 'briefs');
  const regionsDir = path.join(contentDir, 'regions');

  const briefFiles = (await fs.readdir(briefsDir)).filter(f => f.endsWith('.md')).sort().reverse();
  if (briefFiles.length === 0) {
    console.error('[generate-data] 没有总览文件');
    process.exit(1);
  }
  const latestBriefFile = briefFiles[0];
  const latestBriefMd = await fs.readFile(path.join(briefsDir, latestBriefFile), 'utf8');
  const { frontmatter: briefFm, body: briefBody } = parseFrontmatter(latestBriefMd);
  const latestDate = briefFm.date || latestBriefFile.replace('.md', '');

  const regions = [];
  for (const key of ['us', 'eu', 'japan']) {
    const md = await fs.readFile(path.join(regionsDir, `${key}.md`), 'utf8');
    const { frontmatter: fm, body } = parseFrontmatter(md);
    const firstH1 = body.match(/^# ([^\n]+)/m)?.[1]?.trim() || '';
    const blurbMatch = body.match(/- 覆盖重点：([^\n]+)/);
    regions.push({
      key,
      name: key === 'us' ? '美国' : key === 'eu' ? '欧洲' : '日本',
      title: firstH1,
      blurb: blurbMatch ? blurbMatch[1].trim() : '',
      url: `${BASE_PATH}/regions/${key}/`,
      updated: fm.updated || latestDate,
    });
  }

  const briefs = [];
  for (const f of briefFiles.slice(0, 10)) {
    const md = await fs.readFile(path.join(briefsDir, f), 'utf8');
    const { frontmatter: fm, body } = parseFrontmatter(md);
    briefs.push({
      date: fm.date || f.replace('.md', ''),
      title: fm.title || '',
      summary: extractSummary(body),
      url: `${BASE_PATH}/briefs/${f.replace('.md', '')}/`,
      isLatest: f === latestBriefFile,
    });
  }

  const today = toBeijingDate();
  const nextThursday = new Date(today);
  nextThursday.setDate(today.getDate() + ((4 + 7 - today.getDay()) % 7 || 7));

  const payload = {
    meta: {
      updated: latestDate,
      updatedDisplay: formatDate(new Date(latestDate)),
      nextUpdate: nextThursday.toISOString().slice(0, 10),
      nextUpdateDisplay: formatDate(nextThursday),
      generatedAt: new Date().toISOString(),
    },
    latestBrief: {
      date: latestDate,
      title: briefFm.title || '',
      summary: extractSummary(briefBody),
      points: extractPoints(briefBody),
      url: `${BASE_PATH}/briefs/${latestDate}/`,
    },
    regions,
    briefs,
  };

  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(payload, null, 2), 'utf8');

  if (process.env.SITE_NO_PASSWORD === '1') {
    console.log('[generate-data] SITE_NO_PASSWORD=1，跳过加密');
    return;
  }
  if (!PASSWORD) {
    console.error('[generate-data] 错误：未设置 SITE_PASSWORD，无法加密数据文件');
    process.exit(1);
  }

  const { iv, data, salt, iterations } = await encrypt(JSON.stringify(payload), PASSWORD);
  const encPayload = JSON.stringify({ v: 1, salt, iterations, iv, data });
  await fs.writeFile(ENC_FILE, encPayload, 'utf8');
  console.log(`[generate-data] 已生成并加密 ${ENC_FILE}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
