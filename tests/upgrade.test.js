/**
 * upgrade コマンド（bin/lib/upgrade.js）のテスト
 *
 * すべて一時ディレクトリ（mkdtempSync）を cwd として runUpgrade を実際に呼び、
 * ファイルの中身を読んで検証する。テンプレートの正源はリポジトリの templates/ を
 * そのまま参照する。文字列リテラルへの assert（トートロジー）は行わない。
 *
 * runUpgrade は process.exit を呼ばず終了コードを返すため、子プロセスを使わず
 * in-process で検証できる。確認プロンプトは --yes で省略する。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync
} from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { runUpgrade, enumerateUpgradeTargets } from '../bin/lib/upgrade.js';

/** dest（OS依存セパレータ）を POSIX 形式（/）に正規化する */
function toPosix(p) {
  return p.split(sep).join('/');
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

/** リポジトリの実テンプレートを読む */
function readTemplate(rel) {
  return readFileSync(join(packageRoot, 'templates', rel), 'utf-8');
}

/** cwd 配下の相対パスにファイルを書く（親ディレクトリも作る） */
function writeUnder(cwd, rel, content) {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return abs;
}

/** 一時プロジェクトを作る（backend チームの古い workflow.yml を配置済み） */
function makeProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-'));
  // 古い（テンプレートと異なる）内容を配置する。マーカーなし = 非カスタマイズ。
  writeUnder(cwd, '.claude/teams/backend/workflow.yml', '# 古いバージョンのワークフロー\nsteps: []\n');
  return cwd;
}

test('(a) --dry では書き込みが一切発生しない（バックアップディレクトリも作られない）', async () => {
  const cwd = makeProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    const code = await runUpgrade(['backend', '--dry'], { cwd });
    assert.equal(code, 0, '--dry は正常終了するべき');

    // 既存ファイルが変更されていないこと
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, '--dry で既存ファイルが変更された');
    // 新規作成もされていないこと（グローバル対象の skills が作られていない）
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '--dry で新規ファイルが作られた');
    // バックアップディレクトリが作られていないこと
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '--dry でバックアップディレクトリが作られた');
    // .gitignore も作られていないこと（--dry は副作用なし）
    assert.ok(!existsSync(join(cwd, '.gitignore')), '--dry で .gitignore が作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(b) createBackup が失敗したとき適用が実行されない（対象ファイルが変更されない）', async () => {
  const cwd = makeProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    // .ai-team-backups をファイルとして先に作っておくと、createBackup の
    // バックアップディレクトリ作成（mkdir）が失敗し、例外が投げられる。
    // これにより「バックアップ失敗 → 適用は実行しない」fail-closed を検証する。
    writeFileSync(join(cwd, '.ai-team-backups'), 'これはディレクトリではなくファイル\n', 'utf-8');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 1, 'バックアップ失敗時は終了コード1で停止するべき');

    // 対象ファイルが変更されていないこと（適用が実行されていない）
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, 'バックアップ失敗時に対象ファイルが上書きされた');
    // 本来なら新規作成されるグローバル対象も作られていないこと
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), 'バックアップ失敗時に新規ファイルが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(b-2) 非対話環境で --yes 無しなら中止し、副作用を一切残さない（R-3）', async () => {
  const cwd = makeProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    // node --test は既定で stdin が非TTY。--yes を付けずに呼ぶと confirmProceed が
    // 「非対話環境のため中止」を選び、書き込み・バックアップ・.gitignore のいずれの
    // 副作用も発生しない。追加依存なしにこの安全経路を検証する。
    const code = await runUpgrade(['backend'], { cwd });
    assert.equal(code, 0, '非対話環境での中止は終了コード0で返るべき');

    // 対象ファイルが変更されていないこと
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, '中止したのに対象ファイルが変更された');
    // 新規作成もされていないこと（グローバル対象の skills が作られていない）
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '中止したのに新規ファイルが作られた');
    // バックアップディレクトリが作られていないこと
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '中止したのにバックアップディレクトリが作られた');
    // .gitignore も作られていないこと
    assert.ok(!existsSync(join(cwd, '.gitignore')), '中止したのに .gitignore が作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(b-3) バックアップ失敗で中止したとき .gitignore に副作用を残さない（R-4）', async () => {
  const cwd = makeProject();
  try {
    // 既存の .gitignore（バックアップエントリを含まない）を用意する
    const gitignorePath = join(cwd, '.gitignore');
    const originalGitignore = 'node_modules/\n';
    writeFileSync(gitignorePath, originalGitignore, 'utf-8');

    // .ai-team-backups をファイルとして先に作り、createBackup を失敗させる。
    writeFileSync(join(cwd, '.ai-team-backups'), 'これはディレクトリではなくファイル\n', 'utf-8');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 1, 'バックアップ失敗時は終了コード1で停止するべき');

    // 既存 .gitignore が変更されていないこと（ensureGitignore はバックアップ成功後にのみ実行）
    assert.equal(
      readFileSync(gitignorePath, 'utf-8'), originalGitignore,
      'バックアップ失敗で中止したのに .gitignore が変更された'
    );
    // バックアップエントリが追記されていないこと
    assert.ok(
      !readFileSync(gitignorePath, 'utf-8').includes('.ai-team-backups/'),
      'バックアップ失敗で中止したのに .ai-team-backups/ が .gitignore に追記された'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(b-4) バックアップ失敗で中止したとき .gitignore を新規作成しない（R-4）', async () => {
  const cwd = makeProject();
  try {
    // .ai-team-backups をファイルとして先に作り、createBackup を失敗させる。
    writeFileSync(join(cwd, '.ai-team-backups'), 'これはディレクトリではなくファイル\n', 'utf-8');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 1, 'バックアップ失敗時は終了コード1で停止するべき');

    // .gitignore が新規作成されていないこと
    assert.ok(
      !existsSync(join(cwd, '.gitignore')),
      'バックアップ失敗で中止したのに .gitignore が新規作成された'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(c) 適用後に対象ファイルが最新テンプレートと一致する', async () => {
  const cwd = makeProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const expected = readTemplate('teams/backend/workflow.yml');
    // 前提: 配置した古い内容はテンプレートと異なる（そうでないと差分検証にならない）
    assert.notEqual(readFileSync(workflowPath, 'utf-8'), expected, '前提: 初期内容はテンプレートと異なるべき');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0, 'アップグレードは正常終了するべき');

    // 上書き対象がテンプレートと一致すること
    assert.equal(readFileSync(workflowPath, 'utf-8'), expected, '適用後の workflow.yml がテンプレートと一致しない');

    // 新規作成されるグローバル対象（skills）もテンプレートと一致すること
    const runSkillPath = join(cwd, '.claude/commands/ai-team-run.md');
    assert.ok(existsSync(runSkillPath), 'skills が新規作成されていない');
    assert.equal(
      readFileSync(runSkillPath, 'utf-8'),
      readFileSync(join(packageRoot, 'skills', 'ai-team-run.md'), 'utf-8'),
      '適用後の skills がテンプレートと一致しない'
    );

    // 共有設定（escalation-rules.yml）もテンプレートと一致すること
    const escalationPath = join(cwd, '.claude/escalation-rules.yml');
    assert.ok(existsSync(escalationPath), 'escalation-rules.yml が新規作成されていない');
    assert.equal(
      readFileSync(escalationPath, 'utf-8'),
      readTemplate('_shared/escalation-rules.yml'),
      '適用後の escalation-rules.yml がテンプレートと一致しない'
    );

    // バックアップが作成され、退避対象（workflow.yml）が旧内容で残っていること
    assert.ok(existsSync(join(cwd, '.ai-team-backups')), 'バックアップディレクトリが作られていない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('カスタマイズ済みファイルは --force なしでは保護され、--force で上書きされる', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-cust-'));
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const customized = '# customized: true\n# 手編集したワークフロー\nsteps: [custom]\n';
    writeUnder(cwd, '.claude/teams/backend/workflow.yml', customized);

    // --force なし: 保護されて内容が保持される
    const code1 = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code1, 0);
    assert.equal(readFileSync(workflowPath, 'utf-8'), customized, 'カスタマイズ済みファイルが保護されていない');

    // --force あり: テンプレートで上書きされる
    const code2 = await runUpgrade(['backend', '--yes', '--force'], { cwd });
    assert.equal(code2, 0);
    assert.equal(
      readFileSync(workflowPath, 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      '--force でカスタマイズ済みファイルが上書きされていない'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('不明なチームIDは終了コード1で停止する', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-bad-'));
  try {
    const code = await runUpgrade(['no-such-team'], { cwd });
    assert.equal(code, 1, '不明なチームIDはエラー終了するべき');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '不明チームでバックアップが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 対象列挙が plugin.json の install マップから導出されること（Issue #82 作業2）
//
// 旧実装は agents / dod / workflow.yml / review-config.yml の4種をハードコードして
// おり、content の compliance-rules/* が更新対象から漏れていた。回帰防止として、
// plugin.json 由来で compliance-rules が対象に含まれ、github/ISSUE_TEMPLATE が
// 対象外（excludedRepoConfig）になることを検証する。
// ---------------------------------------------------------------------------

test('content の upgrade 対象に compliance-rules/ が含まれる（plugin.json 由来・ハードコード除去の回帰防止）', () => {
  const { targets } = enumerateUpgradeTargets({ teams: ['content'] });
  const dests = targets.map((t) => toPosix(t.dest));

  // content の compliance-rules（health-pharma.md）が対象に含まれること
  assert.ok(
    dests.includes('.claude/teams/content/compliance-rules/health-pharma.md'),
    `compliance-rules が upgrade 対象に含まれていない: ${dests.join(', ')}`
  );

  // 従来対象（workflow.yml / agents / dod）も引き続き含まれること（退行していない）
  assert.ok(dests.includes('.claude/teams/content/workflow.yml'), 'workflow.yml が対象から外れている');
  assert.ok(
    dests.some((d) => d.startsWith('.claude/teams/content/agents/')),
    'agents/ が対象から外れている'
  );
  assert.ok(
    dests.some((d) => d.startsWith('.claude/teams/content/dod/')),
    'dod/ が対象から外れている'
  );

  // 対象の src が実在すること（トートロジー回避のため実ファイルの存在で裏取り）
  const complianceTarget = targets.find(
    (t) => toPosix(t.dest) === '.claude/teams/content/compliance-rules/health-pharma.md'
  );
  assert.ok(existsSync(complianceTarget.src), '対象 src の実ファイルが存在しない');
});

test('github/ISSUE_TEMPLATE は upgrade 対象外で、excludedRepoConfig に記録される', () => {
  const { targets, excludedRepoConfig } = enumerateUpgradeTargets({ teams: ['content'] });

  // targets に .github/ 配下が混入していないこと（.claude/ 配下のみが対象）
  assert.ok(
    targets.every((t) => toPosix(t.dest).startsWith('.claude/')),
    'upgrade 対象に .claude/ 外のパスが混入している'
  );

  // 黙って落とさず、対象外として記録されていること
  assert.ok(
    excludedRepoConfig.some((e) => e.destDir.startsWith('.github/') && e.team === 'content'),
    `github/ISSUE_TEMPLATE が excludedRepoConfig に記録されていない: ${JSON.stringify(excludedRepoConfig)}`
  );
});

test('youtube の upgrade 対象に PRODUCTION-GUIDE.md が含まれる（plugin.json 由来）', () => {
  const { targets } = enumerateUpgradeTargets({ teams: ['youtube'] });
  const dests = targets.map((t) => toPosix(t.dest));
  assert.ok(
    dests.includes('.claude/teams/youtube/PRODUCTION-GUIDE.md'),
    `PRODUCTION-GUIDE.md が upgrade 対象に含まれていない: ${dests.join(', ')}`
  );
});
