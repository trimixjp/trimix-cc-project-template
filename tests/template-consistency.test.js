/**
 * テンプレート整合性テスト
 *
 * (a) templates/teams/<team>/ と packages/workflow-<team>/templates/ のミラー一致
 * (b) 各チームの workflow.yml に登場する全ラベルが skills/ai-team-setup.md のラベル作成ブロックに含まれる
 * (c) workflow.yml に旧キー requires: が使われていない（requires_all_of のみ）
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

// ミラー一致の対象チーム（packages/workflow-<team>/templates として SHA-256 ミラーを持つ全チーム）。
// sns・youtube はテンプレート同梱配布（distribution: template）だが、ミラーパッケージを
// 持つため SHA-256 一致検証の対象に含める。
const TEAMS = ['backend', 'content', 'frontend', 'infra', 'sns', 'youtube'];

// ラベル整合の対象チーム（全チーム）
const LABEL_TEAMS = [...TEAMS];

/**
 * ディレクトリ配下の全ファイルを再帰的に列挙し、相対パス（POSIX形式）のソート済み配列を返す
 */
function listFilesRecursive(dir, base = dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, base));
    } else {
      files.push(relative(base, fullPath).split(sep).join('/'));
    }
  }
  return files.sort();
}

/**
 * ファイル内容のSHA-256ハッシュを返す
 */
function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/**
 * workflow.yml から label: "xxx" 形式の全ラベルを抽出する
 */
function extractLabels(workflowContent) {
  const labels = new Set();
  for (const match of workflowContent.matchAll(/^\s*label:\s*"([^"]+)"/gm)) {
    labels.add(match[1]);
  }
  return [...labels].sort();
}

// ============================================================
// (a) templates/teams/<team>/ と packages/workflow-<team>/templates/ のミラー一致
// ============================================================

for (const team of TEAMS) {
  test(`ミラー一致(${team}): templates/teams/${team} と packages/workflow-${team}/templates が一致する`, () => {
    const sourceDir = join(packageRoot, 'templates', 'teams', team);
    const mirrorDir = join(packageRoot, 'packages', `workflow-${team}`, 'templates');

    assert.ok(existsSync(sourceDir), `templates/teams/${team} が存在しない`);
    assert.ok(existsSync(mirrorDir), `packages/workflow-${team}/templates が存在しない`);

    // ファイル一覧の一致
    const sourceFiles = listFilesRecursive(sourceDir);
    const mirrorFiles = listFilesRecursive(mirrorDir);
    assert.deepEqual(
      mirrorFiles,
      sourceFiles,
      `ファイル一覧が一致しない（templates/teams/${team} と packages/workflow-${team}/templates）`
    );

    // 各ファイルの内容ハッシュの一致
    for (const file of sourceFiles) {
      const sourceHash = sha256(join(sourceDir, file));
      const mirrorHash = sha256(join(mirrorDir, file));
      assert.equal(
        mirrorHash,
        sourceHash,
        `ファイル内容が一致しない: ${file}（templates/teams/${team} と packages/workflow-${team}/templates）`
      );
    }
  });
}

// ============================================================
// (b) 各チームの workflow.yml の全ラベルが skills/ai-team-setup.md のラベル作成ブロックに含まれる
// ============================================================

for (const team of LABEL_TEAMS) {
  test(`ラベル整合(${team}): workflow.yml の全ラベルが skills/ai-team-setup.md で作成される`, () => {
    const workflowPath = join(packageRoot, 'templates', 'teams', team, 'workflow.yml');
    const setupSkillPath = join(packageRoot, 'skills', 'ai-team-setup.md');

    assert.ok(existsSync(workflowPath), `templates/teams/${team}/workflow.yml が存在しない`);
    assert.ok(existsSync(setupSkillPath), 'skills/ai-team-setup.md が存在しない');

    const labels = extractLabels(readFileSync(workflowPath, 'utf-8'));
    const setupSkill = readFileSync(setupSkillPath, 'utf-8');

    assert.ok(labels.length > 0, `${team} の workflow.yml からラベルが抽出できない`);

    const missing = labels.filter(
      (label) => !setupSkill.includes(`gh label create "${label}"`)
    );
    assert.deepEqual(
      missing,
      [],
      `skills/ai-team-setup.md のラベル作成ブロックに含まれていないラベル: ${missing.join(', ')}`
    );
  });
}

// ============================================================
// (c) workflow.yml に旧キー requires: が使われていない（requires_all_of のみ）
// ============================================================

test('旧キー禁止: 全 workflow.yml で requires: が使われていない（requires_all_of のみ）', () => {
  // templates/teams/*/workflow.yml と packages/workflow-*/templates/workflow.yml を動的に収集
  const workflowFiles = [];

  const teamsDir = join(packageRoot, 'templates', 'teams');
  for (const entry of readdirSync(teamsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workflowPath = join(teamsDir, entry.name, 'workflow.yml');
    if (existsSync(workflowPath)) workflowFiles.push(workflowPath);
  }

  const packagesDir = join(packageRoot, 'packages');
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const workflowPath = join(packagesDir, entry.name, 'templates', 'workflow.yml');
    if (existsSync(workflowPath)) workflowFiles.push(workflowPath);
  }

  assert.ok(workflowFiles.length > 0, '検査対象の workflow.yml が見つからない');

  const violations = [];
  for (const filePath of workflowFiles) {
    const content = readFileSync(filePath, 'utf-8');
    // 行頭（インデント込み）の requires: キーを検出（requires_all_of: は許可）
    if (/^\s*requires:/m.test(content)) {
      violations.push(relative(packageRoot, filePath));
    }
  }

  assert.deepEqual(
    violations,
    [],
    `旧キー requires: が使われているファイル: ${violations.join(', ')}`
  );
});
