#!/usr/bin/env node
/**
 * 自动采集：用 Brave Search API 搜索美/欧/日三区最新情报，
 * 更新 content/regions/{us,eu,japan}.md 和生成 content/briefs/YYYY-MM-DD.md。
 *
 * 环境变量：
 *   BRAVE_API_KEY - Brave Search API key（必需）
 *   LOOKBACK_DAYS - 搜索多少天内的新闻，默认 7
 *   MAX_RESULTS   - 每区域每个查询最多结果数，默认 10
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

const API_KEY = process.env.BRAVE_API_KEY;
if (!API_KEY) {
  console.error('错误：未设置 BRAVE_API_KEY。请先在 GitHub Secrets 中添加 BRAVE_API_KEY。');
  process.exit(1);
}

const LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || '7');
const MAX_RESULTS = Number(process.env.MAX_RESULTS || '10');
const TODAY = new Date();
const DATE_STR = TODAY.toISOString().slice(0, 10);
const DATE_DISPLAY = `${TODAY.getFullYear()} 年 ${TODAY.getMonth() + 1} 月 ${TODAY.getDate()} 日`;

const REGIONS = {
  us: {
    name: '美国',
    queries: [
      'US China auto tariffs connected vehicle S.4429',
      'US China electric vehicle ban legislation 2026',
      'USMCA China automotive rules of origin 2026',
      'Ford CATL Marshall battery plant 45X tax credit',
    ],
  },
  eu: {
    name: '欧洲',
    queries: [
      'EU China hybrid electric vehicle tariffs 2026',
      'Sefcovic China trade talks Beijing October 2026',
      'Germany France China EV tariffs hybrid 2026',
      'BYD CATL Hungary Europe factory 2026',
    ],
  },
  japan: {
    name: '日本',
    queries: [
      'Japan China rare earth export controls automotive 2026',
      'Toyota Honda Nissan China sales production 2026',
      'BYD Japan electric vehicle sales 2026',
      'Japan CEV subsidy China EV 2026',
    ],
  },
};

async function braveSearch(query) {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(MAX_RESULTS));
  url.searchParams.set('offset', '0');
  url.searchParams.set('mkt', 'en-US');
  url.searchParams.set('safesearch', 'off');
  url.searchParams.set('freshness', 'pw'); // past week; use 'pm' for past month if no results
  url.searchParams.set('text_decorations', 'false');
  url.searchParams.set('spellcheck', '0');

  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': API_KEY,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brave Search HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function searchWithRetry(query, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await braveSearch(query);
    } catch (e) {
      lastErr = e;
      console.warn(`  查询失败（第 ${i + 1} 次）: ${e.message}`);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw lastErr;
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter(r => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
}

async function fetchRegionNews(regionKey, config) {
  console.log(`\n开始搜索 ${config.name} 区情报...`);
  const all = [];
  for (const q of config.queries) {
    try {
      const data = await searchWithRetry(q);
      const results = (data.web?.results || data.results || []).map(r => ({
        title: r.title,
        url: r.url,
        description: r.description,
        age: r.age,
        source: r.profile?.name || new URL(r.url).hostname.replace(/^www\./, ''),
      }));
      all.push(...results);
      console.log(`  [${config.name}] "${q}" -> ${results.length} 条`);
    } catch (e) {
      console.error(`  [${config.name}] "${q}" 最终失败: ${e.message}`);
    }
  }
  return dedupeResults(all).slice(0, 18);
}

function formatSourceLink(url, source) {
  return `[[${source}]](${url})`;
}

function renderRegionUpdate(regionKey, config, items) {
  if (!items.length) {
    return `## ${DATE_STR} 自动更新\n\n> 本节由自动任务根据 Brave Search 近 ${LOOKBACK_DAYS} 天搜索结果生成。本时段未检索到显著新进展。\n\n`;
  }
  const lines = [`## ${DATE_STR} 自动更新`, '', `> 本节由自动任务根据 Brave Search 近 ${LOOKBACK_DAYS} 天搜索结果生成，侧重 headlines；如需深度分析，请结合人工研判。`, ''];
  lines.push(`### 本时段检索到的主要动态`);
  lines.push('');
  for (const item of items) {
    const desc = item.description ? ` ${item.description}` : '';
    const age = item.age ? `（${item.age}）` : '';
    lines.push(`- **${item.title}**${age}${desc} ${formatSourceLink(item.url, item.source)}`);
  }
  lines.push('');
  return lines.join('\n') + '\n';
}

async function updateRegionFile(regionKey, updateMd) {
  const file = path.resolve(`content/regions/${regionKey}.md`);
  let content;
  try {
    content = await fs.readFile(file, 'utf8');
  } catch (e) {
    console.error(`读取 ${file} 失败: ${e.message}`);
    return;
  }

  // 找到 frontmatter 结束位置（如果有的话）
  let insertAt = 0;
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) insertAt = end + 3;
  }
  // 跳过 frontmatter 后的空行
  while (insertAt < content.length && content[insertAt] === '\n') insertAt++;

  const newContent = content.slice(0, insertAt) + '\n\n' + updateMd + content.slice(insertAt);
  await fs.writeFile(file, newContent, 'utf8');
  console.log(`已更新 content/regions/${regionKey}.md`);
}

function generateBrief(regionItems) {
  const lines = [
    `# 美欧日汽车产业对华动态 · 自动总览（${DATE_STR}）`,
    '',
    '## 一句话判断',
    '',
    `> 本总览由自动任务根据 Brave Search 近 ${LOOKBACK_DAYS} 天搜索结果生成，供快速参考；深度分析请以人工研判为准。`,
    '',
    '## 美国',
    '',
  ];

  for (const [key, config] of Object.entries(REGIONS)) {
    const items = regionItems[key];
    lines.push(`### ${config.name}`);
    lines.push('');
    if (!items.length) {
      lines.push('本时段未检索到显著新进展。');
    } else {
      for (const item of items.slice(0, 5)) {
        lines.push(`- ${item.title} ${formatSourceLink(item.url, item.source)}`);
      }
    }
    lines.push('');
  }

  lines.push('## 未来节点');
  lines.push('');
  lines.push('| 日期 | 区域 | 事件 |');
  lines.push('|---|---|---|');
  lines.push(`| ${DATE_STR} | - | 本总览为自动采集，节点表请参见分区滚动报告 |`);
  lines.push('');
  lines.push('## 待核实项');
  lines.push('');
  lines.push('- 自动搜索结果可能包含日期不精确或转载内容，请以原始来源为准。');
  lines.push('');

  return lines.join('\n');
}

async function main() {
  const regionItems = {};
  for (const [key, config] of Object.entries(REGIONS)) {
    const items = await fetchRegionNews(key, config);
    regionItems[key] = items;
    const updateMd = renderRegionUpdate(key, config, items);
    await updateRegionFile(key, updateMd);
  }

  const brief = generateBrief(regionItems);
  const briefPath = `content/briefs/${DATE_STR}.md`;
  await fs.writeFile(path.resolve(briefPath), brief, 'utf8');
  console.log(`\n已生成 ${briefPath}`);
  console.log(`\n各区域结果数：美国 ${regionItems.us.length}，欧洲 ${regionItems.eu.length}，日本 ${regionItems.japan.length}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
