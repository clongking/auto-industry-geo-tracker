# 美欧日汽车产业对华动态 · 跟踪站点

持续跟踪美国、欧洲、日本三大区针对中国汽车产业的地缘政治动态（关税、技术安全审查、供应链本地化、中国车企出海、本土车企在华处境）。本仓库是该跟踪报告的静态展示站点：Astro 静态输出 + TypeScript，Markdown 报告通过 content collections 管理，每周由自动任务同步内容并发布到 GitHub Pages。

## 页面

| 路径 | 内容 |
|---|---|
| `/` | 首页：最新一期总览的"一句话判断"与要点入口、三区报告卡片、历史周报列表 |
| `/regions/us/`、`/regions/eu/`、`/regions/japan/` | 美国 / 欧洲 / 日本区滚动报告（顶部为本周增量小节，保留历史） |
| `/briefs/` | 周报归档 |
| `/briefs/YYYY-MM-DD/` | 每期三区总览周报 |

页面顶部固定显示「最近更新：YYYY-MM-DD · 下次更新：每周四 18:00（北京时间）」，最近更新日期取自内容 frontmatter，下次更新日期在构建时按北京时间自动计算。

## 本地运行

```bash
npm install
npm run dev        # http://localhost:43210/（端口固定为 43210）
npm run build      # 输出到 dist/（设置 SITE_PASSWORD 时会自动加密，见下节）
npm run preview    # 本地预览 dist/
```

## 访问密码

站点是纯静态托管（GitHub Pages），没有后端，因此采用"静态加密"方案保护内容：

- `npm run build` 结束后自动执行 `postbuild`（`scripts/encrypt-dist.mjs`），把 `dist/` 下**每一个 HTML 页面**整体加密，替换为一个中文解锁页。解锁页中除 `<title>` 外不含任何正文明文，CSS / favicon 等静态资源保持原样。
- 加密方式：PBKDF2-SHA256（600,000 次迭代，固定站点盐）从密码派生 256 位 AES-GCM 密钥，每页独立随机 IV。浏览器端用 Web Crypto API 解密后整页渲染，密码不会离开浏览器。
- **记住我**（默认勾选）：解锁成功后把派生密钥存入 `localStorage`，默认 30 天内站内跳转、重新打开都无需再输入；不勾选则仅存 `sessionStorage`，关闭标签页即失效。派生密钥与密码绑定，改密码后旧密钥自动失效并重新提示输入。
- 这是前端方案：拿到密码的人可以把页面存下来，浏览器本地也能读到已保存的密钥；它用于阻止随手访问与搜索引擎抓取，不用于对抗有针对性的攻击。

密码来源是环境变量 `SITE_PASSWORD`：

| 场景 | 行为 |
|---|---|
| 本地未设置 `SITE_PASSWORD` | 跳过加密并打印警告，`dist/` 为明文，`npm run dev` / 本地构建不受影响 |
| 本地设置 `SITE_PASSWORD` | 正常加密 |
| GitHub Actions 中为空 | **构建失败**并提示添加 secret，防止误把明文发布上线（确实要公开发布时可在 Build 步骤设置 `SITE_NO_PASSWORD=1`） |

可选变量：`SITE_REMEMBER_DAYS`（"记住我"天数，默认 30；可在仓库 Variables 中设置）、`SITE_PASSWORD_SALT`（32 位十六进制盐，一般不改；改动后所有已记住的设备需重新输入）。

**修改密码**：在仓库 Settings → Secrets and variables → Actions 中更新 `SITE_PASSWORD`，然后重新部署（在 Actions 页对 "Deploy to GitHub Pages" 点 Run workflow，或推送任意提交到 `main`）。已勾选"记住我"的访客下次打开时会看到"访问密码已更新，请重新输入"。

**本地带密码构建预览**：

```bash
SITE_PASSWORD='你的密码' npm run build
npm run preview          # 或 npx serve dist
```

打开预览地址应先看到解锁页；`grep -rl "一句话判断" dist` 应无输出。

## 目录结构

```
content/
  regions/            # 区域滚动报告（content collection: regions）
    us.md             # frontmatter: title, region(us|eu|japan), updated, period?
    eu.md
    japan.md
  briefs/             # 每周三区总览（content collection: briefs）
    2026-09-22.md     # frontmatter: title, date, updated?, summary?
    2026-09-24.md
scripts/
  sync-content.sh     # 同步入口（调用 sync-content.mjs）
  sync-content.mjs    # 从 Agent Store 复制报告、补 frontmatter、改写链接
  encrypt-dist.mjs    # postbuild：用 SITE_PASSWORD 加密 dist/ 下所有 HTML（见「访问密码」）
src/
  content.config.ts   # 两个 collection 的 schema
  layouts/Base.astro  # 全站布局（更新提示条、导航、页脚）
  pages/              # 首页、/regions/[region]、/briefs/、/briefs/[id]
  components/         # RegionCard、BriefList、Toc
  lib/
    site.ts           # 站点常量、区域元数据、日期与链接工具
    content.ts        # collection 查询封装
    markdown-plugin.mjs  # Markdown 后处理：来源标签、外链、表格容器、base 前缀
  styles/global.css
.github/workflows/deploy.yml   # push 到 main 自动构建并发布 GitHub Pages
```

### Markdown 约定

- 正文中形如 `[[Reuters]](https://…)` 的内联来源链接会被渲染为小标签样式，并在新标签页打开。
- 正文中的站内链接使用绝对路径（如 `/regions/us/`、`/briefs/2026-09-22/`），构建时会自动加上 `base` 前缀。
- 正文首个一级标题由同步脚本提取为 frontmatter `title`，页面模板负责渲染标题，正文从二级标题开始。

## 每周更新流程

内容来源是 Agent Store 中的报告目录（默认 `/cursor/stores/bc-a438253a-cb4f-4745-9de1-27b558da08e2/docs`，可用 `--source` 或环境变量 `STORE_DOCS` 覆盖）。同步脚本会：

1. `docs/us-auto-dynamics.md` → `content/regions/us.md`（eu、japan 同理），`docs/weekly-brief-YYYY-MM-DD.md` → `content/briefs/YYYY-MM-DD.md`；
2. 重写 frontmatter（`title`、`region`/`date`、`updated`、`summary`），丢弃来源文件里的内部元数据；
3. 把指向 `/cursor/stores/...` 的绝对路径链接改写为站内链接；
4. 内容无变化的文件不会重写。

自动任务（每周四 18:00 北京时间）应在仓库根目录依次执行：

```bash
git pull --ff-only origin main
scripts/sync-content.sh                 # 可加 --date YYYY-MM-DD 指定 updated 日期，默认取北京时间当天
npm ci
npm run build                           # 构建校验，失败则中止
git add content/
git diff --cached --quiet && echo "内容无变化，跳过提交" || {
  git commit -m "content: 更新报告 $(TZ=Asia/Shanghai date +%F)"
  git push origin main
}
```

推送到 `main` 后，GitHub Actions 会自动构建并发布到 GitHub Pages。

## 部署（GitHub Pages）

- 工作流 `.github/workflows/deploy.yml` 在 push 到 `main` 时运行 `npm ci && npm run build`（Build 步骤注入 secret `SITE_PASSWORD`，postbuild 自动加密），并用 `actions/upload-pages-artifact` + `actions/deploy-pages` 发布 `dist/`。
- **需在仓库 Settings → Secrets and variables → Actions 中添加 `SITE_PASSWORD`**，否则 Actions 中的构建会失败（见「访问密码」）。
- **需在仓库 Settings → Pages 中把 Source 设为 "GitHub Actions"**，否则部署步骤会失败。
- `astro.config.mjs` 根据 `GITHUB_REPOSITORY`（`owner/repo`）自动推导：`site = https://owner.github.io`，`base = /repo`（若仓库名为 `owner.github.io`，则 `base = /`）。使用自定义域名时，在仓库 Settings → Variables 中设置 `SITE_URL`（如 `https://example.com`）和 `BASE_PATH`（如 `/`）即可覆盖。
- 本地开发默认 `base = /`，`site = http://localhost:43210`。
