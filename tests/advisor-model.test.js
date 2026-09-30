/**
 * advisor のモデル設定（bin/lib/advisor-model.js・`setup.js advisor`）のテスト（Issue #115）
 *
 * すべて一時ディレクトリで行い、cwd / env（CLAUDE_CONFIG_DIR）/ homedir を引数で注入する。
 * 実際の ~/.claude・CLAUDE_CONFIG_DIR・このリポジトリの .claude/ には触れない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, linkSync, statSync, realpathSync, utimesSync, chmodSync, rmSync
} from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { runAdvisor, resolveRoot, makeEnv, gitState } from '../bin/lib/advisor-model.js';

// 実行者の git グローバル設定（core.excludesFile 等）でテストが変わらないようにする
process.env.GIT_CONFIG_GLOBAL = '/dev/null';
process.env.GIT_CONFIG_NOSYSTEM = '1';
// ~/.config/git/ignore（XDG の既定 excludes）も読ませない。HOME を空の一時ディレクトリへ差し替える
const ISOLATED_HOME = realpathSync(mkdtempSync(join(tmpdir(), 'advisor-test-home-')));
process.env.HOME = ISOLATED_HOME;
process.env.XDG_CONFIG_HOME = join(ISOLATED_HOME, 'xdg');
// CLAUDE_CONFIG_DIR も差し替える（各テストは env を注入するが、注入漏れでも実ユーザー設定を読まないため）
process.env.CLAUDE_CONFIG_DIR = join(ISOLATED_HOME, 'claude-config');
const LOCAL = '.claude/settings.local.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'advisor-test-')));
const G = ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid'];
const git = (cwd, ...a) => execFileSync('git', [...G, ...a], { cwd, stdio: 'pipe' });

/** git リポジトリ + 別のユーザー設定ディレクトリ + 別の HOME を用意する */
function setup({ init = true } = {}) {
  const base = tmp();
  const repo = join(base, 'repo');
  const home = join(base, 'home');
  const cfg = join(base, 'cfg');
  for (const d of [repo, home, cfg]) mkdirSync(d);
  if (init) { git(repo, 'init', '-q'); git(repo, 'commit', '-q', '--allow-empty', '-m', 'init'); }
  return { base, repo, home, cfg, env: { CLAUDE_CONFIG_DIR: cfg } };
}

function run(t, argv, cwd = t.repo, extra = {}) {
  const out = []; const err = [];
  const code = runAdvisor(argv, { cwd, env: t.env, homedir: t.home, out: s => out.push(s), err: s => err.push(s), ...extra });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const local = t => join(t.repo, '.claude', 'settings.local.json');
const writeJson = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof o === 'string' ? o : JSON.stringify(o, null, 2) + '\n'); };
const readJson = p => JSON.parse(readFileSync(p, 'utf-8'));
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');

test('1: R1 が無ければ新規作成する（2スペース整形・末尾改行）', () => {
  const t = setup();
  const r = run(t, ['apply', '--model', 'fable']);
  assert.equal(r.code, 0);
  assert.equal(readFileSync(local(t), 'utf-8'), '{\n  "advisorModel": "fable"\n}\n');
});

test('2: 既存キーを壊さずマージする（値・順序を保つ）', () => {
  const t = setup();
  const orig = { permissions: { allow: ['Bash(ls)'] }, hooks: { A: [1] }, env: { X: '1' } };
  writeJson(local(t), orig);
  assert.equal(run(t, ['apply', '--model', 'opus']).code, 0);
  const after = readJson(local(t));
  assert.deepEqual(after, { ...orig, advisorModel: 'opus' });
  assert.deepEqual(Object.keys(after), ['permissions', 'hooks', 'env', 'advisorModel']);
});

test('3: 冪等 — 同じ apply を2回しても2回目は書かない', () => {
  const t = setup();
  run(t, ['apply', '--model', 'fable']);
  const h = sha(local(t));
  utimesSync(local(t), 1000, 1000);
  const m = statSync(local(t)).mtimeMs;
  const r = run(t, ['apply', '--model', 'fable']);
  assert.equal(r.code, 0);
  assert.equal(sha(local(t)), h);
  assert.equal(statSync(local(t)).mtimeMs, m);
});

test('4: R1 に別の値 → 終了コード3でファイル不変、--overwrite で上書き', () => {
  const t = setup();
  writeJson(local(t), { advisorModel: 'opus', keep: true });
  const h = sha(local(t));
  const r = run(t, ['apply', '--model', 'fable']);
  assert.equal(r.code, 3);
  assert.match(r.err, /opus/);
  assert.equal(sha(local(t)), h);
  assert.equal(run(t, ['apply', '--model', 'fable', '--overwrite']).code, 0);
  assert.deepEqual(readJson(local(t)), { advisorModel: 'fable', keep: true });
});

test('5: R2/R3/R4 の別の値 → 終了コード3。--overwrite 後も R2/R3/R4 は不変', () => {
  const t = setup();
  const sub = join(t.repo, 'sub'); mkdirSync(sub);
  const r3 = join(sub, '.claude', 'settings.json');
  const r2 = join(sub, '.claude', 'settings.local.json');
  const r4 = join(t.cfg, 'settings.json');
  writeJson(r3, { advisorModel: 'opus' });
  writeJson(r2, { advisorModel: 'sonnet' });
  writeJson(r4, { advisorModel: 'haiku' });
  const before = [r2, r3, r4].map(sha);
  const r = run(t, ['apply', '--model', 'fable'], sub);
  assert.equal(r.code, 3);
  for (const k of ['R2', 'R3', 'R4']) assert.match(r.err, new RegExp(k));
  assert.equal(existsSync(join(t.repo, '.claude', 'settings.local.json')), false);
  assert.equal(run(t, ['apply', '--model', 'fable', '--overwrite'], sub).code, 0);
  assert.deepEqual([r2, r3, r4].map(sha), before);
  assert.equal(readJson(join(t.repo, '.claude', 'settings.local.json')).advisorModel, 'fable');
});

test('5b: R3 が読めない（壊れた JSON）ときも確認なしでは書かない', () => {
  const t = setup();
  writeJson(join(t.repo, '.claude', 'settings.json'), '{ broken');
  assert.equal(run(t, ['apply', '--model', 'fable']).code, 3);
  assert.equal(existsSync(local(t)), false);
});

test('5c: 同じ値だけが他にあるときは確認不要', () => {
  const t = setup();
  writeJson(join(t.cfg, 'settings.json'), { advisorModel: 'fable' });
  assert.equal(run(t, ['apply', '--model', 'fable']).code, 0);
});

test('6: CLAUDE_CONFIG_DIR 未設定なら <HOME>/.claude、設定時はその下だけを読む', () => {
  const t = setup();
  writeJson(join(t.home, '.claude', 'settings.json'), { advisorModel: 'opus' });
  writeJson(join(t.cfg, 'settings.json'), { advisorModel: 'sonnet' });
  const withEnv = JSON.parse(run(t, ['check', '--json']).out);
  const r4 = withEnv.sources.find(s => s.id === 'R4');
  assert.equal(r4.path, join(t.cfg, 'settings.json'));
  assert.equal(r4.value, 'sonnet');
  t.env = {};
  const noEnv = JSON.parse(run(t, ['check', '--json']).out);
  const r4b = noEnv.sources.find(s => s.id === 'R4');
  assert.equal(r4b.path, join(t.home, '.claude', 'settings.json'));
  assert.equal(r4b.value, 'opus');
});

test('7: unset はキーだけ削除し他を保つ。キーが無ければ書かない。空でもファイルは残す', () => {
  const t = setup();
  writeJson(local(t), { advisorModel: 'fable', keep: 1 });
  assert.equal(run(t, ['apply', '--model', 'unset']).code, 0);
  assert.deepEqual(readJson(local(t)), { keep: 1 });
  const h = sha(local(t));
  assert.equal(run(t, ['apply', '--model', 'unset']).code, 0);
  assert.equal(sha(local(t)), h);
  writeJson(local(t), { advisorModel: 'opus' });
  run(t, ['apply', '--model', 'unset']);
  assert.equal(readFileSync(local(t), 'utf-8'), '{}\n');
  const t2 = setup();
  assert.equal(run(t2, ['apply', '--model', 'unset']).code, 0);
  assert.equal(existsSync(local(t2)), false);
});

test('7b: unset 後に他の設定の値が残るときは、その値と場所を表示し変更しない', () => {
  const t = setup();
  writeJson(local(t), { advisorModel: 'fable' });
  const r4 = join(t.cfg, 'settings.json');
  writeJson(r4, { advisorModel: 'opus' });
  const h = sha(r4);
  const r = run(t, ['apply', '--model', 'unset']);
  assert.equal(r.code, 0);
  assert.match(r.out, /opus/);
  assert.equal(sha(r4), h);
});

test('8: R1 が壊れた JSON / 配列 → 終了コード4でバイト列不変', () => {
  for (const bad of ['{ broken', '[1,2]']) {
    const t = setup();
    writeJson(local(t), bad);
    const h = sha(local(t));
    assert.equal(run(t, ['apply', '--model', 'fable']).code, 4);
    assert.equal(run(t, ['apply', '--model', 'unset']).code, 4);
    assert.equal(sha(local(t)), h);
  }
});

test('9: パス解決 — サブフォルダ・worktree・git 外・ルートが HOME', () => {
  const t = setup();
  const sub = join(t.repo, 'a', 'b'); mkdirSync(sub, { recursive: true });
  const env = cwd => makeEnv({ cwd, env: t.env, homedir: t.home });
  assert.equal(resolveRoot(env(sub)), t.repo);
  const wt = join(t.base, 'wt');
  git(t.repo, 'worktree', 'add', '-q', '-b', 'wt', wt);
  assert.equal(resolveRoot(env(wt)), t.repo);
  const nogit = join(t.base, 'nogit'); mkdirSync(nogit);
  assert.equal(resolveRoot(env(nogit)), nogit);
  assert.equal(resolveRoot(makeEnv({ cwd: t.repo, env: t.env, homedir: t.repo })), t.repo);
  const inner = join(t.repo, 'x'); mkdirSync(inner);
  assert.equal(resolveRoot(makeEnv({ cwd: inner, env: t.env, homedir: t.repo })), inner, 'ルートが HOME なら cwd');
  assert.equal(resolveRoot(makeEnv({ cwd: inner, env: t.env, homedir: t.home, platform: 'win32' })), inner, 'Windows は cwd');
  assert.equal(resolveRoot(makeEnv({ cwd: inner, env: t.env, homedir: t.home, uid: process.getuid() + 1 })), inner, '所有者違いは cwd');
});

test('9b: サブフォルダから apply するとルートに書き、cwd には書かない。worktree でも本体側', () => {
  const t = setup();
  const sub = join(t.repo, 'sub'); mkdirSync(sub);
  const r = run(t, ['apply', '--model', 'fable'], sub);
  assert.equal(r.code, 0);
  assert.match(r.out, /リポジトリのルート/);
  assert.equal(existsSync(local(t)), true);
  assert.equal(existsSync(join(sub, '.claude')), false);
  const wt = join(t.base, 'wt2');
  git(t.repo, 'worktree', 'add', '-q', '-b', 'wt2', wt);
  const t2 = setup(); // 別リポジトリで worktree から新規に書く
  const wt3 = join(t2.base, 'wt3');
  git(t2.repo, 'worktree', 'add', '-q', '-b', 'wt3', wt3);
  assert.equal(run(t2, ['apply', '--model', 'opus'], wt3).code, 0);
  assert.equal(existsSync(join(wt3, '.claude', 'settings.local.json')), false);
  assert.equal(readJson(local(t2)).advisorModel, 'opus');
});

test('10: CLI（spawn）は一時 dir にだけ書き、パッケージルートは不変', () => {
  const t = setup();
  const pkgLocal = join(packageRoot, LOCAL);
  const before = existsSync(pkgLocal) ? sha(pkgLocal) : null;
  const r = spawnSync(process.execPath, [join(packageRoot, 'bin', 'setup.js'), 'advisor', 'apply', '--model', 'fable'], {
    cwd: t.repo, encoding: 'utf-8', env: { ...process.env, CLAUDE_CONFIG_DIR: t.cfg, HOME: t.home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readJson(local(t)).advisorModel, 'fable');
  assert.equal(existsSync(pkgLocal) ? sha(pkgLocal) : null, before);
});

test('11: --model が不正なら終了コード2', () => {
  const t = setup();
  for (const m of ['sonnet', undefined]) {
    const argv = m ? ['apply', '--model', m] : ['apply'];
    assert.equal(run(t, argv).code, 2);
  }
  assert.equal(run(t, ['apply', '--model', 'fable', '--bogus']).code, 2);
  assert.equal(existsSync(local(t)), false);
});

test('12: シンボリックリンク・ハードリンクへは書かない（.gitignore も）', () => {
  const t = setup();
  const target = join(t.base, 'target.json'); writeJson(target, { x: 1 });
  mkdirSync(join(t.repo, '.claude'));
  symlinkSync(target, local(t));
  assert.equal(run(t, ['apply', '--model', 'fable']).code, 4);
  assert.deepEqual(readJson(target), { x: 1 });

  const t2 = setup();
  const real2 = join(t2.base, 'real-claude'); mkdirSync(real2);
  symlinkSync(real2, join(t2.repo, '.claude'));
  assert.equal(run(t2, ['apply', '--model', 'fable']).code, 4);
  assert.equal(existsSync(join(real2, 'settings.local.json')), false);

  const t3 = setup();
  const other = join(t3.base, 'other.json'); writeJson(other, { y: 1 });
  mkdirSync(join(t3.repo, '.claude'));
  linkSync(other, local(t3));
  assert.equal(run(t3, ['apply', '--model', 'fable']).code, 4);
  assert.deepEqual(readJson(other), { y: 1 });

  const t4 = setup();
  const gi = join(t4.base, 'gi-target'); writeFileSync(gi, 'keep\n');
  symlinkSync(gi, join(t4.repo, '.gitignore'));
  const r = run(t4, ['apply', '--model', 'fable', '--gitignore']);
  assert.equal(r.code, 4);
  assert.equal(readFileSync(gi, 'utf-8'), 'keep\n');
  // 終了コード4 は「何も書いていない」。個人設定も .claude/ も作られていないこと（必須2・Y1）
  assert.equal(existsSync(local(t4)), false);
  assert.equal(existsSync(join(t4.repo, '.claude')), false);
});

test('13: git 状態の判定と --gitignore の追記（2回実行しても1回分）', () => {
  const t = setup();
  assert.equal(gitState(t.repo), 'not-ignored');
  assert.equal(run(t, ['apply', '--model', 'fable', '--gitignore']).code, 0);
  assert.equal(gitState(t.repo), 'ignored');
  run(t, ['apply', '--model', 'fable', '--gitignore']);
  const gi = readFileSync(join(t.repo, '.gitignore'), 'utf-8');
  assert.equal(gi.split('\n').filter(l => l === '.claude/settings.local.json').length, 1);

  const t2 = setup();
  writeJson(local(t2), { a: 1 });
  git(t2.repo, 'add', '-f', '.claude/settings.local.json');
  git(t2.repo, 'commit', '-q', '-m', 'track');
  assert.equal(gitState(t2.repo), 'tracked');
  const r = run(t2, ['apply', '--model', 'fable', '--gitignore']);
  assert.match(r.out, /追跡/);
  assert.equal(existsSync(join(t2.repo, '.gitignore')), false);

  const t3 = setup({ init: false });
  assert.equal(gitState(t3.repo), 'not-git');
  assert.equal(run(t3, ['apply', '--model', 'fable', '--gitignore']).code, 0);
  assert.equal(existsSync(join(t3.repo, '.gitignore')), false);
});

test('14: --dry は何も書かない', () => {
  const t = setup();
  const r = run(t, ['apply', '--model', 'fable', '--gitignore', '--dry']);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry/);
  assert.equal(existsSync(join(t.repo, '.claude')), false);
  assert.equal(existsSync(join(t.repo, '.gitignore')), false);
});

test('15: 決定6 — high-performance では opus を拒否（--profile / config 両方）。fable・unset は可', () => {
  const t = setup();
  assert.equal(run(t, ['apply', '--model', 'opus', '--profile', 'high-performance']).code, 2);
  assert.equal(existsSync(local(t)), false);
  writeJson(join(t.repo, '.claude', 'ai-team-config.yml'), 'model_performance: high-performance\n');
  assert.equal(run(t, ['apply', '--model', 'opus']).code, 2);
  assert.equal(run(t, ['apply', '--model', 'opus', '--profile', 'balance']).code, 0, '--profile が config に優先');
  assert.equal(run(t, ['apply', '--model', 'fable', '--overwrite']).code, 0);
  assert.equal(run(t, ['apply', '--model', 'unset']).code, 0);
});

test('16: 既存 opus + high-performance は check が profileConflict を返し、fable への変更は確認を要する', () => {
  const t = setup();
  writeJson(join(t.cfg, 'settings.json'), { advisorModel: 'opus' });
  const c = JSON.parse(run(t, ['check', '--json', '--profile', 'high-performance']).out);
  assert.equal(c.profileConflict, true);
  assert.equal(run(t, ['apply', '--model', 'fable', '--profile', 'high-performance']).code, 3);
  assert.equal(JSON.parse(run(t, ['check', '--json', '--profile', 'balance']).out).profileConflict, false);
});

test('17: check は何も書かず、実効値は R1 > R2 > R3 > R4 の順', () => {
  const t = setup();
  writeJson(join(t.repo, '.claude', 'settings.json'), { advisorModel: 'opus' });
  writeJson(join(t.cfg, 'settings.json'), { advisorModel: 'sonnet' });
  let c = JSON.parse(run(t, ['check', '--json']).out);
  assert.equal(c.effective.value, 'opus');
  assert.equal(c.git, 'not-ignored');
  writeJson(local(t), { advisorModel: 'fable' });
  c = JSON.parse(run(t, ['check', '--json']).out);
  assert.equal(c.effective.value, 'fable');
  assert.equal(existsSync(join(t.repo, '.gitignore')), false);
});

test('18: どの操作でも R3/R4 のバイト列は不変（fable・opus・unset・--overwrite・--gitignore）', () => {
  const t = setup();
  const r3 = join(t.repo, '.claude', 'settings.json');
  const r4 = join(t.cfg, 'settings.json');
  writeJson(r3, { advisorModel: 'opus', z: 1 });
  writeJson(r4, { advisorModel: 'opus', y: 2 });
  const before = [sha(r3), sha(r4)];
  for (const a of [['fable', '--overwrite', '--gitignore'], ['unset'], ['fable', '--overwrite']]) {
    run(t, ['apply', '--model', ...a]);
  }
  assert.deepEqual([sha(r3), sha(r4)], before);
});

// ---------------------------------------------------------------------------
// 差し戻し 1/2 の対応（Issue #115・インシデント #12）
// ---------------------------------------------------------------------------

const CLI = join(packageRoot, 'bin', 'setup.js');
const TIME_LIMIT_MS = 4000;

/** 別プロセスで実行し、親から SIGKILL で時間制限する（同期ハングはインプロセスのタイマでは捕捉できない） */
function spawnLimited(args, t, cwd = t.repo) {
  const r = spawnSync(process.execPath, args, {
    cwd, encoding: 'utf-8', timeout: TIME_LIMIT_MS, killSignal: 'SIGKILL',
    env: { ...process.env, CLAUDE_CONFIG_DIR: t.cfg, HOME: t.home },
  });
  return { hung: r.signal === 'SIGKILL', status: r.status, out: r.stdout ?? '', err: r.stderr ?? '' };
}
const cli = (t, argv, cwd) => spawnLimited([CLI, 'advisor', ...argv], t, cwd);
const mkfifo = p => { mkdirSync(dirname(p), { recursive: true }); execFileSync('mkfifo', [p]); };

test('19: 制御群 — FIFO を読む処理は本当にハングし、時間制限（SIGKILL）で止められる', () => {
  const t = setup();
  const fifo = join(t.base, 'control.fifo'); mkfifo(fifo);
  const r = spawnLimited(['-e', `require('fs').readFileSync(${JSON.stringify(fifo)})`], t);
  assert.equal(r.hung, true, 'この検証環境では FIFO の同期読み取りがハングし、SIGKILL で止まる');
});

// 読み取り経路ごとに、次の3点を対にして固定する（教訓13・16）。
//  (1) 通常ファイルの双子: 処理がそのパスに到達して読むこと（check の出力に値が出る）
//  (2) FIFO: 時間内に終わり、決められた終了コードで、ファイルの状態が変わらないこと
//  (3) 制御群: 同じ FIFO をそのまま読む別プロセスは実際に kill されること（上の19 と併せて）
const readPaths = [
  { id: 'R1', cwdSub: false, path: t => join(t.repo, '.claude', 'settings.local.json'), applyCode: 4 },
  { id: 'R2', cwdSub: true, path: t => join(t.repo, 'sub', '.claude', 'settings.local.json'), applyCode: 3 },
  { id: 'R3', cwdSub: false, path: t => join(t.repo, '.claude', 'settings.json'), applyCode: 3 },
  { id: 'R4', cwdSub: false, path: t => join(t.cfg, 'settings.json'), applyCode: 3 },
];
for (const rp of readPaths) {
  test(`20-${rp.id}: ${rp.id} が FIFO でも check / apply は止まらない（双子・制御群と対）`, () => {
    const t = setup();
    const sub = join(t.repo, 'sub'); mkdirSync(sub);
    const cwd = rp.cwdSub ? sub : t.repo;
    const p = rp.path(t);
    // (1) 通常ファイルの双子: このパスが実際に読まれる（R3 は cwd の .claude、R2 は cwd≠root のときだけ）
    writeJson(p, { advisorModel: 'sonnet' });
    const twin = cli(t, ['check', '--json'], cwd);
    assert.equal(twin.hung, false);
    const src = JSON.parse(twin.out).sources.find(s => s.id === rp.id);
    assert.equal(src.path, p, `${rp.id} の読み取り先`);
    assert.equal(src.value, 'sonnet', '処理がこのパスに到達して読んだ');
    rmSync(p);
    // (3) 制御群: 同じパスを FIFO にして、素朴に読むとハングする
    mkfifo(p);
    const control = spawnLimited(['-e', `require('fs').readFileSync(${JSON.stringify(p)})`], t);
    assert.equal(control.hung, true, '制御群は kill される');
    // (2) FIFO のまま check / apply
    const chk = cli(t, ['check'], cwd);
    assert.equal(chk.hung, false, 'check が止まらない');
    assert.equal(chk.status, 0);
    assert.match(chk.out, /通常ファイルではない/);
    const dry = cli(t, ['apply', '--model', 'fable', '--dry'], cwd);
    assert.equal(dry.hung, false, 'apply が止まらない');
    assert.equal(dry.status, rp.applyCode);
    const real = cli(t, ['apply', '--model', 'fable', '--gitignore'], cwd);
    assert.equal(real.hung, false);
    assert.equal(real.status, rp.applyCode);
    // 拒否・要確認のときは何も書かれていない
    assert.equal(existsSync(join(t.repo, '.gitignore')), false);
    if (rp.id !== 'R1') assert.equal(existsSync(join(t.repo, '.claude', 'settings.local.json')), false);
    assert.equal(statSync(p).isFIFO(), true, 'FIFO はそのまま');
  });
}

test('20-config: ai-team-config.yml が FIFO でも止まらない（警告つき）。双子で到達を確認', () => {
  const t = setup();
  const p = join(t.repo, '.claude', 'ai-team-config.yml');
  writeJson(p, 'model_performance: "high-performance"  # 引用符つき\n');
  const twin = cli(t, ['apply', '--model', 'opus', '--dry']);
  assert.equal(twin.status, 2, '双子: config を読んで決定6 で opus を拒否（引用符つきの値も読める）');
  rmSync(p);
  mkfifo(p);
  assert.equal(spawnLimited(['-e', `require('fs').readFileSync(${JSON.stringify(p)})`], t).hung, true, '制御群');
  const chk = cli(t, ['check', '--json']);
  assert.equal(chk.hung, false);
  assert.equal(chk.status, 0);
  const c = JSON.parse(chk.out);
  assert.equal(c.profile, null);
  assert.match(c.warnings.join('\n'), /通常ファイルではない/);
  const dry = cli(t, ['apply', '--model', 'fable', '--dry']);
  assert.equal(dry.hung, false);
  assert.equal(dry.status, 0);
  assert.match(dry.out, /警告/);
  assert.equal(existsSync(local(t)), false);
});

test('20-symlink: 設定ファイルが FIFO へのシンボリックリンクでも止まらない', () => {
  const t = setup();
  const fifo = join(t.base, 'target.fifo'); mkfifo(fifo);
  mkdirSync(join(t.repo, '.claude'));
  symlinkSync(fifo, join(t.repo, '.claude', 'settings.json'));
  const chk = cli(t, ['check']);
  assert.equal(chk.hung, false);
  assert.equal(chk.status, 0);
  assert.match(chk.out, /通常ファイルではない/);
});

test('21: .gitignore が読み取り専用 → 終了コード5、個人設定は作られない（Y2）', { skip: process.getuid?.() === 0 }, () => {
  const t = setup();
  const gi = join(t.repo, '.gitignore');
  writeFileSync(gi, 'keep\n'); chmodSync(gi, 0o444);
  const r = run(t, ['apply', '--model', 'fable', '--gitignore']);
  assert.equal(r.code, 5);
  assert.equal(existsSync(local(t)), false);
  assert.equal(existsSync(join(t.repo, '.claude')), false);
  assert.equal(readFileSync(gi, 'utf-8'), 'keep\n');
  assert.match(r.err, /何も書いていません/);
});

test('21b: .gitignore は追記できたが個人設定を書けなかった → 終了コード5と、追記済みの明示', { skip: process.getuid?.() === 0 }, () => {
  const t = setup();
  const dir = join(t.repo, '.claude'); mkdirSync(dir); chmodSync(dir, 0o555); // 検査は通るが書けない
  try {
    const r = run(t, ['apply', '--model', 'fable', '--gitignore']);
    assert.equal(r.code, 5);
    assert.match(r.err, /\.gitignore は追記済み/);
    assert.match(readFileSync(join(t.repo, '.gitignore'), 'utf-8'), /\.claude\/settings\.local\.json/);
    assert.equal(existsSync(local(t)), false);
  } finally { chmodSync(dir, 0o755); }
});

test('21c: .claude が通常ファイル（ENOTDIR）でも例外で落ちず、何も書かない', () => {
  const t = setup();
  writeFileSync(join(t.repo, '.claude'), 'x');
  const r = run(t, ['apply', '--model', 'fable']);
  assert.equal(r.code, 5);
  assert.match(r.err, /何も書いていません/);
  assert.equal(existsSync(join(t.repo, '.gitignore')), false);
});

/** 決定7 の状態: R1 あり（advisorModel なし）・Git 管理外になっていない */
function d7() {
  const t = setup();
  writeJson(local(t), { keep: 1 });
  utimesSync(local(t), 1000, 1000);
  return t;
}

test('22: 決定7 — gitignore だけ追記。R1 のバイト列・更新時刻は不変、advisorModel は書かれない。2回でも1回分', () => {
  const t = d7();
  const h = sha(local(t)); const m = statSync(local(t)).mtimeMs;
  assert.equal(gitState(t.repo), 'not-ignored');
  const r = run(t, ['gitignore']);
  assert.equal(r.code, 0);
  assert.equal(gitState(t.repo), 'ignored');
  assert.equal(run(t, ['gitignore']).code, 0);
  const gi = readFileSync(join(t.repo, '.gitignore'), 'utf-8');
  assert.equal(gi.split('\n').filter(l => l === '.claude/settings.local.json').length, 1);
  assert.equal(sha(local(t)), h);
  assert.equal(statSync(local(t)).mtimeMs, m);
  assert.equal('advisorModel' in readJson(local(t)), false);
});

test('22b: 決定7 — .gitignore がシンボリックリンクなら終了コード4で R1 もリンク先も不変', () => {
  const t = d7();
  const target = join(t.base, 'gi-target'); writeFileSync(target, 'keep\n');
  symlinkSync(target, join(t.repo, '.gitignore'));
  const h = sha(local(t)); const m = statSync(local(t)).mtimeMs;
  assert.equal(run(t, ['gitignore']).code, 4);
  assert.equal(readFileSync(target, 'utf-8'), 'keep\n');
  assert.equal(sha(local(t)), h);
  assert.equal(statSync(local(t)).mtimeMs, m);
});

test('22c: 決定7 — tracked は警告だけ、not-git は何もしない、--dry は何も書かない、R1 が無ければ何もしない', () => {
  const t = d7();
  git(t.repo, 'add', '-f', '.claude/settings.local.json'); git(t.repo, 'commit', '-q', '-m', 'track');
  const r = run(t, ['gitignore']);
  assert.equal(r.code, 0);
  assert.match(r.out, /追跡/);
  assert.equal(existsSync(join(t.repo, '.gitignore')), false);

  const t2 = setup({ init: false });
  writeJson(local(t2), { keep: 1 });
  assert.equal(run(t2, ['gitignore']).code, 0);
  assert.equal(existsSync(join(t2.repo, '.gitignore')), false);

  const t3 = d7();
  const r3 = run(t3, ['gitignore', '--dry']);
  assert.equal(r3.code, 0);
  assert.match(r3.out, /dry/);
  assert.equal(existsSync(join(t3.repo, '.gitignore')), false);

  const t4 = setup();
  const r4 = run(t4, ['gitignore']);
  assert.equal(r4.code, 0);
  assert.equal(existsSync(join(t4.repo, '.gitignore')), false);
  assert.equal(existsSync(join(t4.repo, '.claude')), false);
});

test('22d: 決定7 — .gitignore が読み取り専用なら終了コード5で R1 不変', { skip: process.getuid?.() === 0 }, () => {
  const t = d7();
  const gi = join(t.repo, '.gitignore'); writeFileSync(gi, 'keep\n'); chmodSync(gi, 0o444);
  const h = sha(local(t));
  assert.equal(run(t, ['gitignore']).code, 5);
  assert.equal(sha(local(t)), h);
  assert.equal(readFileSync(gi, 'utf-8'), 'keep\n');
});

test('23: 値を取るオプションの検証 — 値なし・`--` 始まり・空・未知の profile は終了コード2で何も書かない', () => {
  const t = setup();
  const bad = [
    ['apply', '--model', 'fable', '--profile', '--dry'],   // --dry を値として飲み込まない（Z1）
    ['apply', '--model', 'fable', '--profile'],
    ['apply', '--model', 'opus', '--profile', ''],         // 空文字で決定6 をすり抜けない（Z2）
    ['apply', '--model', 'opus', '--profile', 'ハイパフォーマンス'], // 表示名（Z3）
    ['apply', '--model', 'opus', '--profile', 'high_performance'],   // 打ち間違い（Z4）
    ['apply', '--model', '--dry'],
    ['check', '--profile', 'nope'],
  ];
  for (const argv of bad) {
    const r = run(t, argv);
    assert.equal(r.code, 2, argv.join(' '));
  }
  assert.equal(existsSync(join(t.repo, '.claude')), false);
  assert.equal(run(t, ['apply', '--model', 'fable', '--profile', 'balance', '--dry']).code, 0);
  assert.equal(run(t, ['apply', '--model', 'opus', '--profile', 'high-performance']).code, 2);
});

test('24: 逸脱1 — R1 がすでに選んだ値なら、他に別の値があっても確認せず、書かず、隠れた値を表示', () => {
  const t = setup();
  writeJson(local(t), { advisorModel: 'fable' });
  const r4 = join(t.cfg, 'settings.json'); writeJson(r4, { advisorModel: 'opus' });
  const h = sha(local(t)); const h4 = sha(r4);
  utimesSync(local(t), 1000, 1000); const m = statSync(local(t)).mtimeMs;
  const r = run(t, ['apply', '--model', 'fable']);
  assert.equal(r.code, 0);
  assert.match(r.out, /変更なし/);
  assert.match(r.out, /R4/);
  assert.match(r.out, /opus/);
  assert.equal(sha(local(t)), h);
  assert.equal(statSync(local(t)).mtimeMs, m);
  assert.equal(sha(r4), h4);
});

test('25: check は --profile なしで config から性能を読む。完全なモデル ID の opus も profileConflict', () => {
  const t = setup();
  writeJson(join(t.repo, '.claude', 'ai-team-config.yml'), 'runtime: claude-code\nmodel_performance: high-performance\n');
  writeJson(join(t.cfg, 'settings.json'), { advisorModel: 'claude-opus-4-1' });
  const c = JSON.parse(run(t, ['check', '--json']).out);
  assert.equal(c.profile, 'high-performance');
  assert.equal(c.profileConflict, true);
  writeJson(join(t.repo, '.claude', 'ai-team-config.yml'), 'model_performance: balance\n');
  assert.equal(JSON.parse(run(t, ['check', '--json']).out).profileConflict, false);
});

test('26: unset は、書く必要が無いとき（advisorModel が無い）ハードリンクでも拒否しない', () => {
  const t = setup();
  const other = join(t.base, 'other.json'); writeJson(other, { y: 1 });
  mkdirSync(join(t.repo, '.claude'));
  linkSync(other, local(t));
  const r = run(t, ['apply', '--model', 'unset']);
  assert.equal(r.code, 0);
  assert.deepEqual(readJson(other), { y: 1 });
});
