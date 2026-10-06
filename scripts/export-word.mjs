#!/usr/bin/env node
/**
 * 调用 Python 脚本把最新一期总览导出为 Vehicle 模版 Word。
 * 环境变量：
 *   BRIEF_MD - 输入总览 markdown 路径，默认取 content/briefs/ 下最新文件
 *   OUT_DOCX - 输出 docx 路径，默认 docs/Vehicle - 美欧日汽车政策情报 YYYYMMDD.docx
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function findLatestBrief() {
  const dir = path.join(ROOT, 'content', 'briefs');
  const files = await fs.readdir(dir);
  const mds = files
    .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .reverse();
  if (!mds.length) throw new Error('content/briefs/ 下没有总览文件');
  return path.join(dir, mds[0]);
}

function exec(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    let stdout = '', stderr = '';
    child.stdout?.on('data', d => stdout += d);
    child.stderr?.on('data', d => stderr += d);
    child.on('close', code => {
      if (code !== 0) reject(new Error(`命令失败 ${cmd} ${args.join(' ')}\nstderr: ${stderr}\nstdout: ${stdout}`));
      else resolve(stdout);
    });
    child.on('error', reject);
  });
}

async function main() {
  const briefMd = process.env.BRIEF_MD || await findLatestBrief();
  const dateStr = path.basename(briefMd, '.md');
  const outDocx = process.env.OUT_DOCX || path.join(ROOT, 'docs', `Vehicle - 美欧日汽车政策情报 ${dateStr.replace(/-/g, '')}.docx`);

  const dateDisplay = (() => {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
  })();

  console.log(`导出 Word: ${briefMd} -> ${outDocx}`);
  await exec('python3', [
    path.join(ROOT, 'internal/scripts/export-brief-docx.py'),
    '--md', briefMd,
    '--date', dateDisplay,
    '--out', outDocx,
  ], { cwd: ROOT, stdio: 'pipe' });
  console.log('Word 导出完成');
}

main().catch(e => {
  console.error(e.message || e);
  process.exit(1);
});
