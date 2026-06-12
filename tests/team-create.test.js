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

test('_custom/workflow.yml が旧スキーマのキーを使っていない', () => {
  const workflowPath = join(packageRoot, 'templates', 'teams', '_custom', 'workflow.yml');
  const content = readFileSync(workflowPath, 'utf-8');

  // AND待機は requires_all_of が正（旧キー requires: は禁止）
  assert.ok(!/^\s*requires:/m.test(content), '旧キー requires: が使われていないこと（requires_all_of が正）');
  // on_rework の判定キーは condition が正（旧キー trigger: は禁止）
  assert.ok(!/^\s*trigger:/m.test(content), '旧キー trigger: が使われていないこと（condition が正）');
});

test('/ai-team create の生成器（workflow-yaml.js）が新スキーマで生成する', async () => {
  const { buildWorkflowYaml } = await import('../bin/lib/workflow-yaml.js');

  const yaml = buildWorkflowYaml({
    name: 'custom-team-workflow',
    description: 'カスタムチーム生成テスト',
    prefix: 'custom',
    steps: [
      {
        id: 'reviewer',
        agent: 'reviewer',
        label: 'custom:reviewer',
        on_complete: { next: 'cross-review' },
        on_rework: { condition: '不合格', next: 'implementer' },
      },
      {
        id: 'cross-review',
        agent: 'reviewer-a',
        label: 'custom:reviewer-a',
        requires_all_of: ['reviewer-a', 'reviewer-b'],
        on_complete: { next: 'contributor-close' },
      },
    ],
  });

  // rework_limit がトップレベルに生成される
  assert.ok(yaml.includes('rework_limit: 2'), 'rework_limit: 2 が生成されること');
  // on_rework を持つステップに limit_exceeded_next が生成される
  assert.ok(yaml.includes('      limit_exceeded_next: human-escalator'), 'limit_exceeded_next: human-escalator が生成されること');
  // AND待機は requires_all_of で生成される
  assert.ok(yaml.includes('    requires_all_of: [reviewer-a, reviewer-b]'), 'requires_all_of が生成されること');
  assert.ok(!/^\s*requires:/m.test(yaml), '旧キー requires: が生成されないこと');
  // on_rework は condition キーで生成される
  assert.ok(yaml.includes('      condition: "不合格"'), 'on_rework.condition が生成されること');
  assert.ok(!/^\s*trigger:/m.test(yaml), '旧キー trigger: が生成されないこと');
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
