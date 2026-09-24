#!/usr/bin/env node
/**
 * postbuild：把 dist/ 下所有 HTML 页面加密为“输入密码后在浏览器端解密”的解锁页。
 *
 * - 密钥派生：PBKDF2-SHA256（固定站点盐 + 高迭代次数）→ 256 位 AES-GCM 密钥
 * - 每页独立随机 IV，密文 base64 内嵌到解锁页
 * - 解锁页仅保留原页面 <title>，不含任何正文明文
 * - 「记住我」：把派生密钥存入 localStorage（默认 30 天）；未勾选则存 sessionStorage（关闭标签页即失效）
 *
 * 环境变量：
 *   SITE_PASSWORD          访问密码。未设置：本地跳过加密并警告；GitHub Actions 中直接失败
 *   SITE_NO_PASSWORD=1     显式声明本次构建不加密（仅用于确实要公开发布时）
 *   SITE_REMEMBER_DAYS     「记住我」有效天数，默认 30
 *   SITE_PASSWORD_SALT     32 位十六进制盐，一般不用改；改动后所有已记住的设备需重新输入密码
 *   DIST_DIR               构建输出目录，默认 dist
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const { subtle } = webcrypto;
const getRandomValues = (arr) => webcrypto.getRandomValues(arr);

const DIST_DIR = path.resolve(process.env.DIST_DIR || 'dist');
const PASSWORD = process.env.SITE_PASSWORD ?? '';
const REMEMBER_DAYS = Number.parseInt(process.env.SITE_REMEMBER_DAYS || '30', 10) || 30;
const PBKDF2_ITERATIONS = 600_000;
// 固定站点盐：与密码无关，公开无妨。保持不变可让「记住我」在重新部署后继续有效。
const SALT_HEX = (process.env.SITE_PASSWORD_SALT || 'ba6e17bf43354ec48964324aaeac3031').toLowerCase();

const log = (msg) => console.log(`[encrypt-dist] ${msg}`);
const warn = (msg) => console.warn(`[encrypt-dist] ⚠ ${msg}`);
const fail = (msg) => {
  console.error(`[encrypt-dist] ✖ ${msg}`);
  process.exit(1);
};

if (!/^[0-9a-f]{32}$/.test(SALT_HEX)) fail('SITE_PASSWORD_SALT 必须是 32 位十六进制字符串。');

if (!PASSWORD) {
  if (process.env.SITE_NO_PASSWORD === '1') {
    warn('SITE_NO_PASSWORD=1：按要求跳过加密，dist/ 将以明文发布。');
    process.exit(0);
  }
  if (process.env.GITHUB_ACTIONS === 'true') {
    fail(
      'GitHub Actions 中未设置 SITE_PASSWORD，已中止构建以防止明文发布。\n' +
        '  请在仓库 Settings → Secrets and variables → Actions 中添加 secret「SITE_PASSWORD」，\n' +
        '  或确实要公开发布时在 Build 步骤设置 SITE_NO_PASSWORD=1。',
    );
  }
  warn('未设置 SITE_PASSWORD，跳过加密（dist/ 为明文，仅供本地预览）。');
  process.exit(0);
}
if (PASSWORD.length < 8) warn('SITE_PASSWORD 短于 8 位，建议使用更长的密码。');

const hexToBytes = (hex) => Uint8Array.from(hex.match(/../g).map((b) => Number.parseInt(b, 16)));
const toBase64 = (bytes) => Buffer.from(bytes).toString('base64');
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function deriveKey(password, salt) {
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

async function* walkHtml(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(full);
    else if (entry.isFile() && /\.html?$/i.test(entry.name)) yield full;
  }
}

/** 解锁页模板。所有样式与脚本内联，不依赖任何外部资源；页面中只有 <title> 来自原页面。 */
function renderGate({ title, favicon, iv, ciphertext }) {
  const config = JSON.stringify({
    v: 1,
    salt: SALT_HEX,
    iterations: PBKDF2_ITERATIONS,
    rememberDays: REMEMBER_DAYS,
    iv,
    data: ciphertext,
  });
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
${favicon ? `<link rel="icon" type="image/svg+xml" href="${escapeHtml(favicon)}">` : ''}
<title>${escapeHtml(title)}</title>
<style>
:root{--bg:#f6f7f9;--surface:#fff;--border:#e2e5ea;--text:#1d2430;--muted:#6b7280;--accent:#1f4e8c;--accent-soft:#e6eef9;--danger:#b91c1c;--danger-soft:#fdeaea;--radius:14px;--shadow:0 1px 2px rgba(16,24,40,.04),0 8px 24px -12px rgba(16,24,40,.12);--font:'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Source Han Sans SC','Helvetica Neue',Arial,system-ui,sans-serif}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;font-family:var(--font);color:var(--text);background:var(--bg);display:flex;align-items:center;justify-content:center;padding:24px;line-height:1.7}
.card{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow);padding:32px 28px}
.brand{display:flex;align-items:center;gap:12px;margin-bottom:18px}
.brand__mark{display:inline-grid;place-items:center;width:40px;height:40px;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;font-size:20px;flex:none}
.brand__text{font-weight:700;font-size:17px;line-height:1.3}
h1{font-size:18px;margin:0 0 6px}
p{margin:0 0 18px;color:var(--muted);font-size:14px}
label.field{display:block;font-size:14px;font-weight:600;margin-bottom:6px}
.input-wrap{display:flex;gap:8px}
input[type=password],input[type=text]{flex:1;font:inherit;font-size:16px;padding:10px 12px;border:1px solid var(--border);border-radius:10px;background:#fff;color:var(--text);min-width:0}
input:focus{outline:2px solid var(--accent);outline-offset:1px;border-color:var(--accent)}
.toggle{font:inherit;font-size:13px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:var(--surface);color:var(--muted);cursor:pointer}
.toggle:hover{color:var(--text)}
.remember{display:flex;align-items:center;gap:8px;margin:14px 0 18px;font-size:14px;color:var(--text)}
.remember input{width:16px;height:16px;accent-color:var(--accent);margin:0}
.remember small{color:var(--muted);margin-left:auto;font-size:12px}
button.primary{width:100%;font:inherit;font-size:16px;font-weight:600;padding:11px 14px;border:0;border-radius:10px;background:var(--accent);color:#fff;cursor:pointer}
button.primary:hover{filter:brightness(1.08)}
button.primary[disabled]{opacity:.6;cursor:progress}
.msg{min-height:22px;margin:12px 0 0;font-size:14px;color:var(--muted)}
.msg--error{color:var(--danger);background:var(--danger-soft);border-radius:8px;padding:6px 10px}
.hint{margin:22px 0 0;font-size:12px;color:var(--muted);border-top:1px solid var(--border);padding-top:14px}
.shake{animation:shake .35s}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.hidden{display:none!important}
@media (max-width:480px){.card{padding:26px 20px}}
</style>
</head>
<body>
<main class="card" id="card" aria-busy="true">
  <div class="brand"><span class="brand__mark" aria-hidden="true">车</span><span class="brand__text">${escapeHtml(title)}</span></div>
  <div id="checking"><p style="margin:0">正在检查访问权限…</p></div>
  <form id="form" class="hidden" autocomplete="off" novalidate>
    <h1>请输入访问密码</h1>
    <p>本站内容受密码保护。页面在浏览器内解密，密码不会被上传。</p>
    <label class="field" for="pw">访问密码</label>
    <div class="input-wrap">
      <input id="pw" name="password" type="password" autocomplete="current-password" autofocus required spellcheck="false">
      <button type="button" class="toggle" id="toggle" aria-label="显示或隐藏密码">显示</button>
    </div>
    <label class="remember"><input type="checkbox" id="remember" checked> 记住我<small>${REMEMBER_DAYS} 天内无需再次输入</small></label>
    <button type="submit" class="primary" id="submit">解锁</button>
    <div class="msg" id="msg" role="status" aria-live="polite"></div>
    <p class="hint">若忘记密码，请联系站点维护者获取。清除浏览器站点数据可退出登录。</p>
  </form>
  <noscript><p style="color:var(--danger)">需要启用 JavaScript 才能查看本站内容。</p></noscript>
</main>
<script type="application/json" id="gate-config">${config}</script>
<script>
(function(){
  'use strict';
  var CFG = JSON.parse(document.getElementById('gate-config').textContent);
  var STORE_KEY = 'auto-geo-gate:v1';
  var $ = function(id){ return document.getElementById(id); };
  var card = $('card'), form = $('form'), checking = $('checking'), pw = $('pw'),
      remember = $('remember'), submit = $('submit'), msg = $('msg'), toggle = $('toggle');
  var enc = new TextEncoder(), dec = new TextDecoder();

  function hexToBytes(h){ var a = new Uint8Array(h.length/2); for (var i=0;i<a.length;i++) a[i]=parseInt(h.substr(i*2,2),16); return a; }
  function b64ToBytes(b){ var s = atob(b), a = new Uint8Array(s.length); for (var i=0;i<s.length;i++) a[i]=s.charCodeAt(i); return a; }
  function bytesToB64(bytes){ var s=''; bytes = new Uint8Array(bytes); for (var i=0;i<bytes.length;i++) s+=String.fromCharCode(bytes[i]); return btoa(s); }

  function showForm(){ checking.classList.add('hidden'); form.classList.remove('hidden'); card.removeAttribute('aria-busy'); try { pw.focus(); } catch(e){} }
  function setMsg(text, isError){ msg.textContent = text || ''; msg.className = 'msg' + (isError ? ' msg--error' : ''); }
  function setBusy(b){ submit.disabled = b; pw.disabled = b; submit.textContent = b ? '正在解锁…' : '解锁'; }

  function readStored(){
    var raw = null, storage = null;
    try { raw = sessionStorage.getItem(STORE_KEY); storage = sessionStorage; } catch(e){}
    if (!raw) { try { raw = localStorage.getItem(STORE_KEY); storage = localStorage; } catch(e){} }
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      if (o && o.k && o.salt === CFG.salt && (!o.exp || o.exp > Date.now())) return o;
    } catch(e){}
    try { storage.removeItem(STORE_KEY); } catch(e){}
    return null;
  }
  function clearStored(){ try { sessionStorage.removeItem(STORE_KEY); } catch(e){} try { localStorage.removeItem(STORE_KEY); } catch(e){} }
  function store(keyB64, persist){
    var payload = JSON.stringify({ k: keyB64, salt: CFG.salt, exp: persist ? Date.now() + CFG.rememberDays*864e5 : 0 });
    try { (persist ? localStorage : sessionStorage).setItem(STORE_KEY, payload); } catch(e){}
  }

  function deriveKey(password){
    return crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']).then(function(material){
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: hexToBytes(CFG.salt), iterations: CFG.iterations, hash: 'SHA-256' },
        material, { name: 'AES-GCM', length: 256 }, true, ['decrypt']);
    });
  }
  function importKey(b64){
    return crypto.subtle.importKey('raw', b64ToBytes(b64), { name: 'AES-GCM' }, true, ['decrypt']);
  }
  function decrypt(key){
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(CFG.iv) }, key, b64ToBytes(CFG.data)).then(function(buf){ return dec.decode(buf); });
  }
  function render(html){
    document.open('text/html', 'replace');
    document.write(html);
    document.close();
  }

  if (!(window.crypto && crypto.subtle)) {
    showForm();
    form.querySelectorAll('input,button').forEach(function(el){ el.disabled = true; });
    setMsg('当前浏览器不支持 Web Crypto（需要 HTTPS 与较新的浏览器），无法解锁。', true);
    return;
  }

  toggle.addEventListener('click', function(){
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    toggle.textContent = show ? '隐藏' : '显示';
    pw.focus();
  });

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    var password = pw.value;
    if (!password) { setMsg('请输入密码。', true); pw.focus(); return; }
    setBusy(true); setMsg('正在校验密码…');
    var key;
    deriveKey(password).then(function(k){ key = k; return decrypt(k); }).then(function(html){
      return crypto.subtle.exportKey('raw', key).then(function(raw){
        store(bytesToB64(raw), remember.checked);
        render(html);
      });
    }).catch(function(){
      setBusy(false);
      setMsg('密码错误，请重试。', true);
      card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pw.select();
    });
  });

  var stored = readStored();
  if (!stored) { showForm(); return; }
  importKey(stored.k).then(decrypt).then(render).catch(function(){
    clearStored();
    showForm();
    setMsg('访问密码已更新，请重新输入。');
  });
})();
</script>
</body>
</html>
`;
}

async function main() {
  try {
    await fs.access(DIST_DIR);
  } catch {
    fail(`找不到构建目录 ${DIST_DIR}，请先运行 astro build。`);
  }

  const salt = hexToBytes(SALT_HEX);
  const key = await deriveKey(PASSWORD, salt);
  const files = [];
  for await (const f of walkHtml(DIST_DIR)) files.push(f);
  if (files.length === 0) fail(`${DIST_DIR} 中没有 HTML 文件。`);

  let totalBytes = 0;
  for (const file of files) {
    const html = await fs.readFile(file, 'utf8');
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '受密码保护的页面';
    const favicon = html.match(/<link[^>]+rel=["']icon["'][^>]*href=["']([^"']+)["']/i)?.[1] || '';

    const iv = getRandomValues(new Uint8Array(12));
    const ciphertext = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(html));
    const gate = renderGate({ title, favicon, iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)) });

    // 自检：解锁页中不得残留原页面正文。
    const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
    const probe = body.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (probe && gate.includes(probe)) fail(`自检失败：${path.relative(DIST_DIR, file)} 的解锁页包含原始正文。`);

    await fs.writeFile(file, gate, 'utf8');
    totalBytes += Buffer.byteLength(gate);
  }

  log(`已加密 ${files.length} 个 HTML 页面（PBKDF2 ${PBKDF2_ITERATIONS.toLocaleString()} 次迭代 + AES-256-GCM，记住我 ${REMEMBER_DAYS} 天），共 ${(totalBytes / 1024).toFixed(1)} KiB。`);
}

main().catch((err) => fail(err?.stack || String(err)));
