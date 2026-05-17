import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildWorkflowYaml } from '../bin/lib/workflow-yaml.js';

// ケース1: シンプルな直列フロー
test('シンプルな直列フロー: on_complete.next が正しく出力される', () => {
  const config = {
    name: 'simple-workflow',
    description: '',
    prefix: 'backend',
    steps: [
      {
        id: 'step-a',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        description: '',
        on_complete: { next: 'step-b' },
      },
      {
        id: 'step-b',
        agent: 'implementer',
        label: 'backend:implementer',
        on_complete: { next: 'contributor-close' },
      },
      {
        id: 'contributor-close',
        agent: 'contributor',
        label: 'backend:contributor',
        on_complete: { action: 'close_issue' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // on_complete.next が正しく出力される
  assert.ok(yaml.includes('      next: step-b'), 'step-a の next が step-b であること');
  assert.ok(yaml.includes('      next: contributor-close'), 'step-b の next が contributor-close であること');

  // 終端ステップに action: close_issue が出力される
  assert.ok(yaml.includes('      action: close_issue'), '終端ステップに close_issue が出力されること');

  // description が空の場合は省略される
  assert.ok(!yaml.includes('description: \n') && !yaml.includes('description:\n'), 'description が省略されること');
});

// ケース1補足: description が空文字列の場合は省略される
test('シンプルな直列フロー: description が空の場合は省略される', () => {
  const config = {
    name: 'simple-workflow',
    description: '',
    prefix: 'backend',
    steps: [
      {
        id: 'step-a',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        description: '',
        on_complete: { next: 'step-b' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // ステップ内の description が省略されていること（空文字列）
  const stepSection = yaml.split('steps:')[1];
  assert.ok(!stepSection.includes('description:'), 'ステップのdescriptionが省略されること');
  // ヘッダーのdescriptionも省略されていること
  const headerSection = yaml.split('steps:')[0];
  assert.ok(!headerSection.includes('\ndescription:'), 'ヘッダーのdescriptionが省略されること');
});

// ケース2: 条件分岐（単一next）
test('条件分岐（単一next）: conditions が正しく出力される', () => {
  const config = {
    name: 'branch-workflow',
    description: '分岐テスト',
    prefix: 'backend',
    steps: [
      {
        id: 'decision',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        conditions: [
          {
            id: 'single-review',
            description: '通常の変更',
            criteria: ['変更ファイル数が5未満'],
            next: 'reviewer',
          },
          {
            id: 'double-review',
            description: '重要な変更',
            criteria: ['変更ファイル数が5以上', '認証関連の変更'],
            next: 'reviewer',
          },
        ],
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // conditions が正しく出力される
  assert.ok(yaml.includes('    conditions:'), 'conditions ブロックが出力されること');
  assert.ok(yaml.includes('      - id: single-review'), 'single-review条件が出力されること');
  assert.ok(yaml.includes('      - id: double-review'), 'double-review条件が出力されること');

  // on_complete が出力されないこと（排他）
  assert.ok(!yaml.includes('    on_complete:'), 'conditions がある場合 on_complete が出力されないこと');

  // criteria が複数行リストで出力される
  assert.ok(yaml.includes('          - 変更ファイル数が5以上'), 'criteria の1つ目が出力されること');
  assert.ok(yaml.includes('          - 認証関連の変更'), 'criteria の2つ目が出力されること');
});

// ケース3: 条件分岐（並列next）
test('条件分岐（並列next）: next が配列形式で出力される', () => {
  const config = {
    name: 'parallel-branch-workflow',
    description: '並列分岐テスト',
    prefix: 'backend',
    steps: [
      {
        id: 'decision',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        conditions: [
          {
            id: 'double-review',
            description: '重要な変更',
            criteria: ['変更ファイル数が5以上'],
            next: ['reviewer-a', 'reviewer-b'],
          },
        ],
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // next が配列形式 [reviewer-a, reviewer-b] で出力される
  assert.ok(yaml.includes('        next: [reviewer-a, reviewer-b]'), '並列nextが配列形式で出力されること');
});

// ケース4: on_rework
test('on_rework: trigger と next が正しく出力される', () => {
  const config = {
    name: 'rework-workflow',
    description: 'on_reworkテスト',
    prefix: 'backend',
    steps: [
      {
        id: 'reviewer',
        agent: 'reviewer',
        label: 'backend:reviewer',
        on_complete: { next: 'pr-creator' },
        on_rework: { trigger: '差し戻し', next: 'implementer' },
      },
      {
        id: 'implementer',
        agent: 'implementer',
        label: 'backend:implementer',
        on_complete: { next: 'reviewer' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // trigger と next が正しく出力される
  assert.ok(yaml.includes('    on_rework:'), 'on_rework ブロックが出力されること');
  assert.ok(yaml.includes('      trigger: "差し戻し"'), 'on_rework の trigger が出力されること');
  assert.ok(yaml.includes('      next: implementer'), 'on_rework の next が出力されること');

  // on_rework がない場合はフィールドが省略される
  const implementerSection = yaml.split('  - id: implementer')[1];
  assert.ok(!implementerSection.includes('on_rework:'), 'on_rework がない場合は省略されること');
});

// ケース5: on_escalation
test('on_escalation: next が正しく出力される', () => {
  const config = {
    name: 'escalation-workflow',
    description: 'エスカレーションテスト',
    prefix: 'backend',
    steps: [
      {
        id: 'reviewer',
        agent: 'reviewer',
        label: 'backend:reviewer',
        on_complete: { next: 'pr-creator' },
        on_escalation: { next: 'human-escalator' },
      },
      {
        id: 'pr-creator',
        agent: 'pr-creator',
        label: 'backend:pr-creator',
        on_complete: { next: 'contributor-close' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // next が正しく出力される
  assert.ok(yaml.includes('    on_escalation:'), 'on_escalation ブロックが出力されること');
  assert.ok(yaml.includes('      next: human-escalator'), 'on_escalation の next が出力されること');

  // on_escalation がない場合はフィールドが省略される
  const prCreatorSection = yaml.split('  - id: pr-creator')[1];
  assert.ok(!prCreatorSection.includes('on_escalation:'), 'on_escalation がない場合は省略されること');
});

// ケース6: parallel_with
test('parallel_with: フィールドが正しく出力される', () => {
  const config = {
    name: 'parallel-workflow',
    description: '並列実行テスト',
    prefix: 'backend',
    steps: [
      {
        id: 'reviewer-a',
        agent: 'reviewer-a',
        label: 'backend:reviewer-a',
        parallel_with: 'reviewer-b',
        on_complete: { next: 'cross-review' },
      },
      {
        id: 'reviewer-b',
        agent: 'reviewer-b',
        label: 'backend:reviewer-b',
        on_complete: { next: 'cross-review' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // parallel_with フィールドが正しく出力される
  assert.ok(yaml.includes('    parallel_with: reviewer-b'), 'parallel_with が正しく出力されること');

  // parallel_with がない場合は省略される
  const reviewerBSection = yaml.split('  - id: reviewer-b')[1];
  assert.ok(!reviewerBSection.includes('parallel_with:'), 'parallel_with がない場合は省略されること');
});

// ケース7: requires（単一・複数）
test('requires（単一）: 配列形式で出力される', () => {
  const config = {
    name: 'requires-workflow',
    description: '完了待ちテスト',
    prefix: 'backend',
    steps: [
      {
        id: 'cross-review',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        requires: ['reviewer-a'],
        on_complete: { next: 'pr-creator' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // requires が配列形式で出力される（1件でも [step-a]）
  assert.ok(yaml.includes('    requires: [reviewer-a]'), '単一requires が配列形式で出力されること');
});

test('requires（複数）: 配列形式で出力される', () => {
  const config = {
    name: 'requires-workflow',
    description: '完了待ちテスト',
    prefix: 'backend',
    steps: [
      {
        id: 'cross-review',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        requires: ['reviewer-a', 'reviewer-b'],
        on_complete: { next: 'pr-creator' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // requires が複数の場合も配列形式で出力される
  assert.ok(yaml.includes('    requires: [reviewer-a, reviewer-b]'), '複数requires が配列形式で出力されること');
});

test('requires なし: フィールドが省略される', () => {
  const config = {
    name: 'no-requires-workflow',
    description: 'requires省略テスト',
    prefix: 'backend',
    steps: [
      {
        id: 'step-a',
        agent: 'tech-lead',
        label: 'backend:tech-lead',
        on_complete: { next: 'step-b' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // requires がない場合は省略される
  assert.ok(!yaml.includes('    requires:'), 'requires がない場合は省略されること');
});

// ケース8: 組み合わせ（実際のcontentワークフローに近い構成）
test('組み合わせ: contentワークフローに近い構成が正しく出力される', () => {
  const config = {
    name: 'content-workflow',
    description: 'コンテンツ制作ワークフロー',
    prefix: 'content',
    steps: [
      {
        id: 'editor-in-chief',
        agent: 'editor-in-chief',
        label: 'content:editor-in-chief',
        description: '方針決定とResearcher要否の判断',
        conditions: [
          {
            id: 'needs-research',
            description: 'リサーチが必要な場合',
            criteria: ['専門的な調査が必要', '最新情報の確認が必要'],
            next: 'researcher',
          },
          {
            id: 'no-research',
            description: 'リサーチ不要の場合',
            criteria: ['既知の情報のみ'],
            next: 'writer',
          },
        ],
        on_escalation: { next: 'human-escalator' },
      },
      {
        id: 'researcher',
        agent: 'researcher',
        label: 'content:researcher',
        description: '調査・情報収集',
        on_complete: { next: 'writer' },
      },
      {
        id: 'writer',
        agent: 'writer',
        label: 'content:writer',
        description: '記事執筆',
        on_complete: { next: 'compliance' },
        on_rework: { trigger: '差し戻し', next: 'writer' },
        on_escalation: { next: 'human-escalator' },
      },
      {
        id: 'compliance',
        agent: 'compliance',
        label: 'content:compliance',
        description: 'コンプライアンスチェック',
        on_complete: { next: 'contributor-close' },
        on_rework: { trigger: '差し戻し', next: 'writer' },
        on_escalation: { next: 'human-escalator' },
      },
      {
        id: 'contributor-close',
        agent: 'contributor',
        label: 'contributor:ready',
        on_complete: { action: 'close_issue' },
      },
    ],
  };

  const yaml = buildWorkflowYaml(config);

  // ヘッダーの確認
  assert.ok(yaml.includes('name: content-workflow'), 'ワークフロー名が出力されること');
  assert.ok(yaml.includes('description: コンテンツ制作ワークフロー'), 'descriptionが出力されること');
  assert.ok(yaml.includes('  prefix: "content"'), 'prefixが出力されること');

  // editor-in-chief: 条件分岐 + on_escalation
  assert.ok(yaml.includes('  - id: editor-in-chief'), 'editor-in-chief ステップが出力されること');
  assert.ok(yaml.includes('      - id: needs-research'), 'needs-research条件が出力されること');
  assert.ok(yaml.includes('      - id: no-research'), 'no-research条件が出力されること');
  assert.ok(yaml.includes('        next: researcher'), 'needs-researchのnextが出力されること');
  assert.ok(yaml.includes('        next: writer'), 'no-researchのnextが出力されること');

  // editor-in-chief に on_complete が出力されないこと（conditions と排他）
  const editorSection = yaml.split('  - id: editor-in-chief')[1].split('  - id: researcher')[0];
  assert.ok(!editorSection.includes('on_complete:'), 'conditionsがある場合 on_complete が出力されないこと');

  // on_escalation が editor-in-chief に出力されること
  assert.ok(editorSection.includes('    on_escalation:'), 'editor-in-chief の on_escalation が出力されること');

  // researcher: on_complete.next
  assert.ok(yaml.includes('  - id: researcher'), 'researcher ステップが出力されること');
  const researcherSection = yaml.split('  - id: researcher')[1].split('  - id: writer')[0];
  assert.ok(researcherSection.includes('      next: writer'), 'researcher の next が writer であること');

  // writer: on_complete.next + on_rework + on_escalation
  assert.ok(yaml.includes('  - id: writer'), 'writer ステップが出力されること');
  const writerSection = yaml.split('  - id: writer')[1].split('  - id: compliance')[0];
  assert.ok(writerSection.includes('      next: compliance'), 'writer の next が compliance であること');
  assert.ok(writerSection.includes('    on_rework:'), 'writer の on_rework が出力されること');
  assert.ok(writerSection.includes('      trigger: "差し戻し"'), 'writer の on_rework.trigger が出力されること');
  assert.ok(writerSection.includes('    on_escalation:'), 'writer の on_escalation が出力されること');

  // compliance: on_complete.next + on_rework + on_escalation
  assert.ok(yaml.includes('  - id: compliance'), 'compliance ステップが出力されること');
  const complianceSection = yaml.split('  - id: compliance')[1].split('  - id: contributor-close')[0];
  assert.ok(complianceSection.includes('      next: contributor-close'), 'compliance の next が contributor-close であること');
  assert.ok(complianceSection.includes('    on_rework:'), 'compliance の on_rework が出力されること');
  assert.ok(complianceSection.includes('    on_escalation:'), 'compliance の on_escalation が出力されること');

  // contributor-close: close_issue
  assert.ok(yaml.includes('  - id: contributor-close'), 'contributor-close ステップが出力されること');
  assert.ok(yaml.includes('      action: close_issue'), 'contributor-close の close_issue が出力されること');
});
