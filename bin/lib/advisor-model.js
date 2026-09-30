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
 * 環境（cwd / env / homedir / uid / platform）は引数で注入できる。テストが実ユーザー設定に触れないため。
 */

import {
  existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync, statSync, realpathSync
} from 'fs';
import { join, resolve, dirname, basename } from 'path';
import { homedir as osHomedir } from 'os';
import { execFileSync } from 'child_process';

import { firstSymlinkInPath, hardlinkNlink, irregularFileType } from './link-safety.js';

export const LOCAL_REL = '.claude/settings.local.json';
export const MODELS = ['fable', 'opus'];
export const EXIT = { OK: 0, USAGE: 2, NEED_CONFIRM: 3, REFUSED: 4 };
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

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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

/** 設定ファイル1つを読む。{ path, exists, value, error } */
export function readSetting(path) {
  if (!existsSync(path)) return { path, exists: false, value: undefined, error: null };
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

/** ignored | not-ignored | tracked | not-git */
export function gitState(root) {
  try { git(root, ['rev-parse', '--git-dir']); } catch { return 'not-git'; }
  try { git(root, ['ls-files', '--error-unmatch', '--', LOCAL_REL]); return 'tracked'; } catch { /* 未追跡 */ }
  try { git(root, ['check-ignore', '-q', '--', LOCAL_REL]); return 'ignored'; } catch { return 'not-ignored'; }
}

/** config の model_performance を読む（無ければ null）。読むだけ */
export function readProfile(cwd) {
  try {
    const m = readFileSync(join(cwd, '.claude', 'ai-team-config.yml'), 'utf-8')
      .match(/^\s*model_performance:\s*([\w-]+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** check の結果（何も書かない） */
export function checkAdvisor(e, opts = {}) {
  const root = resolveRoot(e);
  const sources = collectSources(e, root);
  const eff = sources.find(s => s.value !== undefined);
  const profile = opts.profile ?? readProfile(real(e.cwd));
  return {
    cwd: real(e.cwd),
    root,
    cwdDiffersFromRoot: root !== real(e.cwd),
    writeTarget: join(root, LOCAL_REL),
    sources,
    effective: eff ? { value: eff.value, id: eff.id, path: eff.path } : null,
    git: gitState(root),
    profile,
    // high-performance では本体が fable になり、opus の advisor は付かない（決定6）
    profileConflict: profile === 'high-performance' && eff?.value === 'opus',
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
  lines.push(`git 状態: ${c.git}`);
  if (c.profile) lines.push(`性能プロファイル: ${c.profile}`);
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

function planGitignore(c, opts, root) {
  if (!opts.gitignore) return { lines: [], write: false };
  if (c.git === 'tracked') return { lines: ['警告: .claude/settings.local.json は Git に追跡されています。.gitignore では外れません（`git rm --cached .claude/settings.local.json` は利用者の判断）'], write: false };
  if (c.git !== 'not-ignored') return { lines: [], write: false };
  const refuse = refuseWrite(root, null, '.gitignore');
  if (refuse) return { lines: [refuse], write: false, refused: true };
  return { lines: ['.gitignore に .claude/settings.local.json を追記します'], write: true };
}

function doGitignore(root) {
  appendFileSync(join(root, '.gitignore'), GITIGNORE_BLOCK, 'utf-8');
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
  const lines = [];
  let code = EXIT.OK;

  if (model !== 'unset' && r1.value !== model) {
    const conf = conflictsFor(c.sources, model);
    if (conf.length && !overwrite) {
      return { code: EXIT.NEED_CONFIRM, lines: [`既存の設定があります。上書きするなら --overwrite を付けてください（選んだ値: ${model}）`, ...conf.map(s => `  ${s.id} ${s.path}: ${s.error ? s.error : `advisorModel = ${show(s.value)}`}`)] };
    }
  }
  const root = c.root;
  const refuse = (model === 'unset' && !r1.exists) || (model !== 'unset' && r1.value === model && !r1.error) ? null : refuseWrite(root, r1, LOCAL_REL);
  if (refuse) return { code: EXIT.REFUSED, lines: [refuse] };

  const next = model === 'unset' ? unsetValue(r1) : setValue(r1, model);
  if (next.obj) {
    lines.push(`${dry ? '[dry] ' : ''}${next.msg}: ${c.writeTarget}`);
    if (!dry) { mkdirSync(join(root, '.claude'), { recursive: true }); writeJson(c.writeTarget, next.obj); }
  } else {
    lines.push(next.msg);
  }
  const gi = planGitignore(c, { gitignore }, root);
  lines.push(...gi.lines);
  if (gi.refused) code = EXIT.REFUSED;
  else if (gi.write && !dry) doGitignore(root);
  lines.push(...afterNotes(c, model, dry));
  return { code, lines };
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

/** CLI の引数を解釈する */
export function parseAdvisorArgs(argv) {
  const opts = { overwrite: false, gitignore: false, dry: false, json: false };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--overwrite') opts.overwrite = true;
    else if (a === '--gitignore') opts.gitignore = true;
    else if (a === '--dry') opts.dry = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--model') opts.model = argv[++i];
    else if (a === '--profile') opts.profile = argv[++i];
    else return { error: `不明なオプション: ${a}` };
  }
  return { sub: argv[0], opts };
}

/** `setup.js advisor ...` の入口。終了コードを返す */
export function runAdvisor(argv, overrides = {}) {
  const out = overrides.out ?? (s => console.log(s));
  const errOut = overrides.err ?? (s => console.error(s));
  const parsed = parseAdvisorArgs(argv);
  if (parsed.error || !['check', 'apply'].includes(parsed.sub)) {
    errOut(parsed.error ?? '使い方: advisor check [--json] | advisor apply --model <fable|opus|unset> [--overwrite] [--gitignore] [--dry] [--profile <id>]');
    return EXIT.USAGE;
  }
  const e = makeEnv(overrides);
  if (parsed.sub === 'check') {
    const c = checkAdvisor(e, { profile: parsed.opts.profile });
    if (parsed.opts.json) out(JSON.stringify(c, (k, v) => (k === 'obj' ? undefined : v), 2));
    else describeCheck(c).forEach(out);
    return EXIT.OK;
  }
  const r = applyAdvisor(e, parsed.opts);
  r.lines.forEach(l => (r.code === EXIT.OK ? out(l) : errOut(l)));
  return r.code;
}
