#!/usr/bin/env node
/**
 * 把 Agent Store 里的 Markdown 报告同步到仓库 content/ 目录：
 *   docs/us-auto-dynamics.md            -> content/regions/us.md
 *   docs/eu-auto-dynamics.md            -> content/regions/eu.md
 *   docs/japan-auto-dynamics.md         -> content/regions/japan.md
 *   docs/weekly-brief-YYYY-MM-DD.md     -> content/briefs/YYYY-MM-DD.md
 *
 * 同步时会：补齐/规范 frontmatter（title、region、updated、date、summary），
 * 去掉正文首个一级标题（由页面模板渲染），并把指向 /cursor/stores/... 的
 * 绝对路径链接改写为站内链接（/regions/xx/、/briefs/YYYY-MM-DD/）。
 *
 * 用法：node scripts/sync-content.mjs [--source <docs 目录>] [--date YYYY-MM-DD]
 * 环境变量 STORE_DOCS 可替代 --source。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = '/cursor/stores/bc-a438253a-cb4f-4745-9de1-27b558da08e2/docs';

const REGION_FILES = {
  'us-auto-dynamics.md': 'us',
  'eu-auto-dynamics.md': 'eu',
  'japan-auto-dynamics.md': 'japan',
};
const BRIEF_PATTERN = /^weekly-brief-(\d{4}-\d{2}-\d{2})\.md$/;

function parseArgs(argv) {
  const args = { source: process.env.STORE_DOCS || DEFAULT_SOURCE, date: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--source') args.source = argv[++i];
    else if (argv[i] === '--date') args.date = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('用法：node scripts/sync-content.mjs [--source <docs 目录>] [--date YYYY-MM-DD]');
      process.exit(0);
    }
  }
  if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error(`--date 格式应为 YYYY-MM-DD，收到：${args.date}`);
  }
  return args;
}

/** 当前北京时间的日期（YYYY-MM-DD）。 */
function todayInBeijing() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

/** 拆分已有 frontmatter；返回 { data, body }。只做简单的 key: value 解析。 */
function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { data: {}, body: text };
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  }
  return { data, body: text.slice(m[0].length) };
}

/** 取出正文首个一级标题作为 title，并从正文中移除。 */
function extractTitle(body) {
  const m = body.match(/^\s*# (.+?)\s*\r?\n/);
  if (!m) return { title: null, body };
  return { title: m[1].trim(), body: body.slice(m[0].length).replace(/^\s*\n/, '') };
}

/** 将 store 绝对路径链接改写为站内链接。 */
function rewriteStoreLinks(body, currentFile) {
  return body.replace(/\]\((\/cursor\/stores\/[^)\s]+)\)/g, (whole, target) => {
    const file = basename(target.split('#')[0]);
    const hash = target.includes('#') ? '#' + target.split('#')[1] : '';
    if (REGION_FILES[file]) return `](/regions/${REGION_FILES[file]}/${hash})`;
    const brief = file.match(BRIEF_PATTERN);
    if (brief) return `](/briefs/${brief[1]}/${hash})`;
    console.warn(`  [警告] ${currentFile}：无法映射的 store 链接，已改为指向首页：${target}`);
    return '](/)';
  });
}

/** 从总览中抽取"一句话判断"段落的纯文本，作为首页要点。 */
function extractSummary(body) {
  const m = body.match(/^##\s*一句话判断\s*\r?\n([\s\S]*?)(?=\r?\n##\s|\s*$)/m);
  if (!m) return null;
  return m[1]
    .replace(/\[\[[^\]]*\]\]\([^)]*\)/g, '') // [[来源]](url)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [文字](url)
    .replace(/[*_`>]/g, '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function buildFrontmatter(fields) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(fields)) {
    if (v === null || v === undefined || v === '') continue;
    lines.push(`${k}: ${yamlString(v)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

function writeIfChanged(dest, content) {
  mkdirSync(dirname(dest), { recursive: true });
  const prev = existsSync(dest) ? readFileSync(dest, 'utf8') : null;
  if (prev === content) {
    console.log(`  无变化  ${dest.replace(ROOT + '/', '')}`);
    return false;
  }
  writeFileSync(dest, content);
  console.log(`  已写入  ${dest.replace(ROOT + '/', '')}`);
  return true;
}

function main() {
  const { source, date } = parseArgs(process.argv.slice(2));
  const updated = date || todayInBeijing();
  if (!existsSync(source)) throw new Error(`来源目录不存在：${source}`);

  console.log(`同步来源：${source}`);
  console.log(`更新日期：${updated}`);

  const files = readdirSync(source).filter((f) => f.endsWith('.md'));
  let changed = 0;
  let matched = 0;

  for (const file of files) {
    const raw = readFileSync(join(source, file), 'utf8');
    const { data, body: bodyNoFm } = splitFrontmatter(raw);
    const { title: h1, body: bodyNoTitle } = extractTitle(bodyNoFm);
    const body = rewriteStoreLinks(bodyNoTitle, file).trimEnd() + '\n';

    if (REGION_FILES[file]) {
      matched++;
      const region = REGION_FILES[file];
      const fm = buildFrontmatter({
        title: h1 || data.title || `${region} 区报告`,
        region,
        updated,
        period: data.period || null,
      });
      changed += writeIfChanged(join(ROOT, 'content/regions', `${region}.md`), `${fm}\n\n${body}`) ? 1 : 0;
      continue;
    }

    const brief = file.match(BRIEF_PATTERN);
    if (brief) {
      matched++;
      const briefDate = brief[1];
      const fm = buildFrontmatter({
        title: h1 || data.title || `三区总览（${briefDate}）`,
        date: briefDate,
        updated,
        summary: extractSummary(body),
      });
      changed += writeIfChanged(join(ROOT, 'content/briefs', `${briefDate}.md`), `${fm}\n\n${body}`) ? 1 : 0;
    }
  }

  if (matched === 0) throw new Error('来源目录中没有可识别的报告文件');
  console.log(`完成：识别 ${matched} 个文件，更新 ${changed} 个。`);
}

try {
  main();
} catch (err) {
  console.error(`同步失败：${err.message}`);
  process.exit(1);
}
