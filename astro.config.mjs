// @ts-check
import { defineConfig } from 'astro/config';
import { satteri } from '@astrojs/markdown-satteri';
import { contentPlugin } from './src/lib/markdown-plugin.mjs';

/**
 * site / base 按仓库名自动配置：
 * - GitHub Actions 中读取 GITHUB_REPOSITORY（owner/repo）：
 *     site = https://owner.github.io，base = /repo（若仓库名为 owner.github.io 则 base = /）
 * - 也可用环境变量 SITE_URL、BASE_PATH 显式覆盖（例如自定义域名）。
 * - 本地开发默认 site = http://localhost:43210，base = /。
 */
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const isUserSite = repo && repo.toLowerCase() === `${owner}.github.io`.toLowerCase();

const site = process.env.SITE_URL || (owner ? `https://${owner}.github.io` : 'http://localhost:43210');
const base = process.env.BASE_PATH || (repo && !isUserSite ? `/${repo}` : '/');

export default defineConfig({
  site,
  base,
  output: 'static',
  trailingSlash: 'always',
  server: { port: 43210, host: true },
  markdown: {
    processor: satteri({ hastPlugins: [contentPlugin({ base })] }),
  },
});
