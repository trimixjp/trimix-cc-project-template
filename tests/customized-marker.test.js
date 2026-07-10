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
