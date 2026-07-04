/**
 * プラグインのライフサイクル（install → uninstall）と registry ヘルパのテスト
 *
 * install/uninstall は process.exit を含むため子プロセスで実行する。
 * PATH を最小限に制限して gh コマンドを不可視にし、
 * テストが実リポジトリの GitHub ラベルを変更しないようにする。
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import {
  existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync, writeFileSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');
const setupJs = join(packageRoot, 'bin', 'setup.js');

// gh を含まない最小 PATH（node は process.execPath の絶対パスで起動する）
const RESTRICTED_ENV = { ...process.env, PATH: '/usr/bin:/bin' };

function runCli(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [setupJs, ...args], {
      cwd, env: RESTRICTED_ENV, encoding: 'utf-8', stdio: 'pipe'
    });
    return { status: 0, stdout, stderr: '' };
  } catch (e) {
    return { status: e.status, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const CONFIG_YAML = `# @trimix/ai-team 運用設定
mode: solo
version_management: auto
solo:
  poll_interval_minutes: 5
  target_labels:
    - dispatcher
  skip_labels:
    - ai-team:in-progress
`;

test('install → uninstall のラウンドトリップでファイルと設定が元に戻る', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ai-team-test-'));
  try {
    mkdirSync(join(tmp, '.claude'), { recursive: true });
    writeFileSync(join(tmp, '.claude', 'ai-team-config.yml'), CONFIG_YAML, 'utf-8');

    // install
    const install = runCli(['install', 'backend'], tmp);
    assert.strictEqual(install.status, 0, `install が失敗: ${install.stderr}`);
    assert.ok(existsSync(join(tmp, '.claude', 'teams', 'backend', 'workflow.yml')), 'workflow.yml が配置されていない');
    assert.ok(existsSync(join(tmp, 'ai-team-plugins.json')), 'ai-team-plugins.json が生成されていない');

    const plugins = JSON.parse(readFileSync(join(tmp, 'ai-team-plugins.json'), 'utf-8'));
    assert.ok(plugins.installed['trimix-backend'], 'trimix-backend が記録されていない');
    assert.ok(plugins.installed['trimix-backend'].files.length > 0, 'files 一覧が空');

    const configAfterInstall = readFileSync(join(tmp, '.claude', 'ai-team-config.yml'), 'utf-8');
    assert.ok(configAfterInstall.includes('- backend:tech-lead'), 'target_labels に backend:tech-lead が追加されていない');

    // 二重インストールは既にインストール済みとして正常終了する
    const reinstall = runCli(['install', 'backend'], tmp);
    assert.strictEqual(reinstall.status, 0, '二重インストールがエラー終了した');
    assert.ok(reinstall.stdout.includes('既にインストール済み'), '既にインストール済みの案内がない');

    // uninstall
    const uninstall = runCli(['uninstall', 'backend'], tmp);
    assert.strictEqual(uninstall.status, 0, `uninstall が失敗: ${uninstall.stderr}`);
    assert.ok(!existsSync(join(tmp, '.claude', 'teams', 'backend')), 'teams/backend が削除されていない');

    const pluginsAfter = JSON.parse(readFileSync(join(tmp, 'ai-team-plugins.json'), 'utf-8'));
    assert.deepStrictEqual(pluginsAfter.installed, {}, 'ai-team-plugins.json が空に戻っていない');

    const configAfterUninstall = readFileSync(join(tmp, '.claude', 'ai-team-config.yml'), 'utf-8');
    assert.ok(!configAfterUninstall.includes('backend:tech-lead'), 'target_labels から backend:tech-lead が除去されていない');
    assert.ok(configAfterUninstall.includes('- dispatcher'), '既存の target_labels が壊れている');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('distribution: template のチーム（youtube/sns）は install がガードされる', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ai-team-test-'));
  try {
    for (const teamId of ['youtube', 'sns']) {
      const result = runCli(['install', teamId], tmp);
      assert.strictEqual(result.status, 1, `${teamId} の install が成功してしまった`);
      assert.ok(
        result.stderr.includes('プラグインパッケージとしては提供されていません'),
        `${teamId} の未提供メッセージがない: ${result.stderr}`
      );
      assert.ok(result.stderr.includes('/ai-team-setup'), `${teamId} のセットアップ案内がない`);
    }
    assert.ok(!existsSync(join(tmp, 'ai-team-plugins.json')), 'ガード時に ai-team-plugins.json が生成された');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('未知のチームIDは install がエラー終了する', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'ai-team-test-'));
  try {
    const result = runCli(['install', 'no-such-team'], tmp);
    assert.strictEqual(result.status, 1);
    assert.ok(result.stderr.includes('見つかりません'), `エラーメッセージがない: ${result.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('registry ヘルパ: findPlugin は id / team_id の両方で検索できる', async () => {
  const { findPlugin } = await import(join(packageRoot, 'bin', 'lib', 'registry.js'));
  assert.strictEqual(findPlugin('trimix-backend')?.team_id, 'backend');
  assert.strictEqual(findPlugin('backend')?.id, 'trimix-backend');
  assert.strictEqual(findPlugin('no-such-plugin'), null);
});

test('registry ヘルパ: インストール済み検索が team_id / label_prefix で機能する', async () => {
  const {
    loadInstalledPlugins, saveInstalledPlugins,
    findInstalledByTeamId, findInstalledByLabelPrefix
  } = await import(join(packageRoot, 'bin', 'lib', 'registry.js'));

  const tmp = mkdtempSync(join(tmpdir(), 'ai-team-test-'));
  try {
    assert.deepStrictEqual(loadInstalledPlugins(tmp), { installed: {} }, '未インストール時に空が返らない');

    saveInstalledPlugins(tmp, {
      installed: {
        'trimix-backend': { id: 'trimix-backend', team_id: 'backend', label_prefix: 'backend' }
      }
    });
    assert.strictEqual(findInstalledByTeamId(tmp, 'backend')?.[0], 'trimix-backend');
    assert.strictEqual(findInstalledByTeamId(tmp, 'frontend'), null);
    assert.strictEqual(findInstalledByLabelPrefix(tmp, 'backend')?.[0], 'trimix-backend');
    assert.strictEqual(findInstalledByLabelPrefix(tmp, 'infra'), null);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('SKILL_FILES の全ファイルが skills/ に実在し、過不足がない', async () => {
  const { SKILL_FILES } = await import(join(packageRoot, 'bin', 'lib', 'skill-files.js'));
  const { readdirSync } = await import('node:fs');
  const actual = readdirSync(join(packageRoot, 'skills')).filter(f => f.endsWith('.md')).sort();
  assert.deepStrictEqual([...SKILL_FILES].sort(), actual, 'SKILL_FILES と skills/ の実体が一致しない');
});
