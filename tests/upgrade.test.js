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
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, existsSync, rmSync,
  symlinkSync, lstatSync, linkSync
} from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';

import { runUpgrade, enumerateUpgradeTargets, diffTargets } from '../bin/lib/upgrade.js';
import { recordFiles, loadBaseline, normalizedHash } from '../bin/lib/baseline.js';
import { applyProfileToContent } from '../bin/lib/apply-model-profile.js';

/** dest（OS依存セパレータ）を POSIX 形式（/）に正規化する */
function toPosix(p) {
  return p.split(sep).join('/');
}

/**
 * 指定した相対パスの現物内容を baseline として記録する（#85）。
 * 「このツールが前回この内容を配置した（＝ユーザーは未編集）」状態を再現する。
 * ハッシュ照合方式では、未編集ファイルが update に分類されるには baseline が必要。
 */
function seedBaseline(cwd, rels) {
  recordFiles(cwd, rels);
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
  // 「ツールが前回この内容を配置した（ユーザー未編集）」ことを表す baseline を記録する。
  // これによりハッシュ照合で「未編集 → 更新」と判定される（#85）。
  seedBaseline(cwd, ['.claude/teams/backend/workflow.yml']);
  return cwd;
}

/**
 * 非対話（非TTY）かつ即 EOF の stdin を作る。confirmProceed へ注入することで、
 * 対話端末（isTTY=true の実環境）で `node --test` を直接実行しても、確認プロンプト待ちで
 * ハングせず確定的に「非対話のため中止」経路を通せる。isTTY が偽なので confirmProceed は
 * askYesNo を呼ばずに false を返すが、万一呼ばれても既に終了した stream なので待たない。
 */
function makeClosedStdin() {
  const stream = Readable.from([]); // 即座に 'end' を発火する空ストリーム
  stream.isTTY = false;
  return stream;
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

    // --yes を付けずに呼ぶと confirmProceed が確認を必要とする。ここで非TTYの stdin を明示的に
    // 注入することで、環境の stdin が TTY か否かに依存せず確定的に「非対話環境のため中止」経路を
    // 通す。これにより、開発者が対話端末で `node --test tests/upgrade.test.js` を直接実行しても
    // askYesNo のプロンプト待ちでハングしない（#84）。中止経路では書き込み・バックアップ・
    // .gitignore のいずれの副作用も発生しないことを検証する。
    //
    // 【このテストが保証する範囲と限界（Issue #93 副次的な指摘・NOTE）】
    //   保証する: 「非対話（isTTY=false）で --yes 無し → 中止・副作用なし」の分岐と後片付け。
    //   保証しない: stdin 注入そのものの必要性（注入を process.stdin へ戻す退行）。非TTY の CI では
    //     process.stdin も isTTY=false のため、注入を消しても同じ中止経路を通り緑のまま通過する。
    //     注入の必要性（対話端末でのハング防止）は実 PTY 無しには CI で再現できない。
    //   その退行は下の (b-5) が捕捉する: (b-5) は isTTY=true かつ 'y' を供給した stdin を注入し、
    //     「注入 stdin を実際に読んで承諾したときにのみ適用が起きる」ことを検証する。注入を
    //     process.stdin へ戻すと、CI の非TTY stdin では即中止し適用されず (b-5) が落ちるため、
    //     注入の削除を CI でも検出できる。実 PTY 依存の追加なしに回帰ガードを成立させている。
    const code = await runUpgrade(['backend'], { cwd, stdin: makeClosedStdin() });
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

test('(b-5) 対話環境で y と応答すると適用される（注入 stdin を実際に読む回帰ガード・Issue #93）', async () => {
  // (b-2) の限界（注入の削除を非TTY の CI で捕捉できない）を埋める対の正常系ガード。
  // isTTY=true かつ 'y' を供給した stdin を注入し、confirmProceed が askYesNo 経由で
  // その stdin を読んで承諾したときにのみ適用が起きることを検証する。
  //   - 注入を process.stdin へ戻す退行が起きると、CI の process.stdin は非TTY のため
  //     confirmProceed が即中止し（applyUpgrade まで到達しない）、workflow.yml が更新されず
  //     このテストが落ちる。すなわち stdin 注入の削除を CI（非TTY）でも検出できる。
  //   - `npm test` は stdout をパイプするため readline は非ターミナル（行）モードで動作し、
  //     注入した Readable から 'y\n' を確定的に1行読む（実PTY 不要で決定的）。
  const cwd = makeProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    assert.notEqual(
      readFileSync(workflowPath, 'utf-8'), readTemplate('teams/backend/workflow.yml'),
      '前提: 初期内容はテンプレートと異なるべき（適用の有無で差が出るように）'
    );
    const ttyYes = Readable.from(['y\n']);
    ttyYes.isTTY = true; // confirmProceed に「対話（askYesNo）」経路を通させる

    const code = await runUpgrade(['backend'], { cwd, stdin: ttyYes });
    assert.equal(code, 0, '承諾時は終了コード0であるべき');

    // askYesNo が注入 stdin から 'y' を読み、適用が実行されている（注入が生きている証拠）
    assert.equal(
      readFileSync(workflowPath, 'utf-8'), readTemplate('teams/backend/workflow.yml'),
      '注入した stdin の y が読まれず適用されなかった（注入が process.stdin へ退行した疑い）'
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

// ---------------------------------------------------------------------------
// Issue #86: 保護ファイルの隣に最新テンプレートを <dest>.new として書き出す機能、
// 及び --diff オプション。dpkg の .dpkg-dist / RPM の .rpmnew と同じ方式。
// ---------------------------------------------------------------------------

/** カスタマイズ済み（# customized: true 付き・テンプレートと異なる）workflow.yml を配置した一時プロジェクト */
function makeCustomizedProject() {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-new-'));
  const customized = '# customized: true\n# 手編集したワークフロー\nsteps: [custom]\n';
  writeUnder(cwd, '.claude/teams/backend/workflow.yml', customized);
  return { cwd, customized };
}

/** runUpgrade 実行中の標準出力（console.log / process.stdout.write 双方）を捕捉する */
async function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (chunk, ...rest) => {
    out += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

/** runUpgrade 実行中の標準エラー出力（console.error → process.stderr.write）を捕捉する */
async function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk, ...rest) => {
    err += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = orig;
  }
  return err;
}

/** .ai-team-backups/ 配下の世代ディレクトリ数を数える */
function backupGenCount(cwd) {
  const root = join(cwd, '.ai-team-backups');
  if (!existsSync(root)) return 0;
  return readdirSync(root).filter((n) => statSync(join(root, n)).isDirectory()).length;
}

/** バックアップ世代ディレクトリ配下から相対パス rel の退避ファイル絶対パスを探す */
function findInBackup(cwd, rel) {
  const root = join(cwd, '.ai-team-backups');
  if (!existsSync(root)) return null;
  for (const gen of readdirSync(root)) {
    const genDir = join(root, gen);
    if (!statSync(genDir).isDirectory()) continue;
    const candidate = join(genDir, rel);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

test('(#86-1) 保護ファイルの隣に <dest>.new が書き出され、内容が最新テンプレートと一致する', async () => {
  const { cwd, customized } = makeCustomizedProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const newPath = `${workflowPath}.new`;
    const template = readTemplate('teams/backend/workflow.yml');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // 本体は上書きされず、ユーザーの編集が保持される
    assert.equal(readFileSync(workflowPath, 'utf-8'), customized, '保護ファイル本体が上書きされた');
    // .new が書き出され、内容が最新テンプレートそのものと一致する
    assert.ok(existsSync(newPath), '.new が書き出されていない');
    assert.equal(readFileSync(newPath, 'utf-8'), template, '.new の内容が最新テンプレートと一致しない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-2) --dry では .new が書き出されない（副作用ゼロを維持）', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const newPath = join(cwd, '.claude/teams/backend/workflow.yml.new');

    const code = await runUpgrade(['backend', '--dry'], { cwd });
    assert.equal(code, 0);

    assert.ok(!existsSync(newPath), '--dry なのに .new が書き出された');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '--dry なのにバックアップが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-3) --force では .new が書き出されない（保護スキップが発生しないため）', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const newPath = `${workflowPath}.new`;
    const template = readTemplate('teams/backend/workflow.yml');

    const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
    assert.equal(code, 0);

    // --force では本体が最新テンプレートで上書きされる
    assert.equal(readFileSync(workflowPath, 'utf-8'), template, '--force で本体が上書きされていない');
    // 保護スキップが起きないので .new は作られない
    assert.ok(!existsSync(newPath), '--force なのに .new が書き出された');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-4) 既存の .new は上書き前にバックアップへ退避される', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const newRel = '.claude/teams/backend/workflow.yml.new';
    const newPath = join(cwd, newRel);
    const template = readTemplate('teams/backend/workflow.yml');
    // 前回の upgrade で書き出された古い .new を模して、テンプレートとは異なる内容を置く
    const oldNew = '# 旧世代の .new（前回のテンプレート）\nold_new: true\n';
    writeUnder(cwd, newRel, oldNew);
    assert.notEqual(oldNew, template, '前提: 旧 .new は最新テンプレートと異なる');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // 現在の .new は最新テンプレートで上書きされている
    assert.equal(readFileSync(newPath, 'utf-8'), template, '.new が最新テンプレートに更新されていない');
    // 上書き前の旧 .new がバックアップに退避されている
    const backedUp = findInBackup(cwd, newRel);
    assert.ok(backedUp, '旧 .new がバックアップに退避されていない');
    assert.equal(readFileSync(backedUp, 'utf-8'), oldNew, '退避された .new の内容が旧内容と一致しない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-5) バックアップ失敗時は .new も書き出されない（fail-closed）', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const newPath = join(cwd, '.claude/teams/backend/workflow.yml.new');
    // .ai-team-backups をファイルとして先に作り、createBackup を失敗させる
    writeFileSync(join(cwd, '.ai-team-backups'), 'これはディレクトリではなくファイル\n', 'utf-8');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 1, 'バックアップ失敗時は終了コード1で停止するべき');

    // バックアップできない状態では .new も書き出さない
    assert.ok(!existsSync(newPath), 'バックアップ失敗時に .new が書き出された');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-6) 書き出した .new は次回の upgrade で更新対象と誤認されない', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    // 1 回目: .new を書き出す
    await runUpgrade(['backend', '--yes'], { cwd });
    const newRel = '.claude/teams/backend/workflow.yml.new';
    assert.ok(existsSync(join(cwd, newRel)), '前提: 1 回目で .new が書き出される');

    // 列挙対象（テンプレート由来）に .new が一切含まれないこと
    const { targets } = enumerateUpgradeTargets({ teams: ['backend'] });
    assert.ok(
      targets.every((t) => !toPosix(t.dest).endsWith('.new')),
      `.new が upgrade 対象に混入している: ${targets.map((t) => t.dest).join(', ')}`
    );

    // 2 回目: 分類しても .new は new/update/protected のどれにも現れない
    const diffs = diffTargets({ cwd, targets, force: false });
    assert.ok(
      diffs.every((d) => !toPosix(d.dest).endsWith('.new')),
      '.new が差分分類の対象になっている'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-7) インシデント#3再発防止: 実在の ai-team-configure.md（本文にマーカー）は「上書き更新」に分類される', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-incident3-'));
  try {
    // 実在の配布物そのものを読み込む（テストデータの自作ではない）
    const realConfigure = readFileSync(join(packageRoot, 'skills', 'ai-team-configure.md'), 'utf-8');
    // 前提1: 配布物の本文にはマーカー文字列が含まれる（誤検出の原因になりうる）
    assert.ok(
      realConfigure.includes('# customized: true'),
      '前提: 配布物 ai-team-configure.md の本文にマーカー文字列が含まれるはず'
    );
    // 前提2: ただしヘッダ領域（先頭5行）にはマーカーが無い（＝カスタマイズ済みではない）
    assert.ok(
      !realConfigure.split('\n').slice(0, 5).join('\n').includes('# customized: true'),
      '前提: 先頭5行にマーカーが無いはず'
    );

    // .claude/commands/ に「旧バージョン」として配置する。実在の配布物へ末尾に 1 行だけ
    // 加え、最新テンプレートと差が出るようにする（本文のマーカーはそのまま維持される）。
    const configureDest = '.claude/commands/ai-team-configure.md';
    const oldContent = `${realConfigure}\n<!-- 旧バージョン -->\n`;
    writeUnder(cwd, configureDest, oldContent);
    // ツールが前回この旧版を配置した（ユーザー未編集）状態を baseline に記録する。
    // 本文にマーカー文字列を含むが、ヘッダ5行には無く、かつ現物 == baseline のため update に
    // 分類されるべき（本文マーカーの誤検出も no-baseline 誤保護もしない・インシデント #3 / #85）。
    seedBaseline(cwd, [configureDest]);

    const { targets } = enumerateUpgradeTargets({ teams: [] });
    const diffs = diffTargets({ cwd, targets, force: false });
    const configureDiff = diffs.find((d) => toPosix(d.dest) === configureDest);
    assert.ok(configureDiff, 'ai-team-configure.md が upgrade 対象に含まれていない');
    // 本文のマーカーに惑わされず「上書き更新」に分類される（保護スキップではない）
    assert.equal(
      configureDiff.category, 'update',
      `本文のマーカーを誤検出して category=${configureDiff.category} になった（update であるべき）`
    );

    // 実際に upgrade を通しても、上書き更新され、.new は作られない
    const code = await runUpgrade(['--yes'], { cwd });
    assert.equal(code, 0);
    assert.equal(
      readFileSync(join(cwd, configureDest), 'utf-8'), realConfigure,
      'ai-team-configure.md が最新テンプレートへ上書き更新されていない'
    );
    assert.ok(
      !existsSync(join(cwd, `${configureDest}.new`)),
      '誤って保護扱いされ .new が書き出された'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-8) --diff は unified diff を出力し、--dry --diff では何も書き込まない', async () => {
  const cwd = makeProject(); // 非カスタマイズの古い workflow.yml（→ update に分類）
  try {
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--dry', '--diff'], { cwd });
      assert.equal(code, 0);
    });

    // unified diff の体裁（ハンクヘッダと ---/+++ ヘッダ）が出力に含まれる
    assert.ok(out.includes('@@ '), `unified diff のハンクヘッダが出力されていない:\n${out}`);
    assert.ok(out.includes('--- ') && out.includes('+++ '), 'unified diff のファイルヘッダが無い');
    // 実際の変更内容（テンプレート側の行）が + 行として現れる（トートロジー回避）
    const templateFirstLine = readTemplate('teams/backend/workflow.yml').split('\n')[0];
    assert.ok(
      out.includes(`+${templateFirstLine}`),
      `テンプレートの内容が + 行として出力されていない: "+${templateFirstLine}"`
    );

    // --dry --diff は何も書き込まない
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, '--dry --diff で既存ファイルが変更された');
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '--dry --diff で新規ファイルが作られた');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '--dry --diff でバックアップが作られた');
    assert.ok(!existsSync(`${workflowPath}.new`), '--dry --diff で .new が作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-9) 冪等性: 同一内容の .new があるとき、upgrade を繰り返してもバックアップ世代が増えない', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const newPath = join(cwd, '.claude/teams/backend/workflow.yml.new');

    // 1 回目: グローバル対象の新規作成 + .new 書き出しでバックアップ世代 1 が作られる
    await runUpgrade(['backend', '--yes'], { cwd });
    assert.ok(existsSync(newPath), '前提: 1 回目で .new が書き出される');
    assert.equal(backupGenCount(cwd), 1, '1 回目でバックアップ世代は 1 になるべき');

    // 2 回目・3 回目: すべて最新（.new も同一）→ 何も書かず世代も増えない
    await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(backupGenCount(cwd), 1, '2 回目でバックアップ世代が増えた（非冪等）');

    await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(backupGenCount(cwd), 1, '3 回目でバックアップ世代が増えた（非冪等）');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-10) 冪等性: 同一 .new がある状態で再実行しても .new の内容と mtime が変わらない', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    const newPath = join(cwd, '.claude/teams/backend/workflow.yml.new');

    await runUpgrade(['backend', '--yes'], { cwd });
    assert.ok(existsSync(newPath), '前提: 1 回目で .new が書き出される');
    const contentBefore = readFileSync(newPath, 'utf-8');
    const mtimeBefore = statSync(newPath).mtimeMs;

    // 書き込みの有無を mtime の変化で判定するため、確実に時間差を空けてから再実行する
    await new Promise((r) => setTimeout(r, 20));
    await runUpgrade(['backend', '--yes'], { cwd });

    assert.equal(readFileSync(newPath, 'utf-8'), contentBefore, '再実行で .new の内容が変わった');
    assert.equal(
      statSync(newPath).mtimeMs, mtimeBefore,
      '再実行で .new が書き直された（mtime が変化した＝無駄な書き込み）'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-11) 保護ファイルのみ・.new も最新なら「すべて最新です」で早期終了し、バックアップを作らない', async () => {
  const { cwd } = makeCustomizedProject();
  try {
    // 1 回目でグローバル対象と .new を最新化する
    await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(backupGenCount(cwd), 1, '前提: 1 回目でバックアップ世代 1');

    // 2 回目: 適用すべき差分が無い（保護ファイルの .new も最新）
    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 「すべて最新です」に到達し、かつ保護ファイルが未処理で残っていることが分かる
    assert.ok(out.includes('すべて最新です'), `早期終了メッセージが無い:\n${out}`);
    assert.ok(out.includes('保護されたファイルが'), '保護ファイルの残存が案内されていない');
    assert.ok(
      out.includes('.claude/teams/backend/workflow.yml.new'),
      '保護ファイルの .new の在り処が案内されていない'
    );
    // 新たなバックアップ世代が作られていないこと
    assert.equal(backupGenCount(cwd), 1, '差分が無いのにバックアップ世代が増えた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Issue #86 R-1: 退避先がシンボリックリンクのとき、copyFileSync がリンクを辿って
// .claude/ の外を上書きする脆弱性への対策。dest 本体・保護ファイルの <dest>.new の
// 両経路でリンクを辿らずスキップし、差分サマリ・完了報告に明示し、バックアップからも
// 除外することを検証する。
//
// 制約: シンボリックリンクは必ず一時ディレクトリ（mkdtempSync で作った cwd）の内側で
// 完結させる。リンク先の「外部ファイル」victim も cwd 内に置くため、リポジトリや
// リポジトリ外の実ファイルを指すリンクは一切作らない。
// ---------------------------------------------------------------------------

/** cwd 内（.claude/ の外）に「外部ファイル」victim を作り、そのパスと中身を返す */
function makeVictim(cwd, name = 'victim.txt') {
  const victimPath = join(cwd, name);
  const content = `外部ファイルの中身（上書きされてはならない）: ${name}\n`;
  writeFileSync(victimPath, content, 'utf-8');
  return { victimPath, content };
}

/** cwd 配下の相対パス rel に、絶対パス absTarget を指すシンボリックリンクを作る */
function symlinkUnder(cwd, rel, absTarget) {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  symlinkSync(absTarget, abs);
  return abs;
}

test('(#86-R1-1) <dest>.new がシンボリックリンクのとき、リンク先のファイルが上書きされない', async () => {
  const { cwd } = makeCustomizedProject(); // workflow.yml はカスタマイズ済み（保護）
  try {
    const { victimPath, content } = makeVictim(cwd);
    const newRel = '.claude/teams/backend/workflow.yml.new';
    // .new を victim へのシンボリックリンクにする（辿ると victim を書き換えてしまう）
    const newAbs = symlinkUnder(cwd, newRel, victimPath);

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // リンク先の victim が上書きされていないこと（辿らずスキップした証拠）
    assert.equal(readFileSync(victimPath, 'utf-8'), content, '.new のリンク先（victim）が上書きされた');
    // .new は依然としてシンボリックリンクのまま（実ファイルへ置き換わっていない）
    assert.ok(lstatSync(newAbs).isSymbolicLink(), '.new のシンボリックリンクが実ファイルに置き換えられた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R1-2) dest 自体がシンボリックリンクのとき、リンク先のファイルが上書きされない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-symlink-'));
  try {
    const { victimPath, content } = makeVictim(cwd);
    const destRel = '.claude/teams/backend/workflow.yml';
    // workflow.yml 本体を victim へのシンボリックリンクにする（既存 update 経路の脆弱性）
    const destAbs = symlinkUnder(cwd, destRel, victimPath);

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(victimPath, 'utf-8'), content, 'dest のリンク先（victim）が上書きされた');
    assert.ok(lstatSync(destAbs).isSymbolicLink(), 'dest のシンボリックリンクが実ファイルに置き換えられた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R1-3) スキップしたシンボリックリンクが差分サマリに表示される', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-symlink-'));
  try {
    const { victimPath } = makeVictim(cwd);
    const destRel = '.claude/teams/backend/workflow.yml';
    symlinkUnder(cwd, destRel, victimPath);

    // --dry でも差分提示フェーズは走るため、書き込みなしで差分サマリを確認できる
    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--dry'], { cwd });
      assert.equal(code, 0);
    });

    assert.ok(out.includes('シンボリックリンク'), `差分サマリにシンボリックリンクの案内が無い:\n${out}`);
    assert.ok(out.includes(destRel), `スキップした dest のパスが表示されていない:\n${out}`);
    // リンク先（victim の絶対パス）も明示される（silent cap の禁止）
    assert.ok(out.includes(victimPath), `リンク先（victim）が表示されていない:\n${out}`);
    // --dry なので victim は当然無傷
    assert.ok(existsSync(victimPath), 'victim が消えた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R1-4) シンボリックリンクはバックアップ対象に含まれない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-symlink-'));
  try {
    const { victimPath, content } = makeVictim(cwd);
    // dest 本体をシンボリックリンクにする（→ バックアップ対象から除外されるべき）
    const destRel = '.claude/teams/backend/workflow.yml';
    symlinkUnder(cwd, destRel, victimPath);

    // 通常ファイル（escalation-rules.yml）を古い内容で置き、これは update → バックアップされる。
    // これによりバックアップ自体は作成される（＝除外の検証が意味を持つ）。
    const escalationRel = '.claude/escalation-rules.yml';
    writeUnder(cwd, escalationRel, '# 古いエスカレーションルール\n');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // 通常ファイルはバックアップに退避されている（バックアップ自体は動作している）
    assert.ok(findInBackup(cwd, escalationRel), '通常ファイルがバックアップに退避されていない');
    // シンボリックリンク（dest 本体）はバックアップに退避されていない
    assert.equal(
      findInBackup(cwd, destRel), null,
      'シンボリックリンクの dest がバックアップに退避された（除外されていない）'
    );
    // リンク先の victim も無傷
    assert.equal(readFileSync(victimPath, 'utf-8'), content, 'victim が上書きされた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R1-5) シンボリックリンクをスキップしても、他の通常ファイルは正しく更新される（完了報告にも明示）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-symlink-'));
  try {
    const { victimPath, content } = makeVictim(cwd);
    const destRel = '.claude/teams/backend/workflow.yml';
    symlinkUnder(cwd, destRel, victimPath);

    // 通常ファイル（escalation-rules.yml）を古い内容で置く（update に分類される）
    const escalationRel = '.claude/escalation-rules.yml';
    writeUnder(cwd, escalationRel, '# 古いエスカレーションルール\n');
    seedBaseline(cwd, [escalationRel]); // ツールが配置済み（未編集）→ ハッシュ照合で update（#85）
    const expectedEscalation = readTemplate('_shared/escalation-rules.yml');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // シンボリックリンクをスキップしても、通常ファイルは最新テンプレートへ更新されている
    assert.equal(
      readFileSync(join(cwd, escalationRel), 'utf-8'), expectedEscalation,
      'シンボリックリンクのスキップに巻き込まれ、通常ファイルが更新されなかった'
    );
    // リンク先の victim は無傷
    assert.equal(readFileSync(victimPath, 'utf-8'), content, 'victim が上書きされた');
    // 完了報告にシンボリックリンクのスキップが明示される
    assert.ok(
      out.includes('シンボリックリンクのためスキップしました'),
      `完了報告にシンボリックリンクのスキップが明示されていない:\n${out}`
    );
    assert.ok(out.includes(destRel), `完了報告にスキップした dest のパスが無い:\n${out}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R1-6) --force でもシンボリックリンクは辿らない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-symlink-'));
  try {
    const { victimPath, content } = makeVictim(cwd);
    const destRel = '.claude/teams/backend/workflow.yml';
    const destAbs = symlinkUnder(cwd, destRel, victimPath);

    // --force はカスタマイズ保護を無効化するが、シンボリックリンク保護には影響しない
    const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(victimPath, 'utf-8'), content, '--force でリンク先（victim）が上書きされた');
    assert.ok(lstatSync(destAbs).isSymbolicLink(), '--force でシンボリックリンクが実ファイルに置き換えられた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Issue #86 R-1（2回目の差し戻し対応）: 封じ込め検査を「パス各要素の走査」に切り替え、
// 葉（最終要素）だけでなく中間ディレクトリのシンボリックリンク、壊れたリンク、
// ハードリンクも辿らずスキップすることを検証する。旧実装は葉のみを lstat していたため
// mkdirSync(recursive) / copyFileSync が中間ディレクトリのリンクを辿り、.claude/ の外へ
// ファイルを書き出してしまっていた（Tech-Lead が実測で再現）。
//
// 制約: リンク（シンボリック・ハード）は必ず一時ディレクトリ（cwd）の内側で完結させる。
// 「外部ディレクトリ」victim も cwd 内（.claude/ の外）に置き、リポジトリ内外の実ファイルを
// 指すリンクは一切作らない。
// ---------------------------------------------------------------------------

/** cwd 内（.claude/ の外）に「外部ディレクトリ」を作り、その絶対パスを返す */
function makeExternalDir(cwd, name = 'external-dotfiles') {
  const dir = join(cwd, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** dir 配下のファイル数を再帰的に数える（リンクは辿らず1件として数える） */
function countFiles(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = lstatSync(p);
    if (st.isDirectory()) count += countFiles(p);
    else count += 1; // 通常ファイル・リンク等はすべて1件
  }
  return count;
}

test('(#86-R2-1) 葉（dest 最終要素）が外部ファイルへのリンク → 外部ファイルが上書きされない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const victimPath = join(ext, 'workflow.yml');
    const content = '外部の実ファイル（不変であるべき）\n';
    writeFileSync(victimPath, content, 'utf-8');
    const before = countFiles(ext);
    // dest の葉を victim へのリンクにする
    symlinkUnder(cwd, '.claude/teams/backend/workflow.yml', victimPath);

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(victimPath, 'utf-8'), content, '葉リンクのリンク先が上書きされた');
    assert.equal(countFiles(ext), before, '外部ディレクトリのファイル数が変わった');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-2) .claude 自体が外部へのリンク → 外部に1件も作られず・終了コード0・警告あり', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const before = countFiles(ext); // 0
    // .claude 自体を外部ディレクトリへのリンクにする（すべての対象が経路にこのリンクを含む）
    symlinkSync(ext, join(cwd, '.claude'));

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, '.claude がリンクでも終了コード0であるべき');
    });

    // 外部（.claude のリンク先）に1件もファイルが作られていない
    assert.equal(countFiles(ext), before, '.claude のリンク先にファイルが作られた');
    // スキップの警告が明示されている（silent cap の禁止）
    assert.ok(out.includes('シンボリックリンク'), `シンボリックリンクの警告が無い:\n${out}`);
    assert.ok(out.includes(ext), `リンク先（外部ディレクトリ）が表示されていない:\n${out}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-3) .claude/teams が外部へのリンク → 外部に1件も作られない（Tech-Lead 再現ケース）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const before = countFiles(ext); // 0
    // .claude は実ディレクトリ、.claude/teams を外部へのリンクにする（中間ディレクトリのリンク）
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    symlinkSync(ext, join(cwd, '.claude', 'teams'));

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // 外部（.claude/teams のリンク先）に1件もファイルが作られていない（旧実装のバグの核心）
    assert.equal(countFiles(ext), before, '.claude/teams のリンク先にファイルが作られた');
    // グローバル対象は実 .claude 配下に作られている（リンクのスキップに巻き込まれていない）
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'リンクと無関係なグローバル対象が作られていない'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-4) .claude/agents（保護ファイルの .new の親）が外部へのリンク → .new も本体も外部に書かれない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    symlinkSync(ext, join(cwd, '.claude', 'agents'));

    // 実在の共有エージェント1件を、外部（.claude/agents のリンク先）にカスタマイズ済みで置く。
    // リンクが無ければ保護され .new が書き出される状況を作る。
    const { targets } = enumerateUpgradeTargets({ teams: [] });
    const agentTarget = targets.find(
      (t) => toPosix(t.dest).startsWith('.claude/agents/') && toPosix(t.dest).endsWith('.md')
    );
    assert.ok(agentTarget, '前提: 共有エージェントの対象が存在する');
    const base = toPosix(agentTarget.dest).split('/').pop();
    const customized = '---\n# customized: true\n手編集したエージェント\n---\n';
    writeFileSync(join(ext, base), customized, 'utf-8');
    const before = countFiles(ext); // 1

    const code = await runUpgrade(['--yes'], { cwd });
    assert.equal(code, 0);

    // 外部に .new が書かれておらず、ファイル数も増えていない
    assert.equal(countFiles(ext), before, '.claude/agents のリンク先にファイルが増えた（.new など）');
    assert.ok(!existsSync(join(ext, `${base}.new`)), '.new が外部に書き出された');
    // 外部のエージェント本体も上書きされていない
    assert.equal(readFileSync(join(ext, base), 'utf-8'), customized, '外部のエージェント本体が上書きされた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-5) .claude/teams/backend が外部へのリンク → 外部が無傷・外部に作られない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const keep = join(ext, 'keep.txt');
    writeFileSync(keep, '不変\n', 'utf-8');
    const before = countFiles(ext);
    mkdirSync(join(cwd, '.claude', 'teams'), { recursive: true });
    symlinkSync(ext, join(cwd, '.claude', 'teams', 'backend'));

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(countFiles(ext), before, '.claude/teams/backend のリンク先にファイルが作られた');
    assert.equal(readFileSync(keep, 'utf-8'), '不変\n', '外部ファイルが上書きされた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-6) 壊れたリンク（葉・祖先の両方）でも辿らず、リンク先にファイルが作られない', async () => {
  // (6a) 祖先が壊れたリンク（.claude/teams → 存在しないディレクトリ）
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
    try {
      const missing = join(cwd, 'missing-target-dir'); // 存在しないディレクトリ
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      symlinkSync(missing, join(cwd, '.claude', 'teams'));

      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);

      // 壊れた祖先リンクの先が実体化して作られていないこと（realpathSync 方式が誤判定する経路）
      assert.ok(!existsSync(missing), '壊れた祖先リンクの先にファイル/ディレクトリが作られた');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  // (6b) 葉が壊れたリンク（workflow.yml → 存在しないファイル）
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
    try {
      const missing = join(cwd, 'missing-workflow.yml'); // 存在しないファイル
      const destAbs = symlinkUnder(cwd, '.claude/teams/backend/workflow.yml', missing);

      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);

      assert.ok(!existsSync(missing), '壊れた葉リンクの先にファイルが作られた');
      assert.ok(lstatSync(destAbs).isSymbolicLink(), '壊れた葉リンクが実ファイルに置換された');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

test('(#86-R2-7) dest がハードリンク（外部と inode 共有）→ 外部 inode が上書きされない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const victimPath = join(ext, 'shared.yml');
    const content = '外部ファイル（inode 共有・不変であるべき）\n';
    writeFileSync(victimPath, content, 'utf-8');
    // dest を victim へのハードリンクにする（同一 inode）
    const destAbs = join(cwd, '.claude/teams/backend/workflow.yml');
    mkdirSync(dirname(destAbs), { recursive: true });
    linkSync(victimPath, destAbs);
    assert.ok(lstatSync(destAbs).nlink > 1, '前提: dest はハードリンク（nlink>1）であるべき');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 外部 inode の内容が上書きされていない（copyFileSync が共有 inode を書き換えていない）
    assert.equal(readFileSync(victimPath, 'utf-8'), content, 'ハードリンク経由で外部 inode が上書きされた');
    assert.equal(readFileSync(destAbs, 'utf-8'), content, 'ハードリンク（dest）の内容が変わった＝inode が書き換わった');
    // ハードリンクのスキップが報告される（symlink とは別種として明示）
    assert.ok(out.includes('ハードリンク'), `ハードリンクのスキップ報告が無い:\n${out}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-8) .gitignore が外部ファイルへのリンク → 追記されず外部が無傷', async () => {
  const cwd = makeProject(); // 古い workflow.yml（update）→ バックアップ経由で ensureGitignore に到達
  try {
    const ext = makeExternalDir(cwd);
    const extGitignore = join(ext, 'real-gitignore');
    const original = 'node_modules/\n';
    writeFileSync(extGitignore, original, 'utf-8');
    symlinkSync(extGitignore, join(cwd, '.gitignore'));

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 外部の .gitignore 実体が追記・上書きされていない
    assert.equal(readFileSync(extGitignore, 'utf-8'), original, '.gitignore のリンク先が追記された');
    assert.ok(
      !readFileSync(extGitignore, 'utf-8').includes('.ai-team-backups/'),
      '.ai-team-backups/ が外部 .gitignore に追記された'
    );
    // 追記スキップの警告が出ている
    assert.ok(out.includes('.gitignore がシンボリックリンク'), `.gitignore スキップ警告が無い:\n${out}`);
    // 通常の適用は行われている（workflow.yml が最新へ更新されている）
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      'リンクのスキップに巻き込まれ workflow.yml が更新されなかった'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-9) .ai-team-backups が外部へのリンク → 終了コード1で停止し、適用が実行されない（fail-closed）', async () => {
  const cwd = makeProject();
  try {
    const ext = makeExternalDir(cwd);
    const before = countFiles(ext); // 0
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const beforeWf = readFileSync(workflowPath, 'utf-8');
    symlinkSync(ext, join(cwd, '.ai-team-backups'));

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 1, '.ai-team-backups がリンクなら終了コード1で停止するべき');

    // 適用が実行されていない
    assert.equal(readFileSync(workflowPath, 'utf-8'), beforeWf, 'バックアップ中止なのに workflow.yml が上書きされた');
    assert.ok(
      !existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'バックアップ中止なのにグローバル対象が作られた'
    );
    // 外部（リンク先）にバックアップが書き込まれていない
    assert.equal(countFiles(ext), before, '.ai-team-backups のリンク先にバックアップが書き込まれた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-10) .claude/ 内で完結するリンクも一律スキップされる（内外を判別しない・安全側）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    // .claude 内の実ファイルを用意し、workflow.yml をそれへのリンクにする（内側で完結）
    const insideTarget = join(cwd, '.claude/teams/backend/real-workflow.yml');
    const insideContent = '.claude 内の実ファイル（不変であるべき）\n';
    writeUnder(cwd, '.claude/teams/backend/real-workflow.yml', insideContent);
    const destRel = '.claude/teams/backend/workflow.yml';
    const destAbs = symlinkUnder(cwd, destRel, insideTarget);

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 内側で完結するリンクでも辿らない（リンク先の実ファイルが上書きされない）
    assert.equal(readFileSync(insideTarget, 'utf-8'), insideContent, '内側リンクのリンク先が上書きされた');
    assert.ok(lstatSync(destAbs).isSymbolicLink(), '内側リンクが実ファイルに置換された');
    // スキップとして報告される
    assert.ok(out.includes('シンボリックリンク'), `内側リンクのスキップ報告が無い:\n${out}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-11) リンクをスキップしても、他の通常ファイルは最新へ更新される', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
  try {
    const ext = makeExternalDir(cwd);
    const victim = join(ext, 'workflow.yml');
    writeFileSync(victim, '外部（不変）\n', 'utf-8');
    // 祖先リンク: .claude/teams → 外部（team 対象を全ブロック）
    mkdirSync(join(cwd, '.claude'), { recursive: true });
    symlinkSync(ext, join(cwd, '.claude', 'teams'));
    // 通常ファイル（グローバル）は古い内容を置く → update に分類される
    writeUnder(cwd, '.claude/escalation-rules.yml', '# 古いエスカレーションルール\n');
    seedBaseline(cwd, ['.claude/escalation-rules.yml']); // 未編集 → ハッシュ照合で update（#85）
    const expected = readTemplate('_shared/escalation-rules.yml');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // グローバルの通常ファイルは最新へ更新されている
    assert.equal(
      readFileSync(join(cwd, '.claude/escalation-rules.yml'), 'utf-8'), expected,
      'リンクのスキップに巻き込まれ通常ファイルが更新されなかった'
    );
    // 外部は無傷
    assert.equal(readFileSync(victim, 'utf-8'), '外部（不変）\n', '外部ファイルが上書きされた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-12) --force でもシンボリックリンク・ハードリンクのいずれも辿らない', async () => {
  // (12a) 祖先シンボリックリンク
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
    try {
      const ext = makeExternalDir(cwd);
      const before = countFiles(ext);
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      symlinkSync(ext, join(cwd, '.claude', 'teams'));

      const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
      assert.equal(code, 0);
      assert.equal(countFiles(ext), before, '--force で祖先シンボリックリンクを辿って外部に書き込んだ');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  // (12b) ハードリンク
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-r2-'));
    try {
      const ext = makeExternalDir(cwd);
      const victim = join(ext, 'shared.yml');
      const content = '外部（不変）\n';
      writeFileSync(victim, content, 'utf-8');
      const destAbs = join(cwd, '.claude/teams/backend/workflow.yml');
      mkdirSync(dirname(destAbs), { recursive: true });
      linkSync(victim, destAbs);

      const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
      assert.equal(code, 0);
      assert.equal(readFileSync(victim, 'utf-8'), content, '--force でハードリンク経由で外部 inode を上書きした');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Issue #86 R-1（Tech-Lead 実測での差し戻し対応）: 保護ファイルの <dest>.new と
// .gitignore がハードリンクの場合の封じ込め。従来は dest 本体のみハードリンクを検査し、
// <dest>.new と .gitignore はシンボリックリンクしか検査していなかったため、これらを
// 外部ファイルへのハードリンクにすると copyFileSync / writeFileSync が共有 inode を
// その場で書き換え、外部ファイルを破壊した（Tech-Lead / Reviewer-A が実測で再現）。
// <dest>.new・.gitignore のいずれもハードリンクを辿らずスキップすることを検証する。
//
// 制約: ハードリンク（linkSync）は必ず一時ディレクトリ（cwd）の内側で完結させる。
// 「外部ファイル」victim も cwd 内（.claude/ の外）に置き、リポジトリ内外の実ファイルを
// 指すリンクは一切作らない。
// ---------------------------------------------------------------------------

test('(#86-R2-13) <dest>.new がハードリンク（外部と inode 共有）→ 外部 inode が上書きされず、スキップが明示される', async () => {
  const { cwd, customized } = makeCustomizedProject(); // workflow.yml はカスタマイズ済み（保護）
  try {
    const ext = makeExternalDir(cwd);
    const victimPath = join(ext, 'shared.new');
    const content = '外部ファイル（inode 共有・不変であるべき）\n';
    writeFileSync(victimPath, content, 'utf-8');
    // <dest>.new を victim へのハードリンクにする（同一 inode）
    const newAbs = join(cwd, '.claude/teams/backend/workflow.yml.new');
    mkdirSync(dirname(newAbs), { recursive: true });
    linkSync(victimPath, newAbs);
    assert.ok(lstatSync(newAbs).nlink > 1, '前提: .new はハードリンク（nlink>1）であるべき');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 外部 inode の内容が上書きされていない（copyFileSync が共有 inode を書き換えていない）
    assert.equal(readFileSync(victimPath, 'utf-8'), content, 'ハードリンク経由で .new のリンク先 inode が上書きされた');
    assert.equal(readFileSync(newAbs, 'utf-8'), content, '.new（ハードリンク）の内容が変わった＝inode が書き換わった');
    // .new はハードリンクのまま（実ファイルへ置換されていない）
    assert.ok(lstatSync(newAbs).nlink > 1, '.new のハードリンクが実ファイルに置換された');
    // 本体はユーザーの編集が保持される（保護スキップ）
    assert.equal(readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'), customized, '保護ファイル本体が上書きされた');
    // 完了報告に .new のハードリンクスキップが明示される（「シンボリックリンクのため」と誤案内しない）
    assert.ok(out.includes('ハードリンク'), `ハードリンクのスキップ報告が無い:\n${out}`);
    assert.ok(
      !out.includes(`${'.claude/teams/backend/workflow.yml.new'} はシンボリックリンク`),
      `.new のハードリンクを「シンボリックリンクのため」と誤案内している:\n${out}`
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-14) .gitignore が外部ファイルへのハードリンク → 追記されず外部が無傷・通常の適用は続行される', async () => {
  const cwd = makeProject(); // 古い workflow.yml（update）→ バックアップ経由で ensureGitignore に到達
  try {
    const ext = makeExternalDir(cwd);
    const extGitignore = join(ext, 'real-gitignore');
    const original = 'node_modules/\n';
    writeFileSync(extGitignore, original, 'utf-8');
    // .gitignore を外部ファイルへのハードリンクにする（同一 inode）
    const gitignoreAbs = join(cwd, '.gitignore');
    linkSync(extGitignore, gitignoreAbs);
    assert.ok(lstatSync(gitignoreAbs).nlink > 1, '前提: .gitignore はハードリンク（nlink>1）であるべき');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    // 外部の .gitignore 実体（共有 inode）が追記・上書きされていない
    assert.equal(readFileSync(extGitignore, 'utf-8'), original, '.gitignore のリンク先（共有 inode）が追記された');
    assert.ok(
      !readFileSync(extGitignore, 'utf-8').includes('.ai-team-backups/'),
      '.ai-team-backups/ が外部 .gitignore に追記された'
    );
    // 追記スキップの警告（ハードリンクである旨）が出ている
    assert.ok(out.includes('.gitignore がハードリンク'), `.gitignore ハードリンクのスキップ警告が無い:\n${out}`);
    // 通常の適用は続行されている（workflow.yml が最新へ更新されている）
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      'リンクのスキップに巻き込まれ workflow.yml が更新されなかった'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#86-R2-15) --force でも <dest>.new / .gitignore のハードリンクを辿らない', async () => {
  // (15a) <dest>.new がハードリンク: --force では .new 自体を書き出さないが、外部 inode を触らないことを保証する
  {
    const { cwd } = makeCustomizedProject();
    try {
      const ext = makeExternalDir(cwd);
      const victim = join(ext, 'shared.new');
      const content = '外部（不変）\n';
      writeFileSync(victim, content, 'utf-8');
      const newAbs = join(cwd, '.claude/teams/backend/workflow.yml.new');
      mkdirSync(dirname(newAbs), { recursive: true });
      linkSync(victim, newAbs);

      const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
      assert.equal(code, 0);
      assert.equal(readFileSync(victim, 'utf-8'), content, '--force で .new のハードリンク先 inode を上書きした');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
  // (15b) .gitignore がハードリンク: --force でも共有 inode へ追記しない
  {
    const cwd = makeProject();
    try {
      const ext = makeExternalDir(cwd);
      const extGitignore = join(ext, 'real-gitignore');
      const original = 'node_modules/\n';
      writeFileSync(extGitignore, original, 'utf-8');
      linkSync(extGitignore, join(cwd, '.gitignore'));

      const code = await runUpgrade(['backend', '--yes', '--force'], { cwd });
      assert.equal(code, 0);
      assert.equal(readFileSync(extGitignore, 'utf-8'), original, '--force で .gitignore のハードリンク先 inode を追記した');
      assert.ok(
        !readFileSync(extGitignore, 'utf-8').includes('.ai-team-backups/'),
        '--force で .ai-team-backups/ が外部 .gitignore に追記された'
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }
});

// ---------------------------------------------------------------------------
// Issue #84: テスト堅牢性と未捕捉例外・EISDIR の整形。
//   3. 壊れた plugin.json を列挙段階で捕捉し、整形された日本語メッセージ＋終了コード1で停止する
//   4. dest / <dest>.new が「通常ファイルでない実体」（ディレクトリ / FIFO / ソケット / デバイス）
//      のとき、EISDIR やハングにせず skip して明示し、外部に一切書き込まない（一般化）
//
// 制約: 特殊ファイル（ディレクトリ / FIFO）は必ず一時ディレクトリ（cwd）の内側で完結させる。
// ---------------------------------------------------------------------------

test('(#84-3) 壊れた plugin.json は列挙段階で捕捉され、どのファイルが不正かを日本語で示して終了コード1で停止する', async () => {
  const cwd = makeProject();
  // plugin.json の読み取り元だけを差し替える（本番はパッケージルート固定・不変）。テンプレートは
  // 実リポジトリを使うためグローバル対象は正常に列挙でき、team=backend の plugin.json でのみ throw する。
  const pluginRoot = mkdtempSync(join(tmpdir(), 'ai-team-badplugin-'));
  try {
    const badPath = join(pluginRoot, 'packages', 'workflow-backend', 'plugin.json');
    mkdirSync(dirname(badPath), { recursive: true });
    writeFileSync(badPath, '{ "install": { これは不正な JSON ', 'utf-8'); // 構文エラー

    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    let code;
    const err = await captureStderr(async () => {
      code = await runUpgrade(['backend', '--yes'], { cwd, pluginRoot });
    });

    // 終了コード1で停止する（未捕捉例外のスタックトレースではなく、整形された停止）
    assert.equal(code, 1, '壊れた plugin.json では終了コード1で停止するべき');
    // 日本語の失敗メッセージであること・どのファイルが不正かをパスで示すこと
    assert.ok(err.includes('失敗しました'), `日本語の失敗メッセージが無い:\n${err}`);
    assert.ok(err.includes('plugin.json'), `plugin.json への言及が無い:\n${err}`);
    assert.ok(err.includes(badPath), `どのファイルが不正かをパスで示していない:\n${err}`);

    // 書き込みより前（fail-closed）で停止：対象ファイルは不変、バックアップも作られない
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, '停止したのに対象ファイルが変更された');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '停止したのにバックアップが作られた');
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '停止したのに新規ファイルが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(pluginRoot, { recursive: true, force: true });
  }
});

test('(#84-4a) dest がディレクトリのとき、EISDIR にせず skip して明示し、ディレクトリを上書きしない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-dir-'));
  try {
    // workflow.yml を「ディレクトリ」として作る（通常ファイルでない dest）
    const destRel = '.claude/teams/backend/workflow.yml';
    mkdirSync(join(cwd, destRel), { recursive: true });
    // ディレクトリ内に番兵を置き、copyFileSync で潰されていないことを確認する
    const sentinel = join(cwd, destRel, 'inside.txt');
    writeFileSync(sentinel, 'ディレクトリ内の既存ファイル\n', 'utf-8');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'ディレクトリ dest でも整形して継続し、終了コード0で終わるべき');
    });

    // dest はディレクトリのまま（copyFileSync で通常ファイルへ置き換えられていない）
    assert.ok(statSync(join(cwd, destRel)).isDirectory(), 'ディレクトリ dest が置き換えられた');
    assert.equal(
      readFileSync(sentinel, 'utf-8'), 'ディレクトリ内の既存ファイル\n',
      'ディレクトリ内のファイルが壊れた（外部に書き込まれた）'
    );
    // スキップが明示される（通常ファイル以外である旨・種別・パス）。
    // 「（ディレクトリ）」は per-item の formatSkip（種別ラベル）でのみ現れる形であり、
    // ヘッダ文言（"ディレクトリ／FIFO 等"）では満たされない＝実際に該当項目が明示された証拠。
    assert.ok(out.includes('通常ファイルではありません'), `通常ファイル以外のスキップ明示が無い:\n${out}`);
    assert.ok(out.includes('（ディレクトリ）'), `種別（ディレクトリ）が per-item で示されていない:\n${out}`);
    assert.ok(out.includes(destRel), `スキップした dest のパスが表示されていない:\n${out}`);
    // リンクのスキップに巻き込まれず、無関係なグローバル対象は作られている
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'ディレクトリ dest のスキップに巻き込まれ、通常ファイルの新規作成がされていない'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#84-4b) <dest>.new がディレクトリのとき、EISDIR にせず skip して明示し、書き出さない', async () => {
  const { cwd, customized } = makeCustomizedProject(); // workflow.yml はカスタマイズ済み（保護）
  try {
    const newRel = '.claude/teams/backend/workflow.yml.new';
    // .new を「ディレクトリ」として作る（protectedNewNeedsWrite の readFileSync が EISDIR になる経路）
    mkdirSync(join(cwd, newRel), { recursive: true });
    const sentinel = join(cwd, newRel, 'inside.txt');
    writeFileSync(sentinel, '.new ディレクトリ内の既存ファイル\n', 'utf-8');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'ディレクトリ .new でも整形して継続し、終了コード0で終わるべき');
    });

    // 本体は保護される
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'), customized,
      '保護ファイル本体が上書きされた'
    );
    // .new はディレクトリのまま・中身も無傷（copyFileSync で潰されていない）
    assert.ok(statSync(join(cwd, newRel)).isDirectory(), '.new ディレクトリが置き換えられた');
    assert.equal(
      readFileSync(sentinel, 'utf-8'), '.new ディレクトリ内の既存ファイル\n',
      '.new ディレクトリ内のファイルが壊れた（外部に書き込まれた）'
    );
    // スキップが明示される（誤って「保存しました」と案内しない）
    assert.ok(out.includes('通常ファイル'), `.new の通常ファイル以外スキップ明示が無い:\n${out}`);
    assert.ok(
      !out.includes(`最新テンプレートを ${newRel} として保存しました`),
      `ディレクトリ .new を「保存しました」と誤案内している:\n${out}`
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#84-4c) dest が FIFO（名前付きパイプ）のとき、書き込みでハングせず skip して明示する', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-fifo-'));
  try {
    const destRel = '.claude/teams/backend/workflow.yml';
    const destAbs = join(cwd, destRel);
    mkdirSync(dirname(destAbs), { recursive: true });
    // Node に mkfifoSync は無いため mkfifo(1) を呼ぶ（既存テストと同じく Unix 前提）。
    // FIFO へ copyFileSync すると reader が居ないため write がブロック（ハング）するため、
    // 「通常ファイル以外」として辿らずスキップできていることが、ハングしないことで裏取りされる。
    execFileSync('mkfifo', [destAbs]);
    assert.ok(lstatSync(destAbs).isFIFO(), '前提: dest は FIFO であるべき');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'FIFO dest でもハングせず整形して継続し、終了コード0で終わるべき');
    });

    // FIFO のまま（通常ファイルへ置き換えられていない＝copyFileSync が走っていない）
    assert.ok(lstatSync(destAbs).isFIFO(), 'FIFO dest が置き換えられた（書き込みが起きた）');
    // スキップが明示される（通常ファイル以外・FIFO・パス）。
    // 「FIFO（名前付きパイプ）」は per-item の formatSkip でのみ現れる形であり、
    // ヘッダ文言（"FIFO 等"）では満たされない＝実際に該当項目が明示された証拠。
    assert.ok(out.includes('通常ファイルではありません'), `FIFO の通常ファイル以外スキップ明示が無い:\n${out}`);
    assert.ok(out.includes('FIFO（名前付きパイプ）'), `種別（FIFO）が per-item で示されていない:\n${out}`);
    assert.ok(out.includes(destRel), `スキップした FIFO dest のパスが表示されていない:\n${out}`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ===========================================================================
// #85 差し戻し1: 非既定モデルプロファイルでの upgrade 冪等性（実効テンプレート）
//
// 既定（balance / normal）は変換が恒等写像になる特異点であり、実効テンプレート化の存在自体を
// 隠す。ここでは必ず非既定プロファイル（low-cost / high-performance）を1つ以上通す。加えて、
// 「非既定プロファイルが実際に frontmatter へ反映された（既定 balance へ黙ってフォールバック
// していない）」ことを対抗的サニティとして毎回確認する（教訓14 の規律3・チケット記載の
// 設定キー取り違えによる偽陽性を防ぐ）。
// ===========================================================================

/** frontmatter の model 値を取り出す（先頭の model: 行） */
function frontmatterModel(text) {
  const m = text.match(/^model:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

/**
 * 指定プロファイルで upgrade を2回連続実行し、
 *  - 1回目: 全対象を新規作成し、非既定プロファイルが frontmatter に反映される（対抗的サニティ）
 *  - 2回目: 「すべて最新です」に到達し、バックアップ世代が増えない（冪等）
 * ことを実測で確認する。
 *
 * @param {{ perf: string, effort: string, leaderModel: string }} p
 *        leaderModel はそのプロファイルでの leader（tech-lead）の期待モデル（≠ balance の opus）。
 */
async function assertProfileIdempotent({ perf, effort, leaderModel }) {
  const cwd = mkdtempSync(join(tmpdir(), `ai-team-upgrade-idem-${perf}-`));
  writeUnder(cwd, '.claude/ai-team-config.yml',
    `runtime: claude-code\nmodel_performance: ${perf}\neffort_depth: ${effort}\n`);
  try {
    // --- run 1: 全対象を新規作成 + プロファイル適用 ---
    const code1 = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code1, 0, `${perf}: run1 は正常終了すべき`);
    const gen1 = backupGenCount(cwd);
    assert.equal(gen1, 1, `${perf}: run1 でバックアップ世代が1になっていない`);

    // サニティ（否定的観測「世代が増えない」の対）: upgrade が早期 return せず実処理した証拠。
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      `${perf}: run1 で ai-team-run.md が作られていない（早期 return の疑い）`
    );
    // 対抗的サニティ: 非既定プロファイルが実際に frontmatter へ反映された（既定 balance への
    // 黙ったフォールバックではない）。これが成り立たないと、以降の冪等性は「恒等特異点を見て
    // 正常と誤読した」だけになる（教訓14 の規律3）。
    const techLead1 = readFileSync(join(cwd, '.claude/teams/backend/agents/tech-lead.md'), 'utf-8');
    assert.notEqual(leaderModel, 'opus',
      '前提: テスト対象は既定 balance（opus）と異なるプロファイルでなければ意味がない');
    assert.equal(frontmatterModel(techLead1), leaderModel,
      `${perf}: run1 で非既定プロファイルが tech-lead に反映されていない（balance へフォールバックの疑い）`);

    // --- run 2: 冪等であるべき ---
    let code2;
    const out2 = await captureStdout(async () => {
      code2 = await runUpgrade(['backend', '--yes'], { cwd });
    });
    assert.equal(code2, 0, `${perf}: run2 は正常終了すべき`);
    assert.ok(
      out2.includes('すべて最新です'),
      `${perf}: run2 が「すべて最新です」に到達しない（非冪等）:\n${out2}`
    );
    assert.equal(
      backupGenCount(cwd), gen1,
      `${perf}: run2 でバックアップ世代が増えた（${gen1} → ${backupGenCount(cwd)}・非冪等）`
    );
    // frontmatter のプロファイルも run2 後に維持されている
    const techLead2 = readFileSync(join(cwd, '.claude/teams/backend/agents/tech-lead.md'), 'utf-8');
    assert.equal(frontmatterModel(techLead2), leaderModel, `${perf}: run2 後にプロファイルが失われた`);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test('(#85-11) 非既定プロファイル low-cost で upgrade が冪等（2回目で「すべて最新です」・世代が増えない）', async () => {
  await assertProfileIdempotent({ perf: 'low-cost', effort: 'normal', leaderModel: 'sonnet' });
});

test('(#85-12) 非既定プロファイル high-performance/deep でも upgrade が冪等', async () => {
  await assertProfileIdempotent({ perf: 'high-performance', effort: 'deep', leaderModel: 'fable' });
});

test('(#85-13) 保護された profile 対象の .new は実効テンプレート（プロファイル適用後）である', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-neweff-'));
  try {
    writeUnder(cwd, '.claude/ai-team-config.yml',
      'runtime: claude-code\nmodel_performance: low-cost\neffort_depth: normal\n');
    const rel = '.claude/teams/backend/agents/tech-lead.md';
    const newRel = `${rel}.new`;
    // ヘッダにマーカーを置き「カスタマイズ済み（保護）」にする（本体は上書きされない）。
    const customized = '# customized: true\n# 手編集した tech-lead\ncustom: true\n';
    writeUnder(cwd, rel, customized);

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // 本体は保護される
    assert.equal(readFileSync(join(cwd, rel), 'utf-8'), customized, '保護ファイル本体が上書きされた');
    // .new が書き出される
    assert.ok(existsSync(join(cwd, newRel)), '.new が書き出されていない');
    const newContent = readFileSync(join(cwd, newRel), 'utf-8');

    // 実効テンプレート = 生テンプレートに low-cost/normal を適用した内容
    const rawTemplate = readTemplate('teams/backend/agents/tech-lead.md');
    const effective = applyProfileToContent(rawTemplate, {
      performanceId: 'low-cost', effortId: 'normal', runtimeId: 'claude-code', kind: 'agent'
    }).content;

    // 生テンプレート leader=opus（balance 既定）と実効 low-cost=sonnet が異なることが、
    // 「.new が生ではなく実効である」ことを検証可能にする（恒等特異点を避ける）。
    assert.equal(frontmatterModel(rawTemplate), 'opus', '前提: 生テンプレートの leader は opus');
    assert.equal(frontmatterModel(effective), 'sonnet', '前提: low-cost の leader は sonnet');
    assert.notEqual(newContent, rawTemplate, '.new が生テンプレートのまま（プロファイル未適用のノイズを見せている）');
    assert.equal(newContent, effective, '.new が実効テンプレート（プロファイル適用後）と一致しない');
    assert.equal(frontmatterModel(newContent), 'sonnet', '.new の model が low-cost の sonnet になっていない');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#85-14) 非既定プロファイルでも --dry は無副作用（書き込み・バックアップ・.new なし）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-dryeff-'));
  try {
    writeUnder(cwd, '.claude/ai-team-config.yml',
      'runtime: claude-code\nmodel_performance: high-performance\neffort_depth: deep\n');
    const code = await runUpgrade(['backend', '--dry'], { cwd });
    assert.equal(code, 0, '--dry は正常終了すべき');
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '--dry で新規スキルが作られた');
    assert.ok(!existsSync(join(cwd, '.claude/teams/backend/agents/tech-lead.md')), '--dry で agent が作られた');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '--dry でバックアップが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

// ===========================================================================
// #85 差し戻し2: 読み込み経路の封じ込め（readModelProfileConfig）
//
// upgrade はテンプレート適用後に .claude/ai-team-config.yml のモデルプロファイルを
// 再適用する（readModelProfileConfig）。この設定ファイルが FIFO のとき readFileSync が
// プロセスごと同期ブロックしてハングし、try/catch では捕捉できない。書き込み側 inspectDest
// と対称に、読み込み前へ irregularFileType のガードを入れて弾く。
//
// FIFO の同期ハングはインプロセスのタイマでは計測できないため、別プロセス（spawn）+ 親からの
// SIGKILL で検証する。ガードを外すと子（runUpgrade）がハング → SIGKILL → 本テストが落ちる。
// ===========================================================================

const UPGRADE_MODULE = pathToFileURL(join(packageRoot, 'bin/lib/upgrade.js')).href;

/**
 * 別プロセスで runUpgrade を実行し、親のタイムアウトで SIGKILL する。
 * ガードが機能していれば子は完走する。ガードを外すと config の FIFO 読み込みで同期ブロック
 * してハングし、タイムアウトで SIGKILL される（hung=true）。
 *
 * @param {string} cwd 子プロセスの作業ディレクトリ
 * @param {number} timeoutMs 親のハング判定タイムアウト
 * @returns {Promise<{ hung: boolean, code: number|null, out: string }>}
 */
function runUpgradeInChild(cwd, timeoutMs = 15000) {
  const script = `
    const { runUpgrade } = await import(${JSON.stringify(UPGRADE_MODULE)});
    const code = await runUpgrade(['backend', '--yes'], { cwd: ${JSON.stringify(cwd)} });
    process.stdout.write('CHILD_DONE:' + code);
  `;
  return new Promise((res) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let hung = false;
    const timer = setTimeout(() => { hung = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code) => { clearTimeout(timer); res({ hung, code, out }); });
  });
}

test('(#85-18) ai-team-config.yml が FIFO のとき upgrade はハングせず既定プロファイルで続行する（別プロセス+SIGKILL・変異テスト）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-config-fifo-'));
  try {
    const cfgAbs = join(cwd, '.claude', 'ai-team-config.yml');
    mkdirSync(dirname(cfgAbs), { recursive: true });
    execFileSync('mkfifo', [cfgAbs]);
    assert.ok(lstatSync(cfgAbs).isFIFO(), '前提: config は FIFO であるべき');

    // 別プロセスで runUpgrade を実行。ガードがあれば config の read を回避して完走し、
    // 無ければ readModelProfileConfig の readFileSync(FIFO) で同期ブロックしてハングする。
    const r = await runUpgradeInChild(cwd);

    assert.ok(!r.hung,
      'FIFO config で upgrade がハングした（ガードが無い＝変異テストが検出すべき事象）');
    assert.ok(r.out.includes('CHILD_DONE:0'), `upgrade が正常終了していない:\n${r.out}`);
    assert.ok(r.out.includes('既定のモデルプロファイルを使います'),
      `FIFO config のスキップ警告が出ていない:\n${r.out}`);
    // 実処理が進んだこと（新規スキルの生成）＝安全側で続行したことの裏取り
    assert.ok(existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'FIFO config でも upgrade が実処理を続行したはず（コマンド未生成）');
    // config は FIFO のまま（読み書きで置き換えられていない）
    assert.ok(lstatSync(cfgAbs).isFIFO(), 'FIFO config が置き換えられた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-19) ai-team-config.yml がディレクトリのとき upgrade は生クラッシュせず既定プロファイルで続行する', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-upgrade-config-dir-'));
  try {
    const cfgAbs = join(cwd, '.claude', 'ai-team-config.yml');
    mkdirSync(cfgAbs, { recursive: true }); // config パスをディレクトリにする
    assert.ok(lstatSync(cfgAbs).isDirectory(), '前提: config はディレクトリであるべき');

    // ディレクトリは readFileSync が EISDIR を投げ、既存 try/catch が拾って既定になる（ハングは
    // しない）。ガードがあれば読まずに種別を明示する（この文言が変異テストの識別点）。
    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'ディレクトリ config でも upgrade は正常終了すべき');
    });

    assert.ok(out.includes('ai-team-config.yml が通常ファイルではない'),
      `ディレクトリ config のガード警告（種別明示）が出ていない:\n${out}`);
    assert.ok(existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'ディレクトリ config でも upgrade が実処理を続行したはず（コマンド未生成）');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------------------
// Issue #93: 3つ目の書き込み口である cwd/.gitignore（ensureGitignore）にも、通常ファイル
//   以外（ディレクトリ / FIFO / ソケット / デバイス）の検査を広げる。#84 は inspectDest /
//   inspectNew にしか一般化を入れず .gitignore を落とし、ディレクトリで EISDIR の生クラッシュ、
//   FIFO でプロセスごと無限ハングが起きていた（インシデント #4 教訓1: 書き込み経路を機械的に
//   全列挙する）。symlink（#86-R2-8）/ hardlink（#86-R2-14）の既存ガードに退行がないことも
//   併せて担保する。
//
// 検証規律（インシデント #4 教訓13 / #5）:
//   - ディレクトリ / ソケットは readFileSync が同期的に throw する（ハングしない）ため、
//     ガードを外すと runUpgrade が reject し、これらのインプロセステストは「落ちる」。
//     すなわち変異検出が効く（ハングはしない）。
//   - FIFO はガードを外すと writer 不在の read でプロセスごとハングする。インプロセスの
//     タイマでは同期ハングを捕捉できないため、必ず別プロセス（spawn）+ 親からの SIGKILL
//     デッドラインで計測する（#93-3）。ガードを外すと子がハング→デッドライン到達→SIGKILL で
//     code!==0 となり、テストが「落ちる」（ハングして固まらない）。
// ---------------------------------------------------------------------------

/**
 * setup.js の upgrade サブコマンドを「別プロセス」で起動し、親側の実時計デッドラインで監視する。
 *
 * 対象プロセスが同期 read でブロック（FIFO のハング）しても、この関数を呼ぶ親プロセス自身は
 * ブロックしていないため setTimeout が発火でき、SIGKILL で確実に停止させられる。同期ハングは
 * インプロセスの setTimeout / Promise.race では捕捉できない（コールバックがイベントループに
 * 載らない）ので、ハング検証は必ず別プロセスで測る（インシデント #4 教訓13）。
 *
 * 対象バイナリは packageRoot 直下の bin/setup.js に固定する（可変の作業ツリーを相対で指さない・
 * インシデント #5 追記）。timeout(1) 等の外部コマンドは使わない（この環境に存在せず exit 127 を
 * 「正常終了」と誤読するため・教訓13）。
 *
 * @param {string} cwd 実行時の作業ディレクトリ
 * @param {{ timeoutMs: number, args?: string[] }} opts
 * @returns {Promise<{ code: number|null, signal: string|null, timedOut: boolean, stdout: string, stderr: string, elapsedMs: number }>}
 */
function runUpgradeSubprocess(cwd, { timeoutMs, args = ['backend', '--yes'] }) {
  return new Promise((resolvePromise) => {
    const setupBin = join(packageRoot, 'bin', 'setup.js'); // 対象バイナリを固定
    const started = Date.now();
    // --yes を渡すため confirmProceed は stdin を読まない。stdin は無効化（'ignore'）してよい。
    const child = spawn(process.execPath, [setupBin, 'upgrade', ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      // ハング検証: writer 不在の FIFO read は SIGKILL でしか止まらない（SIGTERM では死なない）
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, timedOut, stdout, stderr, elapsedMs: Date.now() - started });
    });
  });
}

test('(#93-1) .gitignore がディレクトリのとき、EISDIR にせず追記スキップを明示し、適用は続行される', async () => {
  const cwd = makeProject(); // 古い workflow.yml（update）→ バックアップ経由で ensureGitignore に到達
  try {
    // .gitignore を「ディレクトリ」として作る（readFileSync が EISDIR で生クラッシュする経路）
    mkdirSync(join(cwd, '.gitignore'), { recursive: true });
    const sentinel = join(cwd, '.gitignore', 'inside.txt');
    writeFileSync(sentinel, 'ディレクトリ内の既存ファイル\n', 'utf-8');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'ディレクトリ .gitignore でも EISDIR で落ちず終了コード0で終わるべき');
    });

    // .gitignore はディレクトリのまま・中身も無傷（追記されていない）
    assert.ok(statSync(join(cwd, '.gitignore')).isDirectory(), 'ディレクトリ .gitignore が置き換えられた');
    assert.equal(
      readFileSync(sentinel, 'utf-8'), 'ディレクトリ内の既存ファイル\n',
      'ディレクトリ .gitignore 内のファイルが壊れた'
    );
    // 追記スキップの明示（通常ファイル以外・種別＝ディレクトリ）。
    // 「（ディレクトリ）」は fileTypeLabel（per-type 文言）でのみ現れる形＝実際に該当した証拠。
    assert.ok(out.includes('.gitignore が通常ファイルではない'), `ディレクトリ .gitignore のスキップ明示が無い:\n${out}`);
    assert.ok(out.includes('（ディレクトリ）'), `種別（ディレクトリ）が示されていない:\n${out}`);
    // 適用は続行される: workflow.yml が最新テンプレートへ更新され、グローバル対象が新規作成される
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      'ディレクトリ .gitignore のスキップに巻き込まれ workflow.yml が更新されなかった'
    );
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'ディレクトリ .gitignore のスキップに巻き込まれ、グローバル対象が新規作成されなかった（早期 return していないサニティ）'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#93-2) .gitignore が UNIX ドメインソケットのとき、生クラッシュせず追記スキップし、適用は続行される', async () => {
  const cwd = makeProject();
  const server = createServer();
  try {
    const sockPath = join(cwd, '.gitignore');
    await new Promise((res, rej) => { server.once('error', rej); server.listen(sockPath, res); });
    assert.ok(lstatSync(sockPath).isSocket(), '前提: .gitignore はソケットであるべき');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, 'ソケット .gitignore でも生クラッシュせず終了コード0で終わるべき');
    });

    assert.ok(lstatSync(sockPath).isSocket(), 'ソケット .gitignore が置き換えられた');
    assert.ok(out.includes('.gitignore が通常ファイルではない'), `ソケット .gitignore のスキップ明示が無い:\n${out}`);
    assert.ok(out.includes('（ソケット）'), `種別（ソケット）が示されていない:\n${out}`);
    // 適用は続行される
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      'ソケット .gitignore のスキップに巻き込まれ workflow.yml が更新されなかった'
    );
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'ソケット .gitignore のスキップに巻き込まれ、グローバル対象が新規作成されなかった'
    );
  } finally {
    await new Promise((res) => server.close(res));
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#93-3) .gitignore が FIFO のとき、別プロセス計測でハングせず追記スキップし、適用は続行される', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-gitignore-fifo-'));
  try {
    // makeProject 相当: 古い workflow.yml（update）を置き、ensureGitignore まで到達させる
    writeUnder(cwd, '.claude/teams/backend/workflow.yml', '# 古いバージョンのワークフロー\nsteps: []\n');
    // ツールが前回配置した内容として baseline に記録する。これが無いと #85 のハッシュ照合で
    // 「記録なし＝判定不能」となり保護に倒れ、update されない（本テストの関心は .gitignore の
    // FIFO スキップであって、baseline の保護判定ではない）。
    seedBaseline(cwd, ['.claude/teams/backend/workflow.yml']);
    // .gitignore を FIFO にする（Node に mkfifoSync は無いため mkfifo(1)・既存 #84 テストと同じ Unix 前提）
    execFileSync('mkfifo', [join(cwd, '.gitignore')]);
    assert.ok(lstatSync(join(cwd, '.gitignore')).isFIFO(), '前提: .gitignore は FIFO であるべき');

    // 別プロセス + 親側 SIGKILL デッドラインで計測（インプロセスのタイマでは同期ハングを捕捉できない）。
    // ガードがあれば FIFO を read せず即終了する。ガードを外すと writer 不在の read でハングし、
    // デッドライン到達→SIGKILL となって timedOut=true / code!==0 となり、下の assert が落ちる。
    const r = await runUpgradeSubprocess(cwd, { timeoutMs: 20000 });

    assert.equal(
      r.timedOut, false,
      `FIFO .gitignore でハングした（別プロセスが ${r.elapsedMs}ms でデッドライン到達・SIGKILL）:\n[stdout]\n${r.stdout}\n[stderr]\n${r.stderr}`
    );
    assert.equal(
      r.code, 0,
      `FIFO .gitignore でも終了コード0であるべき（signal=${r.signal}, elapsed=${r.elapsedMs}ms）:\n[stdout]\n${r.stdout}\n[stderr]\n${r.stderr}`
    );
    // 追記スキップの警告（通常ファイル以外・FIFO）が出ている
    assert.ok(r.stdout.includes('.gitignore が通常ファイルではない'), `FIFO .gitignore のスキップ警告が無い:\n${r.stdout}`);
    assert.ok(r.stdout.includes('FIFO（名前付きパイプ）'), `種別（FIFO）が示されていない:\n${r.stdout}`);
    // .gitignore は FIFO のまま（通常ファイルへ置換されていない）
    assert.ok(lstatSync(join(cwd, '.gitignore')).isFIFO(), 'FIFO .gitignore が置き換えられた');
    // 適用は続行される: workflow.yml が最新へ更新され、グローバル対象が新規作成される
    assert.equal(
      readFileSync(join(cwd, '.claude/teams/backend/workflow.yml'), 'utf-8'),
      readTemplate('teams/backend/workflow.yml'),
      'FIFO .gitignore のスキップに巻き込まれ workflow.yml が更新されなかった'
    );
    assert.ok(
      existsSync(join(cwd, '.claude/commands/ai-team-run.md')),
      'FIFO .gitignore のスキップに巻き込まれ、グローバル対象が新規作成されなかった（早期 return していないサニティ）'
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

test('(#93-4) 差分検査中の非 ENOENT な lstat 例外（ENOTDIR）を生スタックにせず整形して fail-closed で停止する（Issue #93 副次的な指摘）', async () => {
  const cwd = makeProject();
  try {
    // グローバル対象 .claude/agents/<...>.md の祖先 .claude/agents を「通常ファイル」にする。
    // すると diffTargets → inspectDest → firstSymlinkInPath が子要素を lstat した瞬間に ENOTDIR
    // を投げる（親がディレクトリでない）。lstatOrNull は ENOENT 以外を握らず再送出する（安全側）
    // ため、これが diffTargets 経由で runUpgrade まで伝播する。#84 の try/catch は列挙段階しか
    // 包んでいなかったため、この例外は生スタックトレースになっていた。本 fix で差分検査フェーズも
    // 整形して終了コード1で停止する。書き込み前なのでデータ損失は無い。
    // この検査は権限に依存せず（root でも）決定的に ENOTDIR を発生させる。
    writeUnder(cwd, '.claude/agents', 'これはディレクトリではなくファイル\n');
    const workflowPath = join(cwd, '.claude/teams/backend/workflow.yml');
    const before = readFileSync(workflowPath, 'utf-8');

    let code;
    const err = await captureStderr(async () => {
      code = await runUpgrade(['backend', '--yes'], { cwd });
    });
    assert.equal(code, 1, '差分検査の非 ENOENT 例外では終了コード1で停止するべき');
    // 整形された日本語メッセージが出ている（生スタックトレースではない）
    assert.ok(err.includes('差分の検査に失敗しました'), `整形メッセージが無い（生スタックの疑い）:\n${err}`);
    assert.ok(err.includes('ファイルは一切変更していません'), `fail-closed の明示が無い:\n${err}`);
    // 書き込み前に停止: 対象ファイル不変・バックアップ未作成・グローバル新規未作成
    assert.equal(readFileSync(workflowPath, 'utf-8'), before, '停止したのに対象ファイルが変更された');
    assert.ok(!existsSync(join(cwd, '.ai-team-backups')), '停止したのにバックアップが作られた');
    assert.ok(!existsSync(join(cwd, '.claude/commands/ai-team-run.md')), '停止したのに新規ファイルが作られた');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
