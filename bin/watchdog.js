#!/usr/bin/env node
/**
 * サブエージェント委託監視ウォッチドッグ（Issue #99）。
 *
 * Opus / Sonnet をオーケストレーターに使う場合、委託したサブエージェントが API エラー等で
 * 無音停止しても、モデルの自発的な注意力だけでは検知できない（実測: 2026-07-24、約40分放置）。
 *
 * このスクリプトはオーケストレーターが委託と同時にバックグラウンドで起動する監視プロセスで、
 * 「heartbeat ファイルの更新が閾値時間止まった」または「done マーカーが作られた」のいずれかを
 * 検知するまでループし、検知した時点で終了する。バックグラウンドプロセスの終了通知は
 * ハーネス機能でありモデルの注意力に依存しないため、これを Opus/Sonnet でも機能する
 * 唯一信頼できる「起床経路」として採用する（Issue #99 設計方針）。
 *
 * 封じ込め検査（インシデント #4 教訓15）:
 *   heartbeat / done マーカーのパスは、プロジェクト側（cwd 由来・ユーザーが作れる）の
 *   パスであり得るため、症状の異なる二種類の脅威に晒される。
 *     - symlink        … 境界外を指しうる
 *     - FIFO           … reader 不在の read で同期ブロックする（プロセスごとハング）
 *     - directory 等   … 想定外の副作用・例外
 *   本スクリプトは lstatSync のみで存在確認・種別確認・mtime 取得を行い、
 *   readFileSync 等の内容読み込みは一切行わない。lstatSync は内容を読まないため
 *   FIFO でもブロックしないが、「通常ファイルでない実体」を検知した時点で
 *   処理を継続せず即座に exit 2 で停止する（fail-closed）。
 *
 * CLI:
 *   node bin/watchdog.js <heartbeat-path> --threshold-min <n> --done-marker <path> [--interval-sec <s>=30]
 *
 * 終了コード:
 *   0 = done マーカーを検出（正常完了）
 *   2 = 検査エラー・引数不正
 *   3 = 無音検出（stall）
 *
 * stdout には判定結果を1行 JSON で出力する:
 *   {"result":"done"|"stall"|"error","elapsed_min"?:number,"reason"?:string}
 *
 * 依存: Node 標準のみ（新規 npm 依存の追加禁止）。
 */

import { lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CLI 引数をパースする。
 *
 * @param {string[]} argv process.argv.slice(2) 相当
 * @returns {{ heartbeatPath?: string, thresholdMin?: number, doneMarker?: string, intervalSec: number }}
 */
export function parseArgs(argv) {
  const args = { heartbeatPath: undefined, thresholdMin: undefined, doneMarker: undefined, intervalSec: 30 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--threshold-min') {
      args.thresholdMin = Number(argv[++i]);
    } else if (a === '--done-marker') {
      args.doneMarker = argv[++i];
    } else if (a === '--interval-sec') {
      args.intervalSec = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      throw new Error(`不明なオプションです: ${a}`);
    } else {
      positional.push(a);
    }
  }
  args.heartbeatPath = positional[0];
  return args;
}

/**
 * パース済み引数を検証する。不正な場合は理由を含む Error を投げる。
 *
 * @param {{ heartbeatPath?: string, thresholdMin?: number, doneMarker?: string, intervalSec: number }} args
 */
export function validateArgs(args) {
  if (!args.heartbeatPath) {
    throw new Error('heartbeat-path を指定してください（第1引数）');
  }
  if (!args.doneMarker) {
    throw new Error('--done-marker を指定してください');
  }
  if (!Number.isFinite(args.thresholdMin) || args.thresholdMin <= 0) {
    throw new Error('--threshold-min には正の数値を指定してください');
  }
  if (!Number.isFinite(args.intervalSec) || args.intervalSec <= 0) {
    throw new Error('--interval-sec には正の数値を指定してください');
  }
}

/**
 * 対象パスを lstatSync のみで検査する（readFileSync は使わない。教訓15）。
 *
 * @param {string} path 検査対象パス（絶対 / 相対どちらも可。呼び出し側の cwd 基準）
 * @returns {{ exists: false } | { exists: true, irregular: boolean, mtimeMs: number }}
 */
export function inspectPath(path) {
  let st;
  try {
    st = lstatSync(path);
  } catch (e) {
    if (e.code === 'ENOENT') return { exists: false };
    // ENOENT 以外（EACCES 等）は握りつぶさず伝播させる（fail-closed。link-safety.js と同方針）
    throw e;
  }
  // lstatSync はシンボリックリンクを辿らないため、symlink / FIFO / ディレクトリ / デバイスは
  // いずれも isFile() が false になる。これらをまとめて「通常ファイル以外」として弾く。
  return { exists: true, irregular: !st.isFile(), mtimeMs: st.mtimeMs };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

const defaultSleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * ウォッチドッグ本体。done マーカー検出 または 無音検出のいずれかまでループする。
 *
 * @param {{ heartbeatPath: string, thresholdMin: number, doneMarker: string, intervalSec: number }} args
 * @param {{ now?: () => number, sleep?: (ms: number) => Promise<void> }} [deps] テスト用の差し替え
 * @returns {Promise<{ code: number, result: 'done'|'stall'|'error', elapsed_min?: number, reason?: string }>}
 */
export async function runWatchdog(args, deps = {}) {
  const { now = () => Date.now(), sleep = defaultSleep } = deps;
  const { heartbeatPath, doneMarker, intervalSec } = args;
  const thresholdMs = args.thresholdMin * 60_000;
  const startedAt = now();

  for (;;) {
    // (1) done マーカーの確認（無音検出より優先。停止直後に完了した場合を正しく完了扱いにする）
    const doneInfo = inspectPath(doneMarker);
    if (doneInfo.exists && doneInfo.irregular) {
      return { code: 2, result: 'error', reason: `done-marker が通常ファイルではありません: ${doneMarker}` };
    }
    if (doneInfo.exists) {
      return { code: 0, result: 'done', elapsed_min: round2((now() - startedAt) / 60_000) };
    }

    // (2) heartbeat の無音判定
    const hbInfo = inspectPath(heartbeatPath);
    if (hbInfo.exists && hbInfo.irregular) {
      return { code: 2, result: 'error', reason: `heartbeat が通常ファイルではありません: ${heartbeatPath}` };
    }
    // heartbeat が未作成（着手前）の場合は watchdog 起動時刻を基準に無音時間を計測する
    const referenceMs = hbInfo.exists ? hbInfo.mtimeMs : startedAt;
    const silentMs = now() - referenceMs;
    if (silentMs >= thresholdMs) {
      return { code: 3, result: 'stall', elapsed_min: round2(silentMs / 60_000) };
    }

    await sleep(intervalSec * 1000);
  }
}

// CLI エントリ
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
    validateArgs(args);
  } catch (e) {
    console.log(JSON.stringify({ result: 'error', reason: e.message }));
    process.exit(2);
  }

  runWatchdog(args)
    .then((res) => {
      const out = { result: res.result };
      if (res.elapsed_min !== undefined) out.elapsed_min = res.elapsed_min;
      if (res.reason !== undefined) out.reason = res.reason;
      console.log(JSON.stringify(out));
      process.exit(res.code);
    })
    .catch((e) => {
      console.log(JSON.stringify({ result: 'error', reason: e.message }));
      process.exit(2);
    });
}
