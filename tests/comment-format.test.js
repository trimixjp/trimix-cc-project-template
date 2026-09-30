/**
 * コメント書式テスト（#116: エージェントのコメントと PR 本文を、人向けの要点以外は折りたたむ）
 *
 * templates/**\/*.md のコードブロックから「エージェントが写す投稿雛形」を自動で見つけ、
 * 折りたたみ形（1行目 → 要点 → <details> → ⏭️ 行）になっているかを静的に検査する。
 * 対象ファイルは固定リストにしない（新しいエージェントも自動で対象になる）。
 *
 * 雛形の判定規則（1行目が絵文字・{{agent_emoji}}・`## ⚠️ 関連インシデント注意事項` のどれかで始まり、次のいずれか）:
 *   1. `⏭️ 次のアクション:`・`## 実施内容`・`## 完了条件チェック` のいずれかの行を含む
 *   2. 1行目に「関連インシデント注意事項」または「独立レビュー完了」を含む
 *   3. 空行を除いて10行以上ある
 *
 * このテストが検知しないこと: 実行時にエージェントが雛形どおりに書くか（LLM の振る舞い）、
 * 要点行に書いた事実の正しさ、GitHub と Obsidian の実際の描画、既存環境への upgrade 配布。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const SUMMARY = '<summary>詳細（エージェント向けの記録）</summary>';
const FIRST_LINE = /^(\p{Extended_Pictographic}|\{\{agent_emoji\}\}|## ⚠️ 関連インシデント注意事項)/u;
const NEXT_ACTION = /^⏭️ 次のアクション:/;
// 今回の実測（105件・52ファイル）。減ったら判定の壊れか雛形の消失を疑う
const MIN_TEMPLATES = 105;
const MIN_FILES = 52;

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith('.md')) out.push(p);
  }
  return out;
}

/** コードブロック（``` と、入れ子用にエスケープした \`\`\`）を抜き出す */
function extractBlocks(text) {
  const lines = text.split('\n');
  const out = [];
  const cur = { raw: null, esc: null };
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*(\\`\\`\\`|```+)/.exec(lines[i]);
    if (m) {
      const kind = m[1].startsWith('\\') ? 'esc' : 'raw';
      if (cur[kind]) {
        out.push(cur[kind]);
        cur[kind] = null;
      } else {
        cur[kind] = { start: i + 1, lines: [] };
      }
      continue;
    }
    if (cur.esc) cur.esc.lines.push(lines[i]);
    if (cur.raw) cur.raw.lines.push(lines[i]);
  }
  return out;
}

function isTemplate(lines) {
  const first = lines[0] || '';
  if (!FIRST_LINE.test(first)) return false;
  if (lines.some((l) => /^⏭️ 次のアクション:|^## 実施内容|^## 完了条件チェック/.test(l))) return true;
  if (/関連インシデント注意事項|独立レビュー完了/.test(first)) return true;
  return lines.filter((l) => l.trim()).length >= 10;
}

function collectTemplates() {
  const found = [];
  for (const file of walk(join(root, 'templates'))) {
    const rel = file.slice(root.length + 1);
    for (const b of extractBlocks(readFileSync(file, 'utf8'))) {
      if (isTemplate(b.lines)) found.push({ where: `${rel}:${b.start}`, file: rel, lines: b.lines });
    }
  }
  return found;
}

const templates = collectTemplates();

test('雛形の件数が下限を下回らない（判定の壊れ・雛形の消失を検知）', () => {
  assert.ok(templates.length >= MIN_TEMPLATES, `雛形 ${templates.length} 件（下限 ${MIN_TEMPLATES}）`);
  const files = new Set(templates.map((t) => t.file));
  assert.ok(files.size >= MIN_FILES, `雛形を持つファイル ${files.size} 件（下限 ${MIN_FILES}）`);
});

test('全雛形が折りたたみ形（1行目が先頭・<details> 1組・空行3か所・⏭️ 行は外に1つ）', () => {
  const problems = [];
  for (const t of templates) {
    const L = t.lines;
    const open = L.flatMap((l, i) => (l === '<details>' ? [i] : []));
    const close = L.flatMap((l, i) => (l === '</details>' ? [i] : []));
    const sum = L.flatMap((l, i) => (l === SUMMARY ? [i] : []));
    if (open.length !== 1 || close.length !== 1 || sum.length !== 1) {
      problems.push(`${t.where}: <details>/<summary>/</details> が1組ずつ無い`);
      continue;
    }
    const [o] = open;
    const [c] = close;
    const [s] = sum;
    if (o === 0) problems.push(`${t.where}: <details> がコメントの先頭にある（1行目が先頭でない）`);
    if (s !== o + 1) problems.push(`${t.where}: <summary> が <details> の直後にない`);
    if (L[s + 1] !== '') problems.push(`${t.where}: <summary> の直後が空行でない`);
    if (L[c - 1] !== '') problems.push(`${t.where}: </details> の直前が空行でない`);
    if (c + 1 < L.length && L[c + 1] !== '') problems.push(`${t.where}: </details> の直後が空行でない`);
    if (!(c > s)) problems.push(`${t.where}: </details> が <summary> より前にある`);
    // 要点行（1行目と <details> の間に、空行以外の行がある）
    const between = L.slice(1, o).filter((l) => l.trim());
    if (between.length === 0) problems.push(`${t.where}: 1行目と <details> の間に要点行が無い`);
    // ⏭️ 行は </details> の外に高々1つ
    const next = L.flatMap((l, i) => (NEXT_ACTION.test(l) ? [i] : []));
    if (next.length > 1) problems.push(`${t.where}: ⏭️ 行が複数ある`);
    if (next.some((i) => i < c)) problems.push(`${t.where}: ⏭️ 行が </details> の内側にある`);
  }
  assert.deepEqual(problems, []);
});

test('1行目（差し戻し回数の照合が読む行）が雛形の先頭にあり、絵文字・プレースホルダ・注意事項見出しで始まる', () => {
  for (const t of templates) {
    assert.match(t.lines[0], FIRST_LINE, `${t.where}: 1行目が判定できない`);
  }
});

test('pr-creator の PR 本文フォーマットに、実行していない確認の既定値が無い（インシデント #11）', () => {
  for (const team of ['backend', 'frontend']) {
    const text = readFileSync(join(root, `templates/teams/${team}/agents/pr-creator.md`), 'utf8');
    const start = text.indexOf('## PR 本文フォーマット');
    const end = text.indexOf('\n## チケットコメントフォーマット', start);
    assert.ok(start >= 0 && end > start, `${team}: PR 本文フォーマットの節が見つからない`);
    const section = text.slice(start, end);
    for (const banned of ['全件パス', 'エラーなし', 'CI がパスしている']) {
      assert.ok(!section.includes(banned), `${team}: PR 本文フォーマットに「${banned}」がある`);
    }
    assert.ok(section.includes('## 承認前に知っておくこと'), `${team}: 「承認前に知っておくこと」が無い`);
    assert.ok(section.includes('<summary>テストとレビューの詳細</summary>'), `${team}: テストの <details> が無い`);
    assert.ok(section.includes('実行したコマンドと結果'), `${team}: 実行結果を書く規則が無い`);
  }
});

test('skills/ai-team-run.md に規約の小節・引き継ぎ前チェック・6条目・ステップ4の追記がある', () => {
  const text = readFileSync(join(root, 'skills/ai-team-run.md'), 'utf8');
  assert.ok(text.includes('### コメントの表示構成（折りたたみ）'), '規約の小節が無い');
  assert.ok(text.includes(SUMMARY), '固定の summary 文言が規約に無い');
  assert.ok(
    /1行目がコメントの先頭にあり、`⏭️ 次のアクション:` 行が `<\/details>` の外にある/.test(text),
    '引き継ぎ前チェックの項目が無い',
  );
  assert.ok(text.includes('以下6条項を**そのまま**'), '委託条項が6条項になっていない');
  assert.match(text, /^6\. チケットコメント・PR 本文は/m, '委託条項の6条目が無い');
  const step4 = text.slice(text.indexOf('## ステップ4'), text.indexOf('## ステップ5'));
  assert.ok(step4.includes('コメントの表示構成（折りたたみ）'), 'ステップ4に注意事項コメントの構成の記述が無い');
});
