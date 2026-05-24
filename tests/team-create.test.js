import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

test('_customテンプレートディレクトリが存在する', () => {
  const customDir = join(packageRoot, 'templates', 'teams', '_custom');
  assert.ok(existsSync(customDir), 'templates/teams/_custom/ が存在しない');
});

test('_agent-template.md が存在し必須プレースホルダーを含む', () => {
  const templatePath = join(packageRoot, 'templates', 'teams', '_custom', 'agents', '_agent-template.md');
  assert.ok(existsSync(templatePath), '_agent-template.md が存在しない');

  const content = readFileSync(templatePath, 'utf-8');
  const requiredPlaceholders = ['{{agent_id}}', '{{agent_name}}', '{{team_id}}', '{{team_name}}'];
  for (const ph of requiredPlaceholders) {
    assert.ok(content.includes(ph), `プレースホルダー ${ph} が含まれていない`);
  }
});

test('_custom/workflow.yml が存在し必須プレースホルダーを含む', () => {
  const workflowPath = join(packageRoot, 'templates', 'teams', '_custom', 'workflow.yml');
  assert.ok(existsSync(workflowPath), '_custom/workflow.yml が存在しない');

  const content = readFileSync(workflowPath, 'utf-8');
  assert.ok(content.includes('{{team_id}}'), '{{team_id}} が含まれていない');
  assert.ok(content.includes('{{team_name}}'), '{{team_name}} が含まれていない');
  assert.ok(content.includes('contributor-close'), 'contributor-close ステップが含まれていない');
  assert.ok(content.includes('human-escalator'), 'human-escalator ステップが含まれていない');
});

test('_custom/review-config.yml が存在する', () => {
  const configPath = join(packageRoot, 'templates', 'teams', '_custom', 'review-config.yml');
  assert.ok(existsSync(configPath), '_custom/review-config.yml が存在しない');

  const content = readFileSync(configPath, 'utf-8');
  assert.ok(content.includes('double_review_criteria'), 'double_review_criteria が含まれていない');
  assert.ok(content.includes('single_review_criteria'), 'single_review_criteria が含まれていない');
});

test('_custom/dod/feature.md が存在する', () => {
  const dodPath = join(packageRoot, 'templates', 'teams', '_custom', 'dod', 'feature.md');
  assert.ok(existsSync(dodPath), '_custom/dod/feature.md が存在しない');
});

test('skills/ai-team-create.md が存在し必須セクションを含む', () => {
  const skillPath = join(packageRoot, 'skills', 'ai-team-create.md');
  assert.ok(existsSync(skillPath), 'skills/ai-team-create.md が存在しない');

  const content = readFileSync(skillPath, 'utf-8');
  assert.ok(content.includes('重複チェック'), '重複チェックのセクションが含まれていない');
  assert.ok(content.includes('ステップ3: ファイル生成'), 'ファイル生成ステップが含まれていない');
  assert.ok(content.includes('ai-team-config.yml'), 'ai-team-config.yml の更新手順が含まれていない');
});

test('bin/setup.js の skillFiles に ai-team-create.md が含まれている', () => {
  const setupPath = join(packageRoot, 'bin', 'setup.js');
  const content = readFileSync(setupPath, 'utf-8');
  assert.ok(content.includes("'ai-team-create.md'"), 'ai-team-create.md が installSkills に追加されていない');
});
