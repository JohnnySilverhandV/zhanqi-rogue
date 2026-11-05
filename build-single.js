// ============================================================
// 单文件打包：把 index.html 引用的 style.css 与全部 <script src> 内联，
// 产出可直接双击打开的 HTML（无外链、无依赖、零构建）。
//
// 一次产出两个包（都来自同一份源码，只差一层「体型微调」样式）：
//   · 战棋肉鸽-手机版.html   竖屏手机优先，顶部预留摄像头安全区
//   · 战棋肉鸽-电脑版.html   棋盘更大（格子上限 66px），日志栏更宽
//
// 用法：node build-single.js
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const DESKTOP_DIR = path.join(os.homedir(), 'Desktop');

// 内联 JS 时避免正文里的 </script 提前闭合（JS 里 <\/script 等价）
function safe(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

function buildBase() {
  let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const inlined = [];

  // 1) 样式表 → <style>
  html = html.replace(/<link[^>]*href="([^"]+\.css)"[^>]*>/g, (m, href) => {
    const css = fs.readFileSync(path.join(ROOT, href), 'utf8');
    inlined.push(href);
    return `<style>\n${css}\n</style>`;
  });

  // 2) 脚本 → 内联 <script>（严格保持原引用顺序，顶层 const 才能跨段共享）
  html = html.replace(/<script\s+src="([^"]+)"\s*>\s*<\/script>/g, (m, src) => {
    const code = fs.readFileSync(path.join(ROOT, src), 'utf8');
    inlined.push(src);
    return `<script>\n/* ===== ${src} ===== */\n${safe(code)}\n</script>`;
  });

  if (/<script\s+src=/.test(html) || /<link[^>]*\.css/.test(html)) {
    console.error('✗ 仍有未内联的外链，检查 index.html 的引用写法');
    process.exit(1);
  }
  return { html, inlined };
}

// 电脑版微调：只在大屏生效，窗口拉小仍会自动退回移动端布局
// 注意必须写 :root —— --cell 是全局唯一尺寸来源，顶栏 / 行动栏靠它算 --bar-w
const DESKTOP_CSS = `
@media (min-width: 861px) {
  body { padding: 12px 16px; }
  :root {
    --cell: clamp(40px,
      min(80px,
          calc((100dvh - 122px - 22px) / 8),
          calc((100vw - 32px - 22px) / 8)),
      80px);
  }
}
`;

const VARIANTS = [
  {
    file: '战棋肉鸽-手机版.html',
    title: '战棋肉鸽（手机版）',
    css: '',
  },
  {
    file: '战棋肉鸽-电脑版.html',
    title: '战棋肉鸽（电脑版）',
    css: DESKTOP_CSS,
  },
];

const { html: base, inlined } = buildBase();
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');

// 分享用：dist/index.html = 电脑版（大屏放大、小屏自动退回手机布局，两端都能玩）
const DIST_DIR = path.join(ROOT, 'dist');

VARIANTS.forEach(v => {
  let html = base;
  if (v.css) html = html.replace('</head>', `<style id="variant-tweaks">${v.css}</style>\n</head>`);
  html = html.replace('<title>战棋肉鸽</title>',
    `<title>${v.title}</title>\n<!-- single-file build: ${stamp} -->`);

  const out = path.join(DESKTOP_DIR, v.file);
  fs.writeFileSync(out, html, 'utf8');
  const kb = (Buffer.byteLength(html, 'utf8') / 1024).toFixed(1);
  console.log(`✓ ${v.file}  ${kb} KB`);

  if (v.file.indexOf('电脑版') >= 0) {
    if (!fs.existsSync(DIST_DIR)) fs.mkdirSync(DIST_DIR, { recursive: true });
    // 分享页标题去掉「（电脑版）」—— 手机打开也是同一份
    const shared = html.replace(/<title>[^<]*<\/title>/, '<title>战棋肉鸽</title>');
    fs.writeFileSync(path.join(DIST_DIR, 'index.html'), shared, 'utf8');
    console.log(`✓ dist/index.html  ${kb} KB（发布用）`);
  }
});

console.log(`  内联 ${inlined.length} 个文件：` + inlined.join(' · '));
