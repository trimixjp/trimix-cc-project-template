import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { copyDirAndTrack, isCustomized } from '../bin/lib/plugin-install.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// ワイルドカード分岐（copyDirAndTrack）の上書き保護テスト
//
// これらは実際に copyDirAndTrack を呼び、一時ディレクトリ上のファイルの中身を
// 読んで検証する。文字列リテラルへの assert（トートロジー）は行わない。
// 過去のバージョンではワイルドカード分岐に上書き保護が無く、カスタマイズ済みの
// agents/* と dod/* が無条件で上書きされてデータ損失していた（Issue #82）。
// ---------------------------------------------------------------------------

const NEW_CONTENT = '# 新バージョンのエージェント定義\nname: new-agent\n';
const CUSTOMIZED_CONTENT = '# customized: true\nname: my-custom-agent\n';
const PLAIN_CONTENT = 'name: old-agent\n';

/** src/dest 一時ディレクトリのペアを作る */
function makeDirs(category) {
  const src = mkdtempSync(join(tmpdir(), `src-${category}-`));
  const dest = mkdtempSync(join(tmpdir(), `dest-${category}-`));
  return { src, dest, destPrefix: `.claude/teams/backend/${category}` };
}

// agents/* と dod/* は同一の copyDirAndTrack を通るため、両カテゴリで検証する
for (const category of ['agents', 'dod']) {
  const fileName = category === 'agents' ? 'implementer.md' : 'basic.md';

  test(`(${category}) マーカーありの既存ファイルは --force なしで保持される`, () => {
    const { src, dest, destPrefix } = makeDirs(category);
    writeFileSync(join(src, fileName), NEW_CONTENT);
    writeFileSync(join(dest, fileName), CUSTOMIZED_CONTENT);

    const { files, skipped } = copyDirAndTrack(src, dest, destPrefix, false);

    const after = readFileSync(join(dest, fileName), 'utf-8');
    assert.equal(after, CUSTOMIZED_CONTENT, 'カスタマイズ済みファイルの中身が保持されること');
    assert.equal(skipped, 1, 'スキップ件数が1であること');
    assert.ok(
      files.includes(join(destPrefix, fileName)),
      'スキップしたファイルもインストール済みとして追跡されること'
    );
  });

  test(`(${category}) マーカーなしの既存ファイルは上書きされる`, () => {
    const { src, dest, destPrefix } = makeDirs(category);
    writeFileSync(join(src, fileName), NEW_CONTENT);
    writeFileSync(join(dest, fileName), PLAIN_CONTENT);

    const { files, skipped } = copyDirAndTrack(src, dest, destPrefix, false);

    const after = readFileSync(join(dest, fileName), 'utf-8');
    assert.equal(after, NEW_CONTENT, 'マーカーなしファイルは新バージョンで上書きされること');
    assert.equal(skipped, 0, 'スキップ件数が0であること');
    assert.ok(files.includes(join(destPrefix, fileName)), 'コピーしたファイルが追跡されること');
  });

  test(`(${category}) --force 指定時はマーカーありでも上書きされる`, () => {
    const { src, dest, destPrefix } = makeDirs(category);
    writeFileSync(join(src, fileName), NEW_CONTENT);
    writeFileSync(join(dest, fileName), CUSTOMIZED_CONTENT);

    const { skipped } = copyDirAndTrack(src, dest, destPrefix, true);

    const after = readFileSync(join(dest, fileName), 'utf-8');
    assert.equal(after, NEW_CONTENT, '--force ではカスタマイズ済みでも上書きされること');
    assert.equal(skipped, 0, '--force 時はスキップされないこと');
  });
}

test('isCustomized はマーカーの有無を実ファイルから判定する', () => {
  const dir = mkdtempSync(join(tmpdir(), 'is-customized-'));
  const withMarker = join(dir, 'a.md');
  const withoutMarker = join(dir, 'b.md');
  writeFileSync(withMarker, CUSTOMIZED_CONTENT);
  writeFileSync(withoutMarker, PLAIN_CONTENT);

  assert.equal(isCustomized(withMarker), true, 'マーカーありを true と判定すること');
  assert.equal(isCustomized(withoutMarker), false, 'マーカーなしを false と判定すること');
  assert.equal(isCustomized(join(dir, 'missing.md')), false, '存在しないファイルは false であること');
});

// ---------------------------------------------------------------------------
// マーカー検出範囲のヘッダ領域限定テスト（Issue #82 追加修正）
//
// isCustomized() はファイル全体ではなく先頭のヘッダ領域（先頭 5 行）だけを見て
// マーカーを検出する。本文中にマーカー文字列を解説として含むだけのファイル
// （skills/ai-team-configure.md など）を「カスタマイズ済み」と誤検出しないため。
// いずれも実関数を呼び、一時ディレクトリ上のファイルの中身を読んで検証する。
// ---------------------------------------------------------------------------

test('ヘッダ領域にマーカーがあるファイルは保護される（YAML 先頭行 / Markdown frontmatter 直後）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'header-marker-'));

  // (1) frontmatter を持たない YAML: マーカーを 1 行目に置く（workflow.yml と同じ形式）
  const yamlPath = join(dir, 'workflow.yml');
  writeFileSync(yamlPath, '# customized: true\nname: backend-workflow\nsteps: []\n');

  // (2) frontmatter を持つ Markdown: マーカーを `---` の直後（2 行目）に置く（agents/*.md と同じ形式）
  const mdPath = join(dir, 'tech-lead.md');
  writeFileSync(
    mdPath,
    '---\n# customized: true\nname: tech-lead\nmodel: opus\n---\n\n# 本文\n'
  );

  assert.equal(
    isCustomized(yamlPath),
    true,
    'YAML の 1 行目マーカーはヘッダ領域として検出され保護されること'
  );
  assert.equal(
    isCustomized(mdPath),
    true,
    'frontmatter 直後（2 行目）のマーカーはヘッダ領域として検出され保護されること'
  );
});

test('本文中（ヘッダ領域より後）にマーカー文字列があるだけのファイルは保護されない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'body-marker-'));
  const filePath = join(dir, 'configure-like.md');

  // 実際の skills/ai-team-configure.md と同様、コードブロック内でマーカーの付け方を
  // 解説しているファイルを模す。マーカー文字列はヘッダ領域（先頭 5 行）より後にのみ現れる。
  const lines = [
    '---',                                          // 1
    'name: ai-team-configure',                      // 2
    'description: ワークフロー設定ウィザード',       // 3
    'model: sonnet',                                // 4
    'effort: high',                                 // 5
    '---',                                          // 6
    '',                                             // 7
    '# 設定ウィザード',                             // 8
    '',                                             // 9
    'YAML を生成する際は次の形式にします。',        // 10
    '',                                             // 11
    '```yaml',                                      // 12
    '# customized: true',                           // 13 ← 解説用コードブロック内（ヘッダ領域より後）
    'name: <name>',                                 // 14
    '```',                                          // 15
    '',                                             // 16
    '先頭行に必ず `# customized: true` を記述してください。' // 17
  ];
  writeFileSync(filePath, lines.join('\n'));

  assert.equal(
    isCustomized(filePath),
    false,
    '本文の解説文としてのマーカーは誤検出せず保護対象にしないこと'
  );
});

test('配布物 skills/ai-team-configure.md と ai-team-install.md は isCustomized で false（誤検出しない）', () => {
  // 回帰防止: これらの配布物は本文にマーカー文字列を解説として含むが（前提を確認）、
  // ヘッダ領域には無いため保護対象になってはならない。配布物そのものを対象に検証する。
  const configurePath = join(__dirname, '../skills/ai-team-configure.md');
  const installPath = join(__dirname, '../skills/ai-team-install.md');

  // 前提の確認: 両ファイルとも本文にマーカー文字列を含む（含まないと本テストが無意味になる）
  assert.ok(
    readFileSync(configurePath, 'utf-8').includes('# customized: true'),
    '前提: ai-team-configure.md は本文にマーカー文字列を含む'
  );
  assert.ok(
    readFileSync(installPath, 'utf-8').includes('# customized: true'),
    '前提: ai-team-install.md は本文にマーカー文字列を含む'
  );

  // それでもヘッダ領域には無いため、保護対象にはならない
  assert.equal(
    isCustomized(configurePath),
    false,
    'ai-team-configure.md は本文の解説文で誤検出されず false であること'
  );
  assert.equal(
    isCustomized(installPath),
    false,
    'ai-team-install.md は本文の解説文で誤検出されず false であること'
  );
});

test('configure が生成するYAMLのフォーマットに # customized: true が含まれる', () => {
  const configureMd = readFileSync(
    join(__dirname, '../skills/ai-team-configure.md'),
    'utf-8'
  );
  assert.ok(
    configureMd.includes('# customized: true'),
    'ai-team-configure.md のYAMLテンプレートに # customized: true が含まれること'
  );
  assert.ok(
    configureMd.includes('先頭行に必ず `# customized: true`'),
    'フォーマットルールに # customized: true の記述があること'
  );
});

test('ai-team-install.md に --force オプションの説明が含まれる', () => {
  const installMd = readFileSync(
    join(__dirname, '../skills/ai-team-install.md'),
    'utf-8'
  );
  assert.ok(
    installMd.includes('--force'),
    'ai-team-install.md に --force オプションの説明があること'
  );
  assert.ok(
    installMd.includes('# customized: true'),
    'ai-team-install.md に customized マーカーの説明があること'
  );
});
