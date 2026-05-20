import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateConfigTargetLabels } from '../bin/lib/plugin-install.js';

function createTmpProject(configContent) {
  const dir = mkdtempSync(join(tmpdir(), 'ai-team-test-'));
  mkdirSync(join(dir, '.claude'), { recursive: true });
  if (configContent !== null) {
    writeFileSync(join(dir, '.claude', 'ai-team-config.yml'), configContent, 'utf-8');
  }
  return dir;
}

const soloConfig = `# @trimix/ai-team 運用設定
mode: solo

solo:
  poll_interval_minutes: 5
  target_labels:
    - dispatcher
    - backend:tech-lead
  skip_labels:
    - ai-team:in-progress
    - escalated:human
`;

test('updateConfigTargetLabels: 新しいラベルを target_labels に追加できる', () => {
  const dir = createTmpProject(soloConfig);
  const added = updateConfigTargetLabels(dir, ['frontend:frontend-lead']);

  assert.deepEqual(added, ['frontend:frontend-lead']);
  const content = readFileSync(join(dir, '.claude', 'ai-team-config.yml'), 'utf-8');
  assert.ok(content.includes('    - frontend:frontend-lead'), 'ラベルが追加されていること');
});

test('updateConfigTargetLabels: 既存ラベルは重複追加されない', () => {
  const dir = createTmpProject(soloConfig);
  const added = updateConfigTargetLabels(dir, ['backend:tech-lead']);

  assert.deepEqual(added, [], '既存ラベルは added に含まれない');
  const content = readFileSync(join(dir, '.claude', 'ai-team-config.yml'), 'utf-8');
  const count = (content.match(/    - backend:tech-lead/g) ?? []).length;
  assert.equal(count, 1, 'backend:tech-lead は1件のみであること');
});

test('updateConfigTargetLabels: ai-team-config.yml が存在しない場合は null を返す', () => {
  const dir = createTmpProject(null);
  const result = updateConfigTargetLabels(dir, ['frontend:frontend-lead']);
  assert.equal(result, null);
});

test('updateConfigTargetLabels: target_labels セクションがない場合は null を返す', () => {
  const dir = createTmpProject('mode: multi-user\n');
  const result = updateConfigTargetLabels(dir, ['frontend:frontend-lead']);
  assert.equal(result, null);
});

test('updateConfigTargetLabels: skip_labels より前にラベルが挿入される', () => {
  const dir = createTmpProject(soloConfig);
  updateConfigTargetLabels(dir, ['content:editor-in-chief']);

  const content = readFileSync(join(dir, '.claude', 'ai-team-config.yml'), 'utf-8');
  const targetIdx = content.indexOf('  target_labels:');
  const skipIdx = content.indexOf('  skip_labels:');
  const contentIdx = content.indexOf('    - content:editor-in-chief');

  assert.ok(targetIdx < contentIdx, 'target_labels の後にラベルが挿入されていること');
  assert.ok(contentIdx < skipIdx, 'skip_labels の前にラベルが挿入されていること');
});
