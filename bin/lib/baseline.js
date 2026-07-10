/**
 * baseline（前回このツールが配置した内容のハッシュ台帳）ユーティリティ（Issue #85）。
 *
 * upgrade の保護判定を「# customized: true マーカーの有無」から「ハッシュ照合」へ移行する。
 * install / setup / upgrade などテンプレートを配置するすべての経路が、配置した各ファイルの
 * 正規化 SHA-256 を `.claude/.template-baseline.json` に記録する。upgrade はこの baseline と
 * 現物のハッシュを突き合わせ、
 *
 *   現物 == baseline（前回このツールが書いた内容）  → ユーザーは触っていない → 更新する
 *   現物 != baseline                              → ユーザーが編集した     → 上書きせず .new を書く
 *   baseline に記録が無い                          → 判定不能             → 上書きしない（安全側）
 *
 * と判定する（マーカー # customized: true はハッシュに関わらず保護する後方互換シグナルとして残る）。
 *
 * 保存形式:
 *   { "version": "0.24.0", "files": { ".claude/teams/backend/workflow.yml": "<sha256>" } }
 *
 * キーは常に POSIX 区切り（/）で保持する。OS 依存セパレータで書くと、Windows で配置した
 * baseline を別環境で読めなくなるため。
 */

import {
  existsSync, readFileSync, writeFileSync, mkdirSync
} from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

import { firstSymlinkInPath, hardlinkNlink, irregularFileType } from './link-safety.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '../..');

/** baseline ファイルの cwd 相対パス（POSIX） */
export const BASELINE_REL = '.claude/.template-baseline.json';

/** OS 依存セパレータのパスを POSIX（/）へ正規化する */
function toPosix(p) {
  return p.split(/[\\/]+/).filter(Boolean).join('/');
}

/** @trimix/ai-team のバージョンを package.json から読む（失敗しても null で継続する） */
function readPackageVersion() {
  try {
    const pkg = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/**
 * baseline 用に正規化した SHA-256 を返す。
 *
 * 人間が明示的に承認した仕様に従い、ハッシュを取る前に **次の2つだけ** を正規化する。
 *   1. 改行コードを LF に統一する（CRLF → LF、および単独の CR → LF）
 *   2. ファイル末尾の改行の有無を揃える（末尾の LF を1つだけ取り除く）
 *
 * それ以上は正規化しない。行頭・行末・行中の空白を削ると、YAML のインデントや Markdown の
 * コードブロックの意味が変わり、本物の編集を見逃して上書きしてしまう。誤判定するなら
 * 「編集していないのに保護する」側へ倒す（＝空白差は別物として扱い、保護する）。
 *
 * @param {Buffer|string} buf ファイル内容
 * @returns {string} 16進の SHA-256
 */
export function normalizedHash(buf) {
  let text = Buffer.isBuffer(buf) ? buf.toString('utf-8') : String(buf);
  // 1. 改行コードを LF に統一（CRLF → LF、次いで単独 CR → LF）
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // 2. 末尾改行の有無を揃える（末尾の LF をすべて落とす）。
  //    テンプレートは末尾 LF 付きで配置されるため、LF を1つだけ落とす方式だと
  //    「末尾に改行を1つ足した（LF が2つになった）」ケースを別物と判定してしまう。
  //    末尾の LF の本数差だけを吸収する。末尾のスペース（行末の空白）は削らない
  //    ため、`/\n+$/` のみを対象にする（本物の空白編集は保護側に倒れる）。
  text = text.replace(/\n+$/, '');
  return createHash('sha256').update(text, 'utf-8').digest('hex');
}

/** 空の baseline 構造 */
function emptyBaseline() {
  return { version: null, files: {} };
}

/**
 * baseline を読み込む。**不正な JSON でも例外を投げず**、空として扱い警告する。
 * upgrade が baseline の破損だけで実行不能になるのを防ぐため（安全側に倒す）。
 *
 * @param {string} cwd プロジェクトルート（絶対パス）
 * @returns {{ version: string|null, files: Record<string,string> }}
 */
export function loadBaseline(cwd) {
  const abs = join(cwd, BASELINE_REL);
  if (!existsSync(abs)) return emptyBaseline();

  // 通常ファイル以外（FIFO / ディレクトリ / ソケット / デバイス）は読まずに空扱いにする。
  // FIFO の readFileSync はリーダー／ライターが揃うまでプロセスごと同期ブロックしてハングし、
  // 同期ブロックは例外ではないため下の try/catch では捕捉できない。書き込み側 saveBaseline に
  // 入れた封じ込め（irregularFileType）を、読み込み側にも対称に施す（インシデント #4 教訓15）。
  const irregular = irregularFileType(abs);
  if (irregular) {
    console.log(`  ⚠️  baseline（${BASELINE_REL}）が通常ファイルではない（${irregular.fileType}）ため、読み込みをスキップし空として扱います。`);
    return emptyBaseline();
  }

  let raw;
  try {
    raw = readFileSync(abs, 'utf-8');
  } catch (e) {
    console.log(`  ⚠️  baseline（${BASELINE_REL}）を読み込めませんでした（${e.message}）。空として扱います。`);
    return emptyBaseline();
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.log(`  ⚠️  baseline（${BASELINE_REL}）の JSON 解析に失敗しました（${e.message}）。空として扱います。`);
    console.log('     （再確立するには npx @trimix/ai-team baseline record --force を実行してください）');
    return emptyBaseline();
  }

  // 構造検証: files が無い / オブジェクトでない場合も空として扱う（不正データで落ちない）
  if (!data || typeof data !== 'object' || typeof data.files !== 'object' || data.files === null || Array.isArray(data.files)) {
    console.log(`  ⚠️  baseline（${BASELINE_REL}）の構造が不正です（files が見つかりません）。空として扱います。`);
    return emptyBaseline();
  }

  // 値が文字列のエントリのみを採用する（壊れた値は捨てる）
  const files = {};
  for (const [k, v] of Object.entries(data.files)) {
    if (typeof v === 'string') files[toPosix(k)] = v;
  }
  return { version: typeof data.version === 'string' ? data.version : null, files };
}

/**
 * baseline を書き込む。**書き込み前に link-safety で検査**し、書き込み先がシンボリック
 * リンク／ハードリンク／通常ファイル以外（ディレクトリ等）なら書かずに警告する。
 * baseline ファイル自体も新しい書き込み先であり、リンクを辿って .claude/ の外を破壊しうるため
 * （インシデント #4 の教訓1・8）。
 *
 * 書き込み失敗は例外を投げず、`{ written: false, reason }` を返す。呼び出し側（upgrade の
 * 適用後）が中止に倒さず継続できるようにするため（適用は既に完了しており戻らない）。
 *
 * @param {string} cwd
 * @param {{ version?: string|null, files: Record<string,string> }} data
 * @returns {{ written: boolean, reason?: 'symlink'|'hardlink'|'irregular'|'error', path: string }}
 */
export function saveBaseline(cwd, data) {
  const abs = join(cwd, BASELINE_REL);

  // 1. 封じ込め: cwd から baseline まで経路にシンボリックリンクがあれば書かない
  const link = firstSymlinkInPath(cwd, BASELINE_REL);
  if (link) {
    console.log('');
    console.log(`  ⚠️  baseline（${BASELINE_REL}）がシンボリックリンク（→ ${link.target}）のため、記録をスキップします。`);
    console.log('   .claude/ の外を書き換えないためです。リンクを解除してください。');
    return { written: false, reason: 'symlink', path: abs };
  }
  // 2. ハードリンク: 共有 inode を書き換えて外部ファイルを破壊しないよう検査
  const nlink = hardlinkNlink(abs);
  if (nlink) {
    console.log('');
    console.log(`  ⚠️  baseline（${BASELINE_REL}）がハードリンク（外部 inode を共有・nlink=${nlink}）のため、記録をスキップします。`);
    console.log('   外部ファイルの実体を書き換えないためです。通常ファイルに置き換えてください。');
    return { written: false, reason: 'hardlink', path: abs };
  }
  // 3. 通常ファイル以外（ディレクトリ / FIFO 等）は書かない
  const irregular = irregularFileType(abs);
  if (irregular) {
    console.log('');
    console.log(`  ⚠️  baseline（${BASELINE_REL}）が通常ファイルではない（${irregular.fileType}）ため、記録をスキップします。`);
    console.log('   通常ファイルに置き換えてください。');
    return { written: false, reason: 'irregular', path: abs };
  }

  try {
    mkdirSync(dirname(abs), { recursive: true });
    const out = {
      version: data.version ?? readPackageVersion(),
      files: data.files ?? {}
    };
    writeFileSync(abs, `${JSON.stringify(out, null, 2)}\n`, 'utf-8');
    return { written: true, path: abs };
  } catch (e) {
    console.log('');
    console.log(`  ⚠️  baseline（${BASELINE_REL}）の書き込みに失敗しました（${e.message}）。`);
    return { written: false, reason: 'error', path: abs };
  }
}

/**
 * `{ 相対パス: ハッシュ }` を既存 baseline に追加・更新する（マージ）。
 *
 * @param {string} cwd
 * @param {Record<string,string>} entries
 * @returns {{ written: boolean, reason?: string, path: string }}
 */
export function recordEntries(cwd, entries) {
  const current = loadBaseline(cwd);
  const files = { ...current.files };
  for (const [rel, hash] of Object.entries(entries)) {
    files[toPosix(rel)] = hash;
  }
  return saveBaseline(cwd, { version: current.version ?? readPackageVersion(), files });
}

/**
 * 実在するファイルの正規化ハッシュを計算して baseline に記録する。
 * 存在しないもの、およびシンボリックリンク／ハードリンク／通常ファイル以外は記録しない
 * （リンク先の内容を baseline に取り込まないため。link-safety と同じ封じ込め方針）。
 *
 * @param {string} cwd
 * @param {string[]} rels cwd 相対パス
 * @returns {{ written: boolean, recorded: string[], reason?: string, path: string }}
 */
export function recordFiles(cwd, rels) {
  const entries = {};
  const recorded = [];
  for (const rel of rels) {
    const relPosix = toPosix(rel);
    const abs = join(cwd, rel);
    if (!existsSync(abs)) continue;
    // リンク・通常ファイル以外は記録対象から外す（安全側）
    if (firstSymlinkInPath(cwd, relPosix)) continue;
    if (hardlinkNlink(abs)) continue;
    if (irregularFileType(abs)) continue;
    entries[relPosix] = normalizedHash(readFileSync(abs));
    recorded.push(relPosix);
  }
  if (recorded.length === 0) {
    return { written: false, recorded, reason: 'noop', path: join(cwd, BASELINE_REL) };
  }
  return { ...recordEntries(cwd, entries), recorded };
}

/**
 * 実在しないファイルの記録を baseline から剪定する。
 *
 * @param {string} cwd
 * @returns {{ pruned: string[], written: boolean }}
 */
export function pruneMissing(cwd) {
  const current = loadBaseline(cwd);
  const files = {};
  const pruned = [];
  for (const [rel, hash] of Object.entries(current.files)) {
    if (existsSync(join(cwd, rel))) files[rel] = hash;
    else pruned.push(rel);
  }
  if (pruned.length === 0) return { pruned, written: false };
  const res = saveBaseline(cwd, { version: current.version ?? readPackageVersion(), files });
  return { pruned, written: res.written };
}

/**
 * 現物ファイル rel の正規化ハッシュが baseline の記録と一致するかを判定する。
 *
 * @param {{version:string|null, files:Record<string,string>}} baseline loadBaseline の結果
 * @param {string} rel cwd 相対パス
 * @param {Buffer|string} content 現物の内容
 * @returns {{ recorded: boolean, matches: boolean }}
 *   recorded: baseline に記録があるか / matches: 記録があり、かつハッシュが一致するか
 */
export function matchesBaseline(baseline, rel, content) {
  const recorded = baseline.files[toPosix(rel)];
  if (recorded === undefined) return { recorded: false, matches: false };
  return { recorded: true, matches: recorded === normalizedHash(content) };
}
