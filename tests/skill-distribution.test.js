/**
 * スキル配布（bin/lib/skill-files.js / bin/sync-templates.js）のテスト（Issue #82 作業3）
 *
 * (a) skills/ に新しい ai-team-*.md を置くと配布対象へ自動的に含まれ、命名規則に
 *     合わないファイル（README.md / .gitkeep 等）は除外されること。
 * (b) sync 実行後、skills/*.md（配布対象）と .claude/commands/*.md が
 *     ファイル名・内容ともに一致すること。
 *
 * いずれも一時ディレクトリ上で実際に走査・同期を行い、実ファイルを読んで検証する。
 * 文字列リテラルへの assert（トートロジー）は行わない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { listSkillFiles, SKILL_FILES } from '../bin/lib/skill-files.js';
import { runSync } from '../bin/sync-templates.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

// ---------------------------------------------------------------------------
// (a) skills/ の動的走査
// ---------------------------------------------------------------------------

test('(a) skills/ に新しい ai-team-*.md を置くと配布対象へ自動的に含まれる', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-team-skills-'));
  try {
    // 命名規則に合うスキルを2つ配置
    writeFileSync(join(dir, 'ai-team-setup.md'), '# setup\n');
    writeFileSync(join(dir, 'ai-team-brandnew.md'), '# 新しいスキル\n');
    // 命名規則に合わないファイルは除外されるべき
    writeFileSync(join(dir, 'README.md'), '# readme\n');
    writeFileSync(join(dir, '.gitkeep'), '');
    writeFileSync(join(dir, 'notes.txt'), 'memo\n');

    const result = listSkillFiles(dir);

    assert.deepEqual(
      result,
      ['ai-team-brandnew.md', 'ai-team-setup.md'],
      `ai-team-*.md のみがソート済みで返るべき: ${result.join(', ')}`
    );
    // 新規スキルが静的定義なしで自動的に含まれること
    assert.ok(result.includes('ai-team-brandnew.md'), '新規スキルが配布対象に含まれていない');
    // 命名規則外は除外されること
    assert.ok(!result.includes('README.md'), 'README.md が混入している');
    assert.ok(!result.includes('.gitkeep'), '.gitkeep が混入している');
    assert.ok(!result.includes('notes.txt'), 'notes.txt が混入している');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('(a) SKILL_FILES は実際の skills/ を走査した結果と一致する', () => {
  const actual = listSkillFiles(join(packageRoot, 'skills'));
  assert.deepEqual([...SKILL_FILES].sort(), actual, 'SKILL_FILES が skills/ の走査結果と一致しない');
  assert.ok(SKILL_FILES.length > 0, '配布対象スキルが1件も検出されていない');
});

test('(a) 短縮エイリアスは配布対象に含まれ、かつ README 等の除外は維持される', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ai-team-alias-'));
  try {
    // 命名規則に合う正規スキルと、規則に合わない短縮エイリアスを混在させる
    writeFileSync(join(dir, 'ai-team-run.md'), '# run\n');
    writeFileSync(join(dir, 'airun.md'), '# airun\n');
    writeFileSync(join(dir, 'aiwatch.md'), '# aiwatch\n');
    writeFileSync(join(dir, 'aiticket.md'), '# aiticket\n');
    // allowlist 方式が命名規則フィルタを壊していないことを確認するための混入候補
    writeFileSync(join(dir, 'README.md'), '# readme\n');
    writeFileSync(join(dir, '.gitkeep'), '');
    writeFileSync(join(dir, 'notes.txt'), 'memo\n');
    // allowlist に無い ai- 始まりのファイルは配布対象にしない（正規表現を緩めていないこと）
    writeFileSync(join(dir, 'airandom.md'), '# 未登録\n');

    const result = listSkillFiles(dir);

    assert.deepEqual(
      result,
      ['ai-team-run.md', 'aiticket.md', 'aiwatch.md', 'airun.md'].sort(),
      `正規スキルと allowlist 済みエイリアスのみがソート済みで返るべき: ${result.join(', ')}`
    );
    for (const alias of ['airun.md', 'aiwatch.md', 'aiticket.md']) {
      assert.ok(result.includes(alias), `${alias} が配布対象に含まれていない`);
    }
    // 命名規則フィルタの回帰ガード（インシデント #3: フィルタの緩さによる誤検出）
    assert.ok(!result.includes('README.md'), 'README.md が混入している');
    assert.ok(!result.includes('.gitkeep'), '.gitkeep が混入している');
    assert.ok(!result.includes('notes.txt'), 'notes.txt が混入している');
    assert.ok(!result.includes('airandom.md'), 'allowlist に無い airandom.md が混入している');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('(a) isSkillFile は配布判定の単一の情報源として全経路から参照できる', async () => {
  const { isSkillFile, SKILL_ALIAS_FILES } = await import('../bin/lib/skill-files.js');

  assert.ok(isSkillFile('ai-team-run.md'), '命名規則に合うファイルが false になっている');
  assert.ok(isSkillFile('airun.md'), 'エイリアスが false になっている');
  assert.ok(!isSkillFile('README.md'), 'README.md が true になっている');
  assert.ok(!isSkillFile('airandom.md'), 'allowlist 外のファイルが true になっている');

  // sync-templates.js と apply-model-profile.js が独自の接頭辞判定を持たないこと。
  // 判定が二重実装されると、エイリアス追加時に片方だけ反映される（インシデント #4）。
  for (const rel of ['../bin/sync-templates.js', '../bin/lib/apply-model-profile.js']) {
    const src = readFileSync(join(__dirname, rel), 'utf8');
    assert.ok(
      src.includes('isSkillFile'),
      `${rel} が isSkillFile を参照していない（判定の二重実装が残っている疑い）`
    );
    assert.ok(
      !src.includes("startsWith('ai-team-')"),
      `${rel} に独自の接頭辞判定 startsWith('ai-team-') が残っている`
    );
  }

  assert.deepEqual(
    [...SKILL_ALIAS_FILES].sort(),
    ['aiticket.md', 'aiwatch.md', 'airun.md'].sort(),
    'SKILL_ALIAS_FILES の内容が想定と異なる'
  );
});

// ---------------------------------------------------------------------------
// (b) sync 実行後、skills/*.md と .claude/commands/*.md が一致する
// ---------------------------------------------------------------------------

test('(b) sync 後に skills/*.md と .claude/commands/*.md がファイル名・内容ともに一致する', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'ai-team-sync-'));
  const claudeDir = join(tmpRoot, '.claude');
  try {
    // 実リポジトリの templates/ と skills/ を正源に、一時 .claude/ へ同期する
    runSync({ claudeDir, log: () => {} });

    const commandsDir = join(claudeDir, 'commands');
    const skillsDir = join(packageRoot, 'skills');

    // skills/ 側の配布対象（.md）と、同期された commands/ の .md を比較する
    const skillMds = readdirSync(skillsDir).filter((f) => f.endsWith('.md')).sort();
    const commandMds = readdirSync(commandsDir).filter((f) => f.endsWith('.md')).sort();

    assert.deepEqual(commandMds, skillMds, 'commands/ と skills/ の .md ファイル名一覧が一致しない');
    assert.ok(commandMds.length > 0, 'commands/ に .md が同期されていない');

    // 各ファイルの内容（SHA-256）が一致すること
    for (const f of skillMds) {
      assert.equal(
        sha256(join(commandsDir, f)),
        sha256(join(skillsDir, f)),
        `${f} の内容が skills/ と commands/ で一致しない`
      );
    }
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }
});
