/**
 * advisor のモデル（settings の advisorModel）を読み書きするユーティリティ（Issue #115）。
 *
 * advisor のモデルはエージェント / スキルの frontmatter では指定できず、Claude Code の settings の
 * `advisorModel` だけで指定できる。setup は個人設定 `.claude/settings.local.json` に書き込む。
 *
 * 基準の定義（公式 settings ページ「Where Claude Code keeps the local file in a git repository」）:
 *   - cwd  = 実行したフォルダ
 *   - root = git リポジトリのルート（worktree では本体側のルート）。
 *            git 外・root が HOME・Windows・root / root/.git / root/.claude の所有者が実行ユーザーでない
 *            場合は cwd
 *   - userDir = CLAUDE_CONFIG_DIR があればそれ、無ければ <HOME>/.claude
 *
 * 読み取り経路（既存値の確認対象）:
 *   R1 <root>/.claude/settings.local.json   個人設定（書き込み先と同じ）
 *   R2 <cwd>/.claude/settings.local.json    旧版が起動フォルダへ置いたもの（cwd≠root のときだけ。変更しない）
 *   R3 <cwd>/.claude/settings.json          共有プロジェクト設定（変更しない）
 *   R4 <userDir>/settings.json              ユーザー設定（変更しない）
 * 書き込み経路:
 *   W1 <root>/.claude/ の作成 / W2 <root>/.claude/settings.local.json / W3 <root>/.gitignore の追記
 *
 * 読み取りは、読む前に通常ファイルかを確かめる（FIFO の readFileSync は同期でブロックし、try/catch では
 * 捕まえられない。インシデント #4 教訓15・#12。bin/lib/upgrade.js:159-161 と同じ）。
 * 書き込みは、失敗しうる判定（リンク検査・書き込み可否）をすべて済ませてから始める（#12）。
 *
 * 環境（cwd / env / homedir / uid / platform）は引数で注入できる。テストが実ユーザー設定に触れないため。
 */

import {
  existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, realpathSync
} from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { homedir as osHomedir } from 'os';
import { execFileSync } from 'child_process';

import { firstSymlinkInPath, hardlinkNlink, irregularFileType, fileTypeLabel } from './link-safety.js';
import { PERFORMANCE_PROFILES } from './model-profiles.js';

export const LOCAL_REL = '.claude/settings.local.json';
export const MODELS = ['fable', 'opus'];
// FAILED(5): 想定外の例外・書き込みの失敗。出力に「どこまで書いたか」を必ず示す
export const EXIT = { OK: 0, USAGE: 2, NEED_CONFIRM: 3, REFUSED: 4, FAILED: 5 };
const GITIGNORE_BLOCK = '\n# @trimix/ai-team - 個人設定（advisor のモデルなど）\n.claude/settings.local.json\n';

/** 実行環境の既定値を補う（テストは全項目を注入する） */
export function makeEnv(overrides = {}) {
  const env = overrides.env ?? process.env;
  return {
    cwd: overrides.cwd ?? process.cwd(),
    env,
    homedir: overrides.homedir ?? osHomedir(),
    uid: 'uid' in overrides ? overrides.uid : (typeof process.getuid === 'function' ? process.getuid() : null),
    platform: overrides.platform ?? process.platform,
  };
}

// git が想定外に止まっても戻れるようにする時間制限（ミリ秒）。通常の git 呼び出しは数十ミリ秒で終わる
const GIT_TIMEOUT_MS = 5000;

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: GIT_TIMEOUT_MS }).trim();
}

function real(p) {
  try { return realpathSync(p); } catch { return resolve(p); }
}

/** git のルート（worktree でも本体側）。git 外なら null */
function gitRoot(cwd) {
  try {
    const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
    if (basename(common) === '.git') return dirname(common);
  } catch { /* git 2.31 未満・git 外 → show-toplevel へ */ }
  try {
    return git(cwd, ['rev-parse', '--show-toplevel']);
  } catch {
    return null;
  }
}

function ownedByUser(path, uid) {
  if (uid === null) return true;
  try { return statSync(path).uid === uid; } catch { return true; } // 無いものは検査しない
}

/** settings.local.json を置くルート。公式の例外に当たれば cwd */
export function resolveRoot(e) {
  const cwd = real(e.cwd);
  const root = gitRoot(cwd);
  if (root === null) return cwd;
  const r = real(root);
  if (e.platform === 'win32' || r === real(e.homedir)) return cwd;
  const owned = [r, join(r, '.git'), join(r, '.claude')].every(p => ownedByUser(p, e.uid));
  return owned ? r : cwd;
}

/**
 * 読んでよい通常ファイルでなければ、種別の日本語ラベルを返す（読んでよければ null）。
 * irregularFileType は lstat なので、シンボリックリンクの先が FIFO のものは stat で追加確認する。
 */
function notReadableFile(path) {
  try {
    const irr = irregularFileType(path);
    if (irr) return fileTypeLabel(irr.fileType);
    const st = statSync(path);
    return st.isFile() ? null : (st.isDirectory() ? 'ディレクトリ' : '通常ファイル以外の実体');
  } catch (err) {
    return `状態を確認できません: ${err.code ?? err.message}`;
  }
}

/** 設定ファイル1つを読む。{ path, exists, value, error } */
export function readSetting(path) {
  if (!existsSync(path)) return { path, exists: false, value: undefined, error: null };
  const bad = notReadableFile(path);
  if (bad) return { path, exists: true, value: undefined, error: `通常ファイルではない（${bad}）ため読みません`, obj: undefined };
  try {
    const obj = JSON.parse(readFileSync(path, 'utf-8'));
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
      return { path, exists: true, value: undefined, error: 'JSON オブジェクトではありません', obj: undefined };
    }
    return { path, exists: true, value: obj.advisorModel, error: null, obj };
  } catch (err) {
    return { path, exists: true, value: undefined, error: `読めません（${err.message}）`, obj: undefined };
  }
}

/** 読み取り経路 R1〜R4 の一覧（優先順）。同じパスは1回だけ */
export function collectSources(e, root) {
  const cwd = real(e.cwd);
  const userDir = e.env.CLAUDE_CONFIG_DIR || join(e.homedir, '.claude');
  const list = [{ id: 'R1', label: '個人設定（.claude/settings.local.json）', path: join(root, LOCAL_REL) }];
  if (root !== cwd) list.push({ id: 'R2', label: '旧位置の個人設定', path: join(cwd, LOCAL_REL) });
  list.push({ id: 'R3', label: '共有プロジェクト設定（.claude/settings.json）', path: join(cwd, '.claude', 'settings.json') });
  list.push({ id: 'R4', label: 'ユーザー設定', path: join(userDir, 'settings.json') });
  const seen = new Set();
  return list.filter(s => !seen.has(s.path) && seen.add(s.path))
    .map(s => ({ ...s, ...readSetting(s.path) }));
}

/** git 実行が時間制限で打ち切られた例外か */
function timedOut(err) {
  return err?.code === 'ETIMEDOUT' || err?.signal === 'SIGTERM';
}

/**
 * `git check-ignore` が読みうる無視ファイルの一覧（インシデント #12・教訓13: 読み取り経路の全列挙）。
 *  - 作業ツリーの最上位から `.claude/` までの各ディレクトリの `.gitignore`（通常は <root>/.gitignore と <root>/.claude/.gitignore。
 *    ルートが git の最上位でないとき〔所有者が違うなどで cwd にフォールバックしたサブフォルダ〕は途中の階層も読まれる）
 *  - `.git/info/exclude`（worktree では共通 git ディレクトリ側）
 *  - core.excludesFile の指す先（未設定なら既定の $XDG_CONFIG_HOME/git/ignore、無ければ ~/.config/git/ignore）
 * 実測（git 2.50.1）で、上の5種類のどれが FIFO でも check-ignore は止まる。検査しないのは、
 * 作業ツリーの外にある他リポジトリ・ルートより下（.claude/ 以外）の `.gitignore`（このパスの判定では読まれない）。
 */
export function gitIgnoreSources(root) {
  const dirs = [];
  let d = root;
  for (;;) {
    dirs.push(d);
    if (existsSync(join(d, '.git')) || dirname(d) === d) break;
    d = dirname(d);
  }
  const paths = dirs.reverse().map(x => join(x, '.gitignore'));
  paths.push(join(root, '.claude', '.gitignore'));
  try { paths.push(resolve(root, git(root, ['rev-parse', '--git-path', 'info/exclude']))); } catch { /* 取れなければ検査しない */ }
  let excludes = '';
  try { excludes = git(root, ['config', '--type=path', '--get', 'core.excludesFile']); } catch { /* 未設定 */ }
  if (excludes) paths.push(resolve(root, excludes));
  else {
    const xdg = process.env.XDG_CONFIG_HOME || join(process.env.HOME || osHomedir(), '.config');
    paths.push(join(xdg, 'git', 'ignore'));
  }
  return paths;
}

/** git が読む無視ファイルのうち、通常ファイルでないものがあれば { path, label }。無ければ null（ファイルが無いのは問題なし） */
function irregularIgnoreSource(root) {
  for (const p of gitIgnoreSources(root)) {
    if (!existsSync(p)) continue; // ファイルが無いのは問題なし（壊れたシンボリックリンクも git は読めず無視する）
    const bad = notReadableFile(p);
    if (bad) return { path: p, label: bad };
  }
  return null;
}

/**
 * git 状態を { state, reason } で返す。state は ignored | not-ignored | tracked | not-git | unknown。
 * unknown（確認不能）は、git が読む無視ファイルが FIFO 等の通常ファイルでないとき（git を呼ばない）、
 * または git が時間制限内に終わらなかったとき。
 */
export function gitCheck(root) {
  try { git(root, ['rev-parse', '--git-dir']); } catch { return { state: 'not-git', reason: null }; }
  try { git(root, ['ls-files', '--error-unmatch', '--', LOCAL_REL]); return { state: 'tracked', reason: null }; } catch { /* 未追跡 */ }
  const bad = irregularIgnoreSource(root);
  if (bad) return { state: 'unknown', reason: `${bad.path} は通常ファイルではない（${bad.label}）ため、git に読ませません` };
  try { git(root, ['check-ignore', '-q', '--', LOCAL_REL]); return { state: 'ignored', reason: null }; } catch (err) {
    if (timedOut(err)) return { state: 'unknown', reason: `git check-ignore が ${GIT_TIMEOUT_MS / 1000} 秒以内に終わりませんでした` };
    return { state: 'not-ignored', reason: null };
  }
}

export function gitState(root) { return gitCheck(root).state; }

/**
 * config の model_performance を読む。{ value, warning }（読めなければ value は null）。読むだけ
 * 通常ファイル以外は読まない（FIFO でブロックするため）。値の引用符と行末コメントは除く
 */
export function readProfile(cwd) {
  const path = join(cwd, '.claude', 'ai-team-config.yml');
  if (!existsSync(path)) return { value: null, warning: null };
  const bad = notReadableFile(path);
  if (bad) return { value: null, warning: `${path} は通常ファイルではない（${bad}）ため読みません。性能プロファイルは不明として扱います` };
  try {
    const m = readFileSync(path, 'utf-8').match(/^\s*model_performance:\s*["']?([\w-]+)/m);
    return { value: m ? m[1] : null, warning: null };
  } catch (err) {
    return { value: null, warning: `${path} を読めません（${err.message}）。性能プロファイルは不明として扱います` };
  }
}

/** check の結果（何も書かない） */
export function checkAdvisor(e, opts = {}) {
  const root = resolveRoot(e);
  const sources = collectSources(e, root);
  const eff = sources.find(s => s.value !== undefined);
  const gc = gitCheck(root);
  const fromConfig = opts.profile === undefined ? readProfile(real(e.cwd)) : { value: opts.profile, warning: null };
  const profile = fromConfig.value;
  return {
    cwd: real(e.cwd),
    root,
    cwdDiffersFromRoot: root !== real(e.cwd),
    writeTarget: join(root, LOCAL_REL),
    sources,
    effective: eff ? { value: eff.value, id: eff.id, path: eff.path } : null,
    git: gc.state,
    gitReason: gc.reason,
    profile,
    warnings: fromConfig.warning ? [fromConfig.warning] : [],
    // high-performance では本体が fable になり、opus の advisor は付かない（決定6）。完全なモデル ID も対象
    profileConflict: profile === 'high-performance' && typeof eff?.value === 'string' && /opus/i.test(eff.value),
  };
}

function show(v) { return JSON.stringify(v); }

function describeCheck(c) {
  const lines = [`書き込み先: ${c.writeTarget}`];
  if (c.cwdDiffersFromRoot) lines.push(`注意: 実行フォルダ（${c.cwd}）とは別の、リポジトリのルートに書き込みます`);
  for (const s of c.sources) {
    const st = !s.exists ? 'ファイルなし' : s.error ? `確認できません: ${s.error}` : s.value === undefined ? 'advisorModel なし' : `advisorModel = ${show(s.value)}`;
    lines.push(`${s.id} ${s.path}: ${st}`);
  }
  lines.push(c.effective ? `実効値: ${show(c.effective.value)}（${c.effective.id}: ${c.effective.path}）` : '実効値: なし（advisor はオフ）');
  lines.push(c.git === 'unknown' ? `git 状態: 確認不能（${c.gitReason}）` : `git 状態: ${c.git}`);
  if (c.profile) lines.push(`性能プロファイル: ${c.profile}`);
  lines.push(...c.warnings.map(w => `警告: ${w}`));
  if (c.profileConflict) lines.push('注意: high-performance では本体が fable のため、opus の advisor は付きません');
  return lines;
}

/** 書き込み前の検査。拒否理由（文字列）か null */
function refuseWrite(root, r1, rel) {
  const link = firstSymlinkInPath(root, rel);
  if (link) return `${link.rel} はシンボリックリンク（→ ${link.target}）のため書き込みません`;
  const abs = join(root, rel);
  const irr = irregularFileType(abs);
  if (irr) return `${abs} は通常ファイルではない（${irr.fileType}）ため書き込みません`;
  if (hardlinkNlink(abs)) return `${abs} はハードリンクのため書き込みません`;
  if (r1 && r1.error) return `${r1.path} は${r1.error}。壊さないため書き込みません`;
  return null;
}

function writeJson(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n', 'utf-8');
}

/** 選んだ値と異なる既存値、または確認できない読み取り経路 */
function conflictsFor(sources, model) {
  return sources.filter(s => s.id !== 'R1' && s.exists && (s.error || (s.value !== undefined && s.value !== model)))
    .concat(sources.filter(s => s.id === 'R1' && s.value !== undefined && s.value !== model));
}

/** .gitignore 追記の計画。書き込みはしない（拒否の判定をここで済ませる） */
function planGitignore(c, opts, root) {
  if (!opts.gitignore) return { lines: [], write: false };
  if (c.git === 'tracked') return { lines: ['警告: .claude/settings.local.json は Git に追跡されています。.gitignore では外れません（`git rm --cached .claude/settings.local.json` は利用者の判断）'], write: false };
  if (c.git === 'unknown') return { lines: [`git 状態を確認できないため、.gitignore への追記はしません。何も書いていません（${c.gitReason}）。通常ファイルに置き換えてから、もう一度実行してください`], write: false, refused: true };
  if (c.git === 'not-git') return { lines: ['git リポジトリではないため、.gitignore への追記はしません'], write: false };
  if (c.git !== 'not-ignored') return { lines: [], write: false };
  const refuse = refuseWrite(root, null, '.gitignore');
  if (refuse) return { lines: [refuse], write: false, refused: true };
  return { lines: ['.gitignore に .claude/settings.local.json を追記します'], write: true };
}

function doGitignore(root) {
  appendFileSync(join(root, '.gitignore'), GITIGNORE_BLOCK, 'utf-8');
}

/** 個人設定を書かずに .gitignore だけ追記する（決定7）。個人設定ファイルが無ければ何もしない */
export function gitignoreOnly(e, opts = {}) {
  const c = checkAdvisor(e, {});
  const r1 = c.sources[0];
  if (!r1.exists) return { code: EXIT.OK, lines: ['個人設定（.claude/settings.local.json）がまだ無いため、何もしません'] };
  const gi = planGitignore(c, { gitignore: true }, c.root);
  const lines = [...gi.lines];
  if (gi.refused) return { code: EXIT.REFUSED, lines };
  if (gi.write && !opts.dry) {
    try { doGitignore(c.root); } catch (err) {
      return { code: EXIT.FAILED, lines: [...lines, `.gitignore に追記できませんでした（${err.message}）。個人設定は変更していません`] };
    }
  }
  if (opts.dry) lines.push('[dry] 何も書いていません');
  return { code: EXIT.OK, lines };
}

/** 選んだ値を書いても、すでに同じで書く必要が無いか（検査も不要） */
function needsNoWrite(r1, model) {
  if (model === 'unset') return !r1.exists || (!r1.error && !('advisorModel' in r1.obj));
  return r1.value === model && !r1.error;
}

/** apply 本体。{ code, lines } を返す */
export function applyAdvisor(e, opts) {
  const { model, overwrite = false, dry = false, gitignore = false } = opts;
  if (![...MODELS, 'unset'].includes(model)) {
    return { code: EXIT.USAGE, lines: [`--model は fable / opus / unset のいずれかです（指定: ${show(model)}）`] };
  }
  const c = checkAdvisor(e, { profile: opts.profile });
  if (model === 'opus' && c.profile === 'high-performance') {
    return { code: EXIT.USAGE, lines: ['性能 high-performance では本体が fable のため、opus の advisor は選べません（fable か unset を選んでください）'] };
  }
  const r1 = c.sources[0];
  const root = c.root;

  if (model !== 'unset' && r1.value !== model) {
    const conf = conflictsFor(c.sources, model);
    if (conf.length && !overwrite) {
      return { code: EXIT.NEED_CONFIRM, lines: [`既存の設定があります。上書きするなら --overwrite を付けてください（選んだ値: ${model}）`, ...conf.map(s => `  ${s.id} ${s.path}: ${s.error ? s.error : `advisorModel = ${show(s.value)}`}`)] };
    }
  }

  // --- 書き込み前に、失敗しうる判定をすべて済ませる（何も書かないまま 4 を返せるように）---
  const refuse = needsNoWrite(r1, model) ? null : refuseWrite(root, r1, LOCAL_REL);
  if (refuse) return { code: EXIT.REFUSED, lines: [refuse] };
  const gi = planGitignore(c, { gitignore }, root);
  if (gi.refused) return { code: EXIT.REFUSED, lines: gi.lines };

  // --- 書き込み。.gitignore を先にする（個人設定だけが Git 管理外にならないまま残る状態を作らない）---
  const next = model === 'unset' ? unsetValue(r1) : setValue(r1, model);
  const lines = [];
  const done = [];
  try {
    if (gi.write && !dry) { doGitignore(root); done.push('.gitignore は追記済み'); }
    if (next.obj && !dry) { mkdirSync(join(root, '.claude'), { recursive: true }); writeJson(c.writeTarget, next.obj); }
  } catch (err) {
    // .gitignore の追記に失敗したときは個人設定にまだ触れていない。追記後の失敗なら追記済みと明示する
    const state = done.length ? `${done.join('、')}。個人設定（${c.writeTarget}）は書けていません（advisor check で確かめてください）` : '何も書いていません';
    return { code: EXIT.FAILED, lines: [`書き込みに失敗しました（${err.message}）。状態: ${state}`] };
  }
  lines.push(next.obj ? `${dry ? '[dry] ' : ''}${next.msg}: ${c.writeTarget}` : next.msg);
  lines.push(...gi.lines);
  lines.push(...c.warnings.map(w => `警告: ${w}`));
  lines.push(...afterNotes(c, model, dry));
  return { code: EXIT.OK, lines };
}

function setValue(r1, model) {
  if (r1.value === model) return { obj: null, msg: `変更なし（すでに ${model}）` };
  const obj = { ...(r1.obj ?? {}), advisorModel: model };
  return { obj, msg: `advisorModel を ${model} に設定` };
}

function unsetValue(r1) {
  if (!r1.exists || r1.obj === undefined || !('advisorModel' in r1.obj)) return { obj: null, msg: '変更なし（個人設定に advisorModel はありません）' };
  const obj = { ...r1.obj };
  delete obj.advisorModel;
  return { obj, msg: 'advisorModel を削除' };
}

function afterNotes(c, model, dry) {
  const notes = [];
  const rest = c.sources.filter(s => s.id !== 'R1' && s.value !== undefined);
  if (model === 'unset' && rest.length) {
    notes.push('注意: 他の設定に advisorModel が残っているため advisor は有効なままです:');
    notes.push(...rest.map(s => `  ${s.id} ${s.path}: advisorModel = ${show(s.value)}（変更していません）`));
  } else if (model !== 'unset' && rest.length) {
    notes.push('注意: 次の設定の値は変更していません（個人設定の値が優先されて隠れます）:');
    notes.push(...rest.map(s => `  ${s.id} ${s.path}: advisorModel = ${show(s.value)}`));
  }
  if (c.cwdDiffersFromRoot) notes.push(`注意: 書き込み先はリポジトリのルート（${c.root}）です（worktree では本体側）`);
  if (dry) notes.push('[dry] 何も書いていません');
  return notes;
}

const USAGE = '使い方: advisor check [--json] [--profile <id>] | advisor apply --model <fable|opus|unset> [--overwrite] [--gitignore] [--dry] [--profile <id>] | advisor gitignore [--dry]';

/** CLI の引数を解釈する。値を取るオプション（--model / --profile）は、値が無い・`--` で始まる・空のときエラー */
export function parseAdvisorArgs(argv) {
  const opts = { overwrite: false, gitignore: false, dry: false, json: false };
  const value = (i) => {
    const v = argv[i];
    return v === undefined || v === '' || v.startsWith('--') ? null : v;
  };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--overwrite') opts.overwrite = true;
    else if (a === '--gitignore') opts.gitignore = true;
    else if (a === '--dry') opts.dry = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--model' || a === '--profile') {
      const v = value(i + 1);
      if (v === null) return { error: `${a} には値が必要です（指定: ${show(argv[i + 1])}）` };
      i++;
      if (a === '--model') opts.model = v;
      else if (!Object.hasOwn(PERFORMANCE_PROFILES, v)) return { error: `--profile は ${Object.keys(PERFORMANCE_PROFILES).join(' / ')} のいずれかです（内部 ID。指定: ${show(v)}）` };
      else opts.profile = v;
    }
    else return { error: `不明なオプション: ${a}` };
  }
  return { sub: argv[0], opts };
}

/** `setup.js advisor ...` の入口。終了コードを返す */
export function runAdvisor(argv, overrides = {}) {
  const out = overrides.out ?? (s => console.log(s));
  const errOut = overrides.err ?? (s => console.error(s));
  const parsed = parseAdvisorArgs(argv);
  if (parsed.error || !['check', 'apply', 'gitignore'].includes(parsed.sub)) {
    errOut(parsed.error ?? USAGE);
    return EXIT.USAGE;
  }
  try {
    const e = makeEnv(overrides);
    if (parsed.sub === 'check') {
      const c = checkAdvisor(e, { profile: parsed.opts.profile });
      if (parsed.opts.json) out(JSON.stringify(c, (k, v) => (k === 'obj' ? undefined : v), 2));
      else describeCheck(c).forEach(out);
      return EXIT.OK;
    }
    const r = parsed.sub === 'gitignore' ? gitignoreOnly(e, parsed.opts) : applyAdvisor(e, parsed.opts);
    r.lines.forEach(l => (r.code === EXIT.OK ? out(l) : errOut(l)));
    return r.code;
  } catch (err) {
    // 検査（書き込み前）で起きた例外。何も書いていない（書き込み中の失敗は apply 側で状態つきで返す）
    errOut(`想定外のエラー: ${err.message}。何も書いていません。状態は advisor check で確かめてください`);
    return EXIT.FAILED;
  }
}
