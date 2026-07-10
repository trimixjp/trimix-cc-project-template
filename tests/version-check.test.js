/**
 * バージョン追跡（bin/lib/version-check.js）のテスト（Issue #82 作業4）
 *
 * ai-team-plugins.json に記録された導入時 version と registry.json の version を
 * 比較し、差があるプラグインを検出する挙動を検証する。
 * registry.json は実リポジトリのものを正源として使い、cwd 側の
 * ai-team-plugins.json を一時ディレクトリに用意して差分を作る。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, writeFileSync, rmSync, readFileSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { checkPluginUpdates, printUpdateNotice } from '../bin/lib/version-check.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

/** registry.json から実際の登録版番号を引く（テストのトートロジー回避） */
function registryVersion(id) {
  const registry = JSON.parse(readFileSync(join(packageRoot, 'registry.json'), 'utf-8'));
  return registry.plugins.find((p) => p.id === id).version;
}

/** cwd に ai-team-plugins.json を書く */
function writePlugins(cwd, installed) {
  writeFileSync(join(cwd, 'ai-team-plugins.json'), JSON.stringify({ installed }, null, 2), 'utf-8');
}

test('導入時 version と registry version に差があるプラグインを検出する', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-vcheck-'));
  try {
    const latest = registryVersion('trimix-backend');
    // registry と確実に異なる古い版を導入済みとして記録する
    const installedVersion = `${latest}-old`;
    writePlugins(cwd, {
      'trimix-backend': {
        id: 'trimix-backend',
        name: 'バックエンドチーム',
        version: installedVersion
      }
    });

    const updates = checkPluginUpdates(cwd);
    assert.equal(updates.length, 1, '差のあるプラグインが1件検出されるべき');
    assert.equal(updates[0].id, 'trimix-backend');
    assert.equal(updates[0].installed, installedVersion);
    assert.equal(updates[0].latest, latest, 'latest は registry の版番号であるべき');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('導入時 version と registry version が同じなら検出しない', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-vcheck-same-'));
  try {
    writePlugins(cwd, {
      'trimix-backend': {
        id: 'trimix-backend',
        name: 'バックエンドチーム',
        version: registryVersion('trimix-backend')
      }
    });
    assert.deepEqual(checkPluginUpdates(cwd), [], '版が同じなら更新は検出されない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('ai-team-plugins.json が無い場合は空配列を返す', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-vcheck-none-'));
  try {
    assert.deepEqual(checkPluginUpdates(cwd), [], '未導入なら更新は検出されない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('printUpdateNotice: 更新があれば版番号を含めて出力し、無ければ何も出力しない', () => {
  const lines = [];
  const log = (msg = '') => lines.push(msg);

  printUpdateNotice([{ id: 'trimix-backend', name: 'バックエンドチーム', installed: '1.0.0', latest: '1.2.0' }], log);
  const joined = lines.join('\n');
  assert.ok(joined.includes('更新があります'), '更新通知の見出しが出力されるべき');
  assert.ok(joined.includes('v1.0.0 → v1.2.0'), '導入版→最新版の表記が含まれるべき');

  // 空配列では何も出力しない
  const empty = [];
  printUpdateNotice([], (msg = '') => empty.push(msg));
  assert.equal(empty.length, 0, '更新が無ければ何も出力しないべき');
});
