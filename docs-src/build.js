#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync, copyFileSync } from 'fs';
import { join, dirname, parse, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DOCS_SRC = join(ROOT, 'docs-src');
const PUBLIC_DOCS = join(ROOT, 'public', 'docs');

const config = JSON.parse(readFileSync(join(DOCS_SRC, 'config.json'), 'utf8'));

// Markdownを HTMLに変換（依存ライブラリなし）
function markdownToHtml(md) {
  let html = md;

  // コードブロック・インラインコードをプレースホルダに退避（後続の変換から保護）
  const blocks = [];
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const placeholder = (i) => `\x00BLOCK${i}\x00`;

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const i = blocks.length;
    if (lang === 'mermaid') {
      blocks.push(`<div class="mermaid">${code.trimEnd()}</div>`);
    } else {
      blocks.push(`<pre><code class="language-${lang}">${escape(code).trimEnd()}</code></pre>`);
    }
    return placeholder(i);
  });

  html = html.replace(/`([^`\n]+)`/g, (_, code) => {
    const i = blocks.length;
    blocks.push(`<code>${escape(code)}</code>`);
    return placeholder(i);
  });

  // 見出し
  html = html.replace(/^###### (.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^##### (.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 水平線
  html = html.replace(/^---$/gm, '<hr>');

  // テーブル
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (match, header, sep, rows) => {
    const ths = header.split('|').filter(Boolean).map(c => `<th>${c.trim()}</th>`).join('');
    const trs = rows.trim().split('\n').map(row => {
      const tds = row.split('|').filter(Boolean).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
  });

  // 箇条書き（チェックボックス）
  html = html.replace(/^- \[ \] (.+)$/gm, '<li class="task-item"><input type="checkbox" disabled> $1</li>');
  html = html.replace(/^- \[x\] (.+)$/gm, '<li class="task-item"><input type="checkbox" checked disabled> $1</li>');

  // 番号なしリスト
  html = html.replace(/((?:^- .+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const text = line.replace(/^- /, '');
      if (text.includes('class="task-item"')) return text;
      return `<li>${text}</li>`;
    }).join('');
    return `<ul>${items}</ul>`;
  });

  // 番号付きリスト
  html = html.replace(/((?:^\d+\. .+\n?)+)/gm, (match) => {
    const items = match.trim().split('\n').map(line => {
      const text = line.replace(/^\d+\. /, '');
      return `<li>${text}</li>`;
    }).join('');
    return `<ol>${items}</ol>`;
  });

  // 太字・斜体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 画像（リンク変換より先に処理する：![alt](src) は [text](href) の上位構文のため）
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');

  // リンク
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // 段落（ブロックタグ・プレースホルダ・空行以外の行を <p> で囲む）
  html = html.replace(/^(?!<[hupol]|<li|<pre|<table|<hr|<ul|<ol|\x00BLOCK)(.+)$/gm, (match) => {
    if (match.trim() === '') return '';
    return `<p>${match}</p>`;
  });

  // 連続する空行を1つにまとめる
  html = html.replace(/\n{3,}/g, '\n\n');

  // プレースホルダを復元
  html = html.replace(/\x00BLOCK(\d+)\x00/g, (_, i) => blocks[parseInt(i)]);

  return html;
}

// ナビゲーションHTMLを生成
function buildNav(navConfig, currentFile, version) {
  // 現在のファイルの深さ（バージョンルートからの相対）
  const currentDepth = currentFile.split('/').length - 1;
  const toRoot = '../'.repeat(currentDepth);

  let html = '';
  for (const section of navConfig) {
    html += `<div class="nav-section">`;
    html += `<div class="nav-section-title">${section.title}</div>`;
    html += `<ul class="nav-list">`;
    for (const item of section.items) {
      const targetHref = item.file === 'index' ? 'index.html' : `${item.file}.html`;
      const isActive = currentFile === item.file;
      html += `<li class="${isActive ? 'active' : ''}">`;
      html += `<a href="${toRoot}${targetHref}">${item.title}</a>`;
      html += `</li>`;
    }
    html += `</ul></div>`;
  }
  return html;
}

// バージョン切り替えHTMLを生成
function buildVersionSwitcher(versions, currentVersion, currentFile) {
  // バージョンディレクトリの1つ上（public/docs/）まで遡る必要がある
  const toDocsRoot = '../'.repeat(currentFile.split('/').length);
  const targetFile = currentFile === 'index' ? 'index.html' : `${currentFile}.html`;

  const options = versions.map(v => {
    const isLatest = v === config.latest;
    const label = isLatest ? `${v} (最新)` : v;
    const href = `${toDocsRoot}${v}/${targetFile}`;
    return `<option value="${href}" ${v === currentVersion ? 'selected' : ''}>${label}</option>`;
  }).join('');
  return `
    <div class="version-switcher">
      <label for="version-select">バージョン:</label>
      <select id="version-select" onchange="location.href=this.value">
        ${options}
      </select>
    </div>
  `;
}

// HTMLページを生成
function buildPage({ title, fileKey, content, nav, versionSwitcher, version }) {
  const depth = fileKey.split('/').length - 1;
  const assetPath = '../'.repeat(depth) + 'assets/';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${config.title}</title>
  <link rel="stylesheet" href="${assetPath}style.css">
</head>
<body>
  <div class="layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo">${config.title}</div>
        <div class="sidebar-version">v${version.replace('v', '')}</div>
      </div>
      <nav class="sidebar-nav">
        ${nav}
      </nav>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="topbar-title">${title}</div>
        ${versionSwitcher}
      </header>
      <article class="content">
        ${content}
      </article>
    </div>
  </div>
  <script src="${assetPath}script.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({startOnLoad: true, theme: 'default'});</script>
</body>
</html>`;
}

// CSSを生成
function generateCSS() {
  return `
:root {
  --sidebar-width: 260px;
  --topbar-height: 56px;
  --color-primary: #2563eb;
  --color-primary-light: #dbeafe;
  --color-bg: #ffffff;
  --color-sidebar-bg: #f8fafc;
  --color-sidebar-border: #e2e8f0;
  --color-text: #1e293b;
  --color-text-muted: #64748b;
  --color-border: #e2e8f0;
  --color-code-bg: #f1f5f9;
  --color-pre-bg: #1e293b;
  --color-pre-text: #e2e8f0;
  --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  --radius: 6px;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: var(--font-sans);
  font-size: 15px;
  color: var(--color-text);
  background: var(--color-bg);
  line-height: 1.7;
}

.layout {
  display: flex;
  min-height: 100vh;
}

/* サイドバー */
.sidebar {
  width: var(--sidebar-width);
  height: 100vh;
  background: var(--color-sidebar-bg);
  border-right: 1px solid var(--color-sidebar-border);
  position: fixed;
  top: 0;
  left: 0;
  overflow-y: auto;
  z-index: 100;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--color-sidebar-border);
  background: var(--color-sidebar-bg);
  position: sticky;
  top: 0;
}

.sidebar-logo {
  font-size: 13px;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1.3;
  margin-bottom: 4px;
}

.sidebar-version {
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  background: var(--color-primary-light);
  color: var(--color-primary);
  display: inline-block;
  padding: 1px 8px;
  border-radius: 20px;
  font-weight: 600;
}

.sidebar-nav {
  padding: 12px 0 20px;
  flex: 1;
}

.nav-section {
  margin-bottom: 8px;
}

.nav-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--color-text-muted);
  padding: 10px 20px 4px;
}

.nav-list {
  list-style: none;
}

.nav-list li a {
  display: block;
  padding: 6px 20px;
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: 14px;
  border-left: 3px solid transparent;
  transition: all 0.15s;
}

.nav-list li a:hover {
  color: var(--color-text);
  background: var(--color-sidebar-border);
}

.nav-list li.active a {
  color: var(--color-primary);
  border-left-color: var(--color-primary);
  background: var(--color-primary-light);
  font-weight: 600;
}

/* メインエリア */
.main {
  margin-left: var(--sidebar-width);
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* トップバー */
.topbar {
  height: var(--topbar-height);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 40px;
  background: var(--color-bg);
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar-title {
  font-size: 14px;
  color: var(--color-text-muted);
}

/* バージョン切り替え */
.version-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-muted);
}

.version-switcher select {
  font-size: 13px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-bg);
  color: var(--color-text);
  cursor: pointer;
  outline: none;
  font-family: var(--font-mono);
}

.version-switcher select:hover {
  border-color: var(--color-primary);
}

/* コンテンツ */
.content {
  max-width: 800px;
  padding: 40px;
  width: 100%;
}

.content h1 {
  font-size: 2rem;
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 16px;
  line-height: 1.2;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 16px;
}

.content h2 {
  font-size: 1.4rem;
  font-weight: 700;
  margin-top: 40px;
  margin-bottom: 12px;
  color: var(--color-text);
}

.content h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-top: 28px;
  margin-bottom: 10px;
  color: var(--color-text);
}

.content h4, .content h5, .content h6 {
  font-size: 0.95rem;
  font-weight: 600;
  margin-top: 20px;
  margin-bottom: 8px;
  color: var(--color-text-muted);
}

.content p {
  margin-bottom: 16px;
  line-height: 1.8;
}

.content ul, .content ol {
  margin: 12px 0 16px 24px;
}

.content li {
  margin-bottom: 6px;
  line-height: 1.7;
}

.content li.task-item {
  list-style: none;
  margin-left: -20px;
}

.content img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 20px 0;
  border-radius: var(--radius);
}

.content a {
  color: var(--color-primary);
  text-decoration: none;
}

.content a:hover {
  text-decoration: underline;
}

.content code {
  background: var(--color-code-bg);
  border-radius: 4px;
  padding: 2px 6px;
  font-family: var(--font-mono);
  font-size: 0.875em;
  color: #c026d3;
}

.content pre {
  background: var(--color-pre-bg);
  border-radius: var(--radius);
  padding: 20px 24px;
  overflow-x: auto;
  margin: 20px 0;
  position: relative;
}

.content pre code {
  background: none;
  color: var(--color-pre-text);
  padding: 0;
  font-size: 0.875em;
  line-height: 1.7;
}

.content table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
  font-size: 14px;
}

.content th {
  background: var(--color-sidebar-bg);
  padding: 10px 16px;
  text-align: left;
  font-weight: 600;
  font-size: 13px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
}

.content td {
  padding: 10px 16px;
  border: 1px solid var(--color-border);
  vertical-align: top;
}

.content tr:nth-child(even) td {
  background: var(--color-sidebar-bg);
}

.content hr {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 32px 0;
}

/* レスポンシブ */
@media (max-width: 768px) {
  .sidebar {
    transform: translateX(-100%);
    transition: transform 0.2s;
  }
  .sidebar.open {
    transform: translateX(0);
  }
  .main {
    margin-left: 0;
  }
  .content {
    padding: 24px 20px;
  }
}
`;
}

// JSを生成
function generateJS() {
  return `
// アクティブ状態はサーバーサイドビルド時にHTMLへ直接設定済み
`;
}

// ファイルを再帰的に検索
function findMarkdownFiles(dir, base = dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMarkdownFiles(full, base));
    } else if (entry.endsWith('.md')) {
      const rel = relative(base, full).replace(/\.md$/, '').replace(/\\/g, '/');
      results.push(rel);
    }
  }
  return results;
}

// コピー対象とする画像拡張子（小文字で判定）
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp'];

// 画像ファイルを再帰的に検索（バージョンルートからの相対パスを返す）
function findImageFiles(dir, base = dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findImageFiles(full, base));
    } else if (IMAGE_EXTENSIONS.includes(parse(entry).ext.toLowerCase())) {
      const rel = relative(base, full).replace(/\\/g, '/');
      results.push(rel);
    }
  }
  return results;
}

// バージョン配下の画像を相対パス（サブディレクトリ構造）を保ったままコピー
function copyImages(srcDir, outDir) {
  const imageFiles = findImageFiles(srcDir);
  for (const rel of imageFiles) {
    const srcFile = join(srcDir, rel);
    const outFile = join(outDir, rel);
    mkdirSync(dirname(outFile), { recursive: true });
    copyFileSync(srcFile, outFile);
    console.log(`    🖼️  ${rel}`);
  }
  return imageFiles.length;
}

// メインビルド処理
function build() {
  console.log('📚 ドキュメントビルドを開始...');

  // public/docs ディレクトリ作成
  mkdirSync(PUBLIC_DOCS, { recursive: true });

  const allVersionFiles = [];

  for (const version of config.versions) {
    console.log(`  ビルド中: ${version}`);
    const srcDir = join(DOCS_SRC, 'versions', version);
    const outDir = join(PUBLIC_DOCS, version);
    const assetsDir = join(outDir, 'assets');

    mkdirSync(outDir, { recursive: true });
    mkdirSync(assetsDir, { recursive: true });

    // CSS/JSを出力
    writeFileSync(join(assetsDir, 'style.css'), generateCSS(), 'utf8');
    writeFileSync(join(assetsDir, 'script.js'), generateJS(), 'utf8');

    // 画像を相対パス（サブディレクトリ構造）を保ったままコピー
    copyImages(srcDir, outDir);

    // Markdownファイルを検索
    const mdFiles = findMarkdownFiles(srcDir);

    const navConfig = config.nav[version] || [];

    for (const fileKey of mdFiles) {
      const srcFile = join(srcDir, fileKey + '.md');
      const md = readFileSync(srcFile, 'utf8');
      const htmlContent = markdownToHtml(md);

      // ページタイトルを最初のH1から取得
      const titleMatch = md.match(/^# (.+)$/m);
      const pageTitle = titleMatch ? titleMatch[1] : fileKey;

      // 出力パスを決定
      const outFile = join(outDir, fileKey + '.html');
      mkdirSync(dirname(outFile), { recursive: true });

      // ナビゲーションのdepthを計算
      const depth = fileKey.split('/').length - 1;

      const nav = buildNav(navConfig, fileKey, version);
      const versionSwitcher = buildVersionSwitcher(config.versions, version, fileKey);

      const html = buildPage({
        title: pageTitle,
        fileKey,
        content: htmlContent,
        nav,
        versionSwitcher,
        version,
      });

      writeFileSync(outFile, html, 'utf8');
      console.log(`    ✅ ${fileKey}.html`);
    }
  }

  // versions.json を更新
  const versionsJson = config.versions.map(v => ({
    version: v,
    label: v === config.latest ? `${v} (最新)` : v,
    path: `./${v}/index.html`,
  }));
  writeFileSync(join(PUBLIC_DOCS, 'versions.json'), JSON.stringify(versionsJson, null, 2), 'utf8');
  console.log('  ✅ versions.json');

  // index.html（最新バージョンへのリダイレクト）
  const indexHtml = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=./${config.latest}/index.html">
  <title>${config.title}</title>
</head>
<body>
  <p><a href="./${config.latest}/index.html">最新ドキュメントへ移動</a></p>
</body>
</html>`;
  writeFileSync(join(PUBLIC_DOCS, 'index.html'), indexHtml, 'utf8');
  console.log('  ✅ index.html');

  console.log('✨ ビルド完了');
}

build();
