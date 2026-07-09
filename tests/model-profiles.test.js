/**
 * モデル・effort プロファイルの単体テスト
 *
 * - プロファイル解決（model / effort）
 * - frontmatter upsert
 * - テンプレート既定（balance + normal）の整合
 * - setup スキルに質問5・6と apply 手順が含まれること
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PERFORMANCE_PROFILES,
  EFFORT_PROFILES,
  DEFAULT_PERFORMANCE_PROFILE,
  DEFAULT_EFFORT_PROFILE,
  AGENT_ROLES,
  SKILL_ROLES,
  resolveRole,
  resolveModel,
  resolveEffort,
  upsertModelEffortFrontmatter,
  extractFrontmatterName,
  ALLOWED_MODEL_ALIASES,
  ALLOWED_EFFORT_LEVELS,
} from '../bin/lib/model-profiles.js';
import { collectAgentFiles, collectSkillFiles, applyToFile } from '../bin/lib/apply-model-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

function listAgentMd(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => join(dir, f));
}

test('デフォルトプロファイルは balance / normal', () => {
  assert.equal(DEFAULT_PERFORMANCE_PROFILE, 'balance');
  assert.equal(DEFAULT_EFFORT_PROFILE, 'normal');
});

test('性能プロファイルのモデル割当が仕様どおり', () => {
  assert.deepEqual(PERFORMANCE_PROFILES['high-performance'].models, {
    leader: 'fable',
    worker: 'opus',
    simple: 'sonnet',
  });
  assert.deepEqual(PERFORMANCE_PROFILES.balance.models, {
    leader: 'opus',
    worker: 'sonnet',
    simple: 'haiku',
  });
  assert.deepEqual(PERFORMANCE_PROFILES['low-cost'].models, {
    leader: 'sonnet',
    worker: 'sonnet',
    simple: 'haiku',
  });
});

test('effort プロファイルの値が仕様どおり', () => {
  assert.equal(EFFORT_PROFILES.deep.effort, 'xhigh');
  assert.equal(EFFORT_PROFILES.normal.effort, 'high');
  assert.equal(EFFORT_PROFILES.light.effort, 'medium');
});

test('resolveModel / resolveEffort が role ごとに正しい値を返す', () => {
  assert.equal(resolveModel('balance', 'leader'), 'opus');
  assert.equal(resolveModel('balance', 'worker'), 'sonnet');
  assert.equal(resolveModel('balance', 'simple'), 'haiku');
  assert.equal(resolveModel('high-performance', 'leader'), 'fable');
  assert.equal(resolveEffort('deep'), 'xhigh');
  assert.equal(resolveEffort('light'), 'medium');
});

test('resolveRole: leader / worker / simple の代表例', () => {
  assert.equal(resolveRole('tech-lead', 'agent'), 'leader');
  assert.equal(resolveRole('dispatcher', 'agent'), 'leader');
  assert.equal(resolveRole('implementer', 'agent'), 'worker');
  assert.equal(resolveRole('pr-creator', 'agent'), 'simple');
  assert.equal(resolveRole('version-bumper', 'agent'), 'simple');
  assert.equal(resolveRole('ai-team-run', 'skill'), 'leader');
  assert.equal(resolveRole('ai-team-gallery', 'skill'), 'simple');
  // 未登録は worker
  assert.equal(resolveRole('unknown-agent', 'agent'), 'worker');
});

test('全 AGENT_ROLES / SKILL_ROLES の model が許可エイリアスに解決できる', () => {
  for (const profileId of Object.keys(PERFORMANCE_PROFILES)) {
    for (const [name, role] of Object.entries(AGENT_ROLES)) {
      const model = resolveModel(profileId, role);
      assert.ok(
        ALLOWED_MODEL_ALIASES.has(model),
        `${name} (${role}) @ ${profileId} → ${model}`
      );
    }
    for (const [name, role] of Object.entries(SKILL_ROLES)) {
      const model = resolveModel(profileId, role);
      assert.ok(
        ALLOWED_MODEL_ALIASES.has(model),
        `skill ${name} (${role}) @ ${profileId} → ${model}`
      );
    }
  }
  for (const effortId of Object.keys(EFFORT_PROFILES)) {
    assert.ok(ALLOWED_EFFORT_LEVELS.has(resolveEffort(effortId)));
  }
});

test('upsertModelEffortFrontmatter が model / effort / model_role を挿入・更新する', () => {
  const src = `---
name: demo
description: テスト用
---

# body
`;
  const { content, changed } = upsertModelEffortFrontmatter(src, {
    model: 'opus',
    effort: 'high',
    modelRole: 'leader',
  });
  assert.equal(changed, true);
  assert.match(content, /^---\n/);
  assert.match(content, /^model: opus$/m);
  assert.match(content, /^effort: high$/m);
  assert.match(content, /^model_role: leader$/m);
  assert.equal(extractFrontmatterName(content), 'demo');

  const again = upsertModelEffortFrontmatter(content, {
    model: 'sonnet',
    effort: 'medium',
    modelRole: 'worker',
  });
  assert.equal(again.changed, true);
  assert.match(again.content, /^model: sonnet$/m);
  assert.match(again.content, /^effort: medium$/m);
  assert.match(again.content, /^model_role: worker$/m);
  // name / description が消えていない
  assert.match(again.content, /^name: demo$/m);
  assert.match(again.content, /^description: テスト用$/m);
});

test('templates の全エージェント md が balance/normal の model・effort を持つ', () => {
  const files = collectAgentFiles(join(packageRoot, 'templates'));
  assert.ok(files.length >= 40, `エージェント数が少ない: ${files.length}`);

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const name = extractFrontmatterName(text);
    assert.ok(name, `name なし: ${file}`);

    const modelMatch = text.match(/^model:\s*(\S+)/m);
    const effortMatch = text.match(/^effort:\s*(\S+)/m);
    const roleMatch = text.match(/^model_role:\s*(\S+)/m);
    assert.ok(modelMatch, `model なし: ${file}`);
    assert.ok(effortMatch, `effort なし: ${file}`);
    assert.ok(roleMatch, `model_role なし: ${file}`);

    const expectedRole =
      name === '_agent-template' || name.includes('{{')
        ? 'worker'
        : resolveRole(name, 'agent');
    const expectedModel = resolveModel('balance', expectedRole);
    const expectedEffort = resolveEffort('normal');

    assert.equal(modelMatch[1], expectedModel, `${file} model`);
    assert.equal(effortMatch[1], expectedEffort, `${file} effort`);
    assert.equal(roleMatch[1], expectedRole, `${file} model_role`);
  }
});

test('skills の全 ai-team-*.md が balance/normal の model・effort を持つ', () => {
  const files = collectSkillFiles(join(packageRoot, 'skills'));
  assert.equal(files.length, 8, `スキル数: ${files.length}`);

  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    const name = extractFrontmatterName(text);
    assert.ok(name, `name なし: ${file}`);
    const role = resolveRole(name, 'skill');
    const modelMatch = text.match(/^model:\s*(\S+)/m);
    const effortMatch = text.match(/^effort:\s*(\S+)/m);
    assert.equal(modelMatch?.[1], resolveModel('balance', role), file);
    assert.equal(effortMatch?.[1], resolveEffort('normal'), file);
  }
});

test('applyToFile の dry 実行で high-performance/deep が解決される', () => {
  const sample = join(packageRoot, 'templates/teams/backend/agents/tech-lead.md');
  const result = applyToFile(sample, {
    performanceId: 'high-performance',
    effortId: 'deep',
    kind: 'agent',
    dry: true,
  });
  assert.equal(result.name, 'tech-lead');
  assert.equal(result.role, 'leader');
  assert.equal(result.model, 'fable');
  assert.equal(result.effort, 'xhigh');
  assert.equal(result.changed, true);
});

test('model-profiles.yml が templates に存在する', () => {
  const p = join(packageRoot, 'templates/_shared/model-profiles.yml');
  assert.ok(existsSync(p));
  const text = readFileSync(p, 'utf-8');
  assert.match(text, /high-performance/);
  assert.match(text, /balance/);
  assert.match(text, /low-cost/);
  assert.match(text, /細かい設定は各 md ファイル/);
});

test('ai-team-setup にモデル/effort 質問と apply 手順が含まれる', () => {
  const setup = readFileSync(join(packageRoot, 'skills/ai-team-setup.md'), 'utf-8');
  assert.match(setup, /質問5/);
  assert.match(setup, /質問6/);
  assert.match(setup, /model_performance/);
  assert.match(setup, /effort_depth/);
  assert.match(setup, /apply-model-profile\.js/);
  assert.match(setup, /ハイパフォーマンス/);
  assert.match(setup, /低コスト/);
  assert.match(setup, /細かい設定は md ファイル/);
  assert.match(setup, /model-profiles\.yml/);
});

test('packages ミラーのエージェントも model/effort を持つ（backend）', () => {
  const files = listAgentMd(join(packageRoot, 'packages/workflow-backend/templates/agents'));
  assert.ok(files.length >= 5);
  for (const file of files) {
    const text = readFileSync(file, 'utf-8');
    assert.match(text, /^model:\s+\S+/m, file);
    assert.match(text, /^effort:\s+\S+/m, file);
  }
});
