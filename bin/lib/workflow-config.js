/**
 * configure コマンド実装 - ワークフロー定義対話式ウィザード
 */

import readline from 'readline';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * readline の q&a ヘルパー
 * パイプ入力でも複数問を正しく処理できるよう lineイベントのキュー方式を使用する
 */
function createAsker(rl) {
  const lineQueue = [];
  const waiters = [];

  rl.on('line', (line) => {
    if (waiters.length > 0) {
      const resolve = waiters.shift();
      resolve(line);
    } else {
      lineQueue.push(line);
    }
  });

  return (q) => {
    process.stdout.write(q);
    return new Promise(resolve => {
      if (lineQueue.length > 0) {
        resolve(lineQueue.shift());
      } else {
        waiters.push(resolve);
      }
    });
  };
}

/** エージェント一覧を取得する */
function getAvailableAgents(teamDir) {
  const agentsDir = join(teamDir, 'agents');
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

/** ステップID一覧を番号付きで表示 */
function showStepList(steps, label = 'ステップID一覧') {
  console.log(`  ${label}:`);
  steps.forEach((s, i) => {
    console.log(`    [${i + 1}] ${s.id} (agent: ${s.agent})`);
  });
  console.log(`    [0] close_issue（Issueをクローズ）`);
}

/** ステップの次ステップを番号で選択させる（複数可） */
async function selectNextSteps(ask, steps, prompt, allowMultiple = false) {
  showStepList(steps);
  while (true) {
    const input = (await ask(`  ${prompt}: `)).trim();
    if (!input) continue;

    if (allowMultiple) {
      // スペース区切りで複数選択
      const tokens = input.split(/\s+/);
      const result = [];
      let valid = true;
      for (const t of tokens) {
        const n = parseInt(t, 10);
        if (n === 0) {
          result.push('close_issue');
        } else if (n >= 1 && n <= steps.length) {
          result.push(steps[n - 1].id);
        } else {
          console.log(`  ⚠️  無効な番号: ${t}`);
          valid = false;
          break;
        }
      }
      if (valid && result.length > 0) return result;
    } else {
      const n = parseInt(input, 10);
      if (n === 0) return 'close_issue';
      if (n >= 1 && n <= steps.length) return steps[n - 1].id;
      console.log('  ⚠️  無効な番号です。もう一度入力してください。');
    }
  }
}

/** 条件分岐を対話で設定する */
async function buildConditions(ask, steps) {
  const conditions = [];
  console.log('  条件を追加してください（enterで終了）');
  while (true) {
    const id = (await ask('  条件ID（例: single-review）: ')).trim();
    if (!id) {
      if (conditions.length === 0) {
        console.log('  ⚠️  少なくとも1つの条件を入力してください');
        continue;
      }
      break;
    }

    const description = (await ask('  条件の説明: ')).trim();

    // 判定基準を複数行入力
    console.log('  判定基準を入力してください（空行で終了）:');
    const criteria = [];
    while (true) {
      const line = (await ask('    基準> ')).trim();
      if (!line) break;
      criteria.push(line);
    }
    if (criteria.length === 0) criteria.push('（基準未設定）');

    // next の選択（並列可）
    console.log('  この条件の次ステップを選択してください:');
    console.log('    （複数の場合はスペース区切りで番号を入力）');
    const next = await selectNextSteps(ask, steps, '次ステップ番号', true);

    conditions.push({ id, description, criteria, next });
    console.log(`  ✅ 条件 "${id}" を追加しました`);
    console.log('');
  }
  return conditions;
}

/** YAML 文字列を手動生成する */
function buildYaml(config) {
  const lines = [];

  lines.push(`name: ${config.name}`);
  lines.push(`description: ${config.description}`);
  lines.push('');
  lines.push('labels:');
  lines.push(`  prefix: "${config.prefix}"`);
  lines.push('');
  lines.push('steps:');

  for (const step of config.steps) {
    lines.push('');
    lines.push(`  - id: ${step.id}`);
    lines.push(`    agent: ${step.agent}`);
    lines.push(`    label: "${step.label}"`);
    if (step.description) {
      // 改行を含む場合はブロックスカラー
      if (step.description.includes('\n')) {
        lines.push(`    description: |`);
        for (const descLine of step.description.split('\n')) {
          lines.push(`      ${descLine}`);
        }
      } else {
        lines.push(`    description: ${step.description}`);
      }
    }

    // parallel_with
    if (step.parallel_with) {
      lines.push(`    parallel_with: ${step.parallel_with}`);
    }

    // requires
    if (step.requires && step.requires.length > 0) {
      lines.push(`    requires: [${step.requires.join(', ')}]`);
    }

    // on_complete / conditions
    if (step.conditions && step.conditions.length > 0) {
      lines.push('    conditions:');
      for (const cond of step.conditions) {
        lines.push(`      - id: ${cond.id}`);
        lines.push(`        description: ${cond.description}`);
        lines.push('        criteria:');
        for (const c of cond.criteria) {
          lines.push(`          - ${c}`);
        }
        if (Array.isArray(cond.next)) {
          if (cond.next.length === 1) {
            lines.push(`        next: ${cond.next[0]}`);
          } else {
            lines.push(`        next: [${cond.next.join(', ')}]`);
          }
        } else {
          lines.push(`        next: ${cond.next}`);
        }
      }
    } else if (step.on_complete) {
      const oc = step.on_complete;
      if (oc.action === 'close_issue') {
        lines.push('    on_complete:');
        lines.push('      action: close_issue');
      } else if (oc.next) {
        lines.push('    on_complete:');
        lines.push(`      next: ${oc.next}`);
      }
    }

    // on_rework
    if (step.on_rework) {
      lines.push('    on_rework:');
      lines.push(`      trigger: "${step.on_rework.trigger}"`);
      lines.push(`      next: ${step.on_rework.next}`);
    }

    // on_escalation
    if (step.on_escalation) {
      lines.push('    on_escalation:');
      lines.push(`      next: ${step.on_escalation.next}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/** ウィザードのメイン処理 */
export async function configureWorkflow(teamId, { cwd }) {
  // team_id チェック
  if (!teamId) {
    console.error('❌ エラー: team_id を指定してください');
    console.error('使い方: node bin/setup.js configure <team_id>');
    process.exit(1);
  }

  const teamDir = join(cwd, '.claude', 'teams', teamId);
  if (!existsSync(teamDir)) {
    console.error(`❌ エラー: .claude/teams/${teamId}/ が存在しません`);
    console.error(`先に /ai-team setup でチームをセットアップするか、ディレクトリを作成してください`);
    process.exit(1);
  }

  const availableAgents = getAvailableAgents(teamDir);

  const rl = readline.createInterface({ input: process.stdin, output: null });
  const ask = createAsker(rl);

  console.log('');
  console.log(`🧙 ワークフロー設定ウィザード (チーム: ${teamId})`);
  console.log('─'.repeat(50));

  try {
    // ─── 基本情報 ───
    console.log('\n【基本情報】');

    const defaultName = `${teamId}-workflow`;
    const nameInput = (await ask(`ワークフロー名 [${defaultName}]: `)).trim();
    const name = nameInput || defaultName;

    const description = (await ask('ワークフローの説明: ')).trim() || `${teamId}チームのワークフロー`;

    const defaultPrefix = teamId;
    const prefixInput = (await ask(`ラベルのプレフィックス [${defaultPrefix}]: `)).trim();
    const prefix = prefixInput || defaultPrefix;

    // ─── パス1: ステップ一覧の収集 ───
    console.log('\n【パス1: ステップ一覧の収集】');
    if (availableAgents.length > 0) {
      console.log('  利用可能なエージェント:');
      availableAgents.forEach((a, i) => console.log(`    [${i + 1}] ${a}`));
    } else {
      console.log('  ⚠️  agents/ ディレクトリにエージェントが見つかりません');
    }
    console.log('  ステップIDとエージェントを入力してください（空のIDで完了）');
    console.log('');

    const steps = [];
    while (true) {
      const stepId = (await ask(`  ステップID [${steps.length + 1}番目] (空白で完了): `)).trim();
      if (!stepId) {
        if (steps.length === 0) {
          console.log('  ⚠️  少なくとも1つのステップを追加してください');
          continue;
        }
        break;
      }

      // 重複チェック
      if (steps.some(s => s.id === stepId)) {
        console.log(`  ⚠️  ステップID "${stepId}" は既に使われています`);
        continue;
      }

      let agent;
      if (availableAgents.length > 0) {
        console.log('  エージェントを番号または名前で入力してください:');
        availableAgents.forEach((a, i) => console.log(`    [${i + 1}] ${a}`));
        while (true) {
          const agentInput = (await ask('  エージェント: ')).trim();
          if (!agentInput) continue;
          const n = parseInt(agentInput, 10);
          if (!isNaN(n) && n >= 1 && n <= availableAgents.length) {
            agent = availableAgents[n - 1];
          } else {
            agent = agentInput;
          }
          break;
        }
      } else {
        agent = (await ask('  エージェント名: ')).trim() || 'agent';
      }

      steps.push({ id: stepId, agent });
      console.log(`  ✅ ステップ追加: ${stepId} (agent: ${agent})\n`);
    }

    // ─── パス2: 各ステップの詳細設定 ───
    console.log('\n【パス2: 各ステップの詳細設定】');

    const detailedSteps = [];
    for (let i = 0; i < steps.length; i++) {
      const base = steps[i];
      console.log(`\n── ステップ ${i + 1}/${steps.length}: ${base.id} (agent: ${base.agent}) ──`);

      const defaultLabel = `${prefix}:${base.agent}`;
      const labelInput = (await ask(`  label [${defaultLabel}]: `)).trim();
      const label = labelInput || defaultLabel;

      const description = (await ask('  description: ')).trim();

      // on_complete のタイプ
      console.log('  完了後の動作:');
      console.log('    [1] 次のステップへ');
      console.log('    [2] 条件分岐');
      console.log('    [3] Issueをクローズ（終端）');
      let completionType;
      while (true) {
        const ct = (await ask('  選択 [1/2/3]: ')).trim();
        if (['1', '2', '3'].includes(ct)) { completionType = ct; break; }
        console.log('  ⚠️  1, 2, 3 のいずれかを入力してください');
      }

      let on_complete = null;
      let conditions = null;

      if (completionType === '1') {
        // 次のステップへ
        console.log('  次のステップを選択してください:');
        const next = await selectNextSteps(ask, steps, '番号を入力', false);
        if (next === 'close_issue') {
          on_complete = { action: 'close_issue' };
        } else {
          on_complete = { next };
        }
      } else if (completionType === '2') {
        // 条件分岐
        conditions = await buildConditions(ask, steps);
      } else {
        // 終端
        on_complete = { action: 'close_issue' };
      }

      // on_rework
      let on_rework = null;
      const reworkInput = (await ask('  差し戻し（on_rework）を設定しますか？ [y/N]: ')).trim().toLowerCase();
      if (reworkInput === 'y') {
        const trigger = (await ask('    差し戻しトリガー文字列 [差し戻し]: ')).trim() || '差し戻し';
        console.log('    差し戻し先ステップを選択してください:');
        const next = await selectNextSteps(ask, steps, '番号を入力', false);
        on_rework = { trigger, next: next === 'close_issue' ? 'close_issue' : next };
      }

      // on_escalation
      let on_escalation = null;
      const escInput = (await ask('  エスカレーション（on_escalation）を設定しますか？ [y/N]: ')).trim().toLowerCase();
      if (escInput === 'y') {
        console.log('    エスカレーション先ステップを選択してください:');
        const next = await selectNextSteps(ask, steps, '番号を入力', false);
        on_escalation = { next: next === 'close_issue' ? 'close_issue' : next };
      }

      // parallel_with
      let parallel_with = null;
      const parallelInput = (await ask('  並列実行（parallel_with）を設定しますか？ [y/N]: ')).trim().toLowerCase();
      if (parallelInput === 'y') {
        console.log('    並列実行するステップを選択してください:');
        const next = await selectNextSteps(ask, steps, '番号を入力', false);
        if (next !== 'close_issue') parallel_with = next;
      }

      // requires
      let requires = null;
      const requiresInput = (await ask('  完了を待つステップ群（requires）を設定しますか？ [y/N]: ')).trim().toLowerCase();
      if (requiresInput === 'y') {
        console.log('    完了を待つステップを選択してください（スペース区切りで複数可）:');
        const selected = await selectNextSteps(ask, steps, '番号を入力（スペース区切り）', true);
        requires = Array.isArray(selected) ? selected.filter(s => s !== 'close_issue') : [];
      }

      detailedSteps.push({
        id: base.id,
        agent: base.agent,
        label,
        description,
        on_complete,
        conditions,
        on_rework,
        on_escalation,
        parallel_with,
        requires,
      });

      console.log(`  ✅ ステップ "${base.id}" の設定完了`);
    }

    // ─── YAML 生成 & プレビュー ───
    const config = { name, description, prefix, steps: detailedSteps };
    const yamlContent = buildYaml(config);

    console.log('\n【生成される workflow.yml のプレビュー】');
    console.log('─'.repeat(50));
    console.log(yamlContent);
    console.log('─'.repeat(50));

    // ─── 保存確認 ───
    const saveInput = (await ask('保存しますか？ [Y/n]: ')).trim().toLowerCase();
    if (saveInput !== '' && saveInput !== 'y') {
      console.log('\n⏭️  保存をキャンセルしました');
      rl.close();
      return;
    }

    const outPath = join(teamDir, 'workflow.yml');
    writeFileSync(outPath, yamlContent, 'utf-8');

    console.log(`\n✅ ワークフロー設定を保存しました: .claude/teams/${teamId}/workflow.yml`);
    console.log('');

  } finally {
    rl.close();
  }
}
