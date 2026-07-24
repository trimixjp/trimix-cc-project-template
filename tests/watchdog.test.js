/**
 * bin/watchdog.js（サブエージェント委託監視ウォッチドッグ）のテスト（Issue #99）。
 *
 * 正常系・停止系（制御群）・封じ込め系（symlink / directory / FIFO）・CLI引数検証・
 * CLI end-to-end の5カテゴリを検証する。
 *
 * インシデント #4 教訓13・15・16 に従い、以下の型を厳守する:
 *   - 「ハングしなかった」という否定的観測は、ハングを検出できる検証系（別プロセス spawn +
 *     親からの setTimeout→SIGKILL）で測定しない限り無意味。timeout(1) は本 macOS 環境に
 *     存在しないため使わない。インプロセスのタイマは同期ハングを捕捉できない。
 *   - 否定的観測には必ず制御群（生の readFileSync → FIFO が実際にハングし SIGKILL される
 *     こと）を対にする。制御群が機能することを先に確認してから、本体（watchdog.js）が
 *     ハングせず終了することを確認する。
 *   - heartbeat / done-marker はいずれもプロジェクト側パスであり、両方に封じ込め検査が
 *     効いていることを個別に確認する（一方だけ検査して他方を書き漏らす非対称性を防ぐ）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, lstatSync, utimesSync,
  existsSync
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn, spawnSync } from 'node:child_process';

import { parseArgs, validateArgs, inspectPath, runWatchdog } from '../bin/watchdog.js';

const packageRoot = resolve(new URL('..', import.meta.url).pathname);
const WATCHDOG_BIN = join(packageRoot, 'bin', 'watchdog.js');

function makeTmpDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function touch(path, mtimeMs = Date.now()) {
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) writeFileSync(path, '');
  const sec = mtimeMs / 1000;
  utimesSync(path, sec, sec);
}

// ===========================================================================
// CLI 引数パース・検証（純粋関数・同期）
// ===========================================================================

test('(#99-1) parseArgs: 位置引数とオプションを正しく解釈する', () => {
  const args = parseArgs(['/tmp/hb.log', '--threshold-min', '10', '--done-marker', '/tmp/done', '--interval-sec', '5']);
  assert.equal(args.heartbeatPath, '/tmp/hb.log');
  assert.equal(args.thresholdMin, 10);
  assert.equal(args.doneMarker, '/tmp/done');
  assert.equal(args.intervalSec, 5);
});

test('(#99-2) parseArgs: --interval-sec 省略時は既定値30を使う', () => {
  const args = parseArgs(['/tmp/hb.log', '--threshold-min', '10', '--done-marker', '/tmp/done']);
  assert.equal(args.intervalSec, 30);
});

test('(#99-3) parseArgs: 未知のオプションは例外を投げる', () => {
  assert.throws(() => parseArgs(['/tmp/hb.log', '--unknown', 'x']), /不明なオプション/);
});

test('(#99-4) validateArgs: heartbeat-path 欠落を検出する', () => {
  assert.throws(() => validateArgs({ thresholdMin: 1, doneMarker: '/tmp/d', intervalSec: 1 }), /heartbeat-path/);
});

test('(#99-5) validateArgs: --done-marker 欠落を検出する', () => {
  assert.throws(() => validateArgs({ heartbeatPath: '/tmp/h', thresholdMin: 1, intervalSec: 1 }), /done-marker/);
});

test('(#99-6) validateArgs: --threshold-min が0以下・非数値なら例外', () => {
  assert.throws(() => validateArgs({ heartbeatPath: '/tmp/h', doneMarker: '/tmp/d', thresholdMin: 0, intervalSec: 1 }), /threshold-min/);
  assert.throws(() => validateArgs({ heartbeatPath: '/tmp/h', doneMarker: '/tmp/d', thresholdMin: NaN, intervalSec: 1 }), /threshold-min/);
});

test('(#99-7) validateArgs: --interval-sec が0以下・非数値なら例外', () => {
  assert.throws(() => validateArgs({ heartbeatPath: '/tmp/h', doneMarker: '/tmp/d', thresholdMin: 1, intervalSec: 0 }), /interval-sec/);
});

// ===========================================================================
// inspectPath（lstatSync ベースの検査。readFileSync は使わない）
// ===========================================================================

test('(#99-8) inspectPath: 存在しないパスは exists:false', () => {
  const cwd = makeTmpDir('watchdog-inspect-');
  try {
    const info = inspectPath(join(cwd, 'nothing'));
    assert.deepEqual(info, { exists: false });
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-9) inspectPath: 通常ファイルは irregular:false', () => {
  const cwd = makeTmpDir('watchdog-inspect-');
  try {
    const p = join(cwd, 'hb.log');
    touch(p);
    const info = inspectPath(p);
    assert.equal(info.exists, true);
    assert.equal(info.irregular, false);
    assert.equal(typeof info.mtimeMs, 'number');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-10) inspectPath: シンボリックリンクは irregular:true（lstat は辿らない）', () => {
  const cwd = makeTmpDir('watchdog-inspect-');
  try {
    const target = join(cwd, 'real.log');
    touch(target);
    const link = join(cwd, 'link.log');
    symlinkSync(target, link);
    const info = inspectPath(link);
    assert.equal(info.exists, true);
    assert.equal(info.irregular, true);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-11) inspectPath: 壊れたシンボリックリンクも irregular:true として検出する（ENOENTにしない）', () => {
  const cwd = makeTmpDir('watchdog-inspect-');
  try {
    const link = join(cwd, 'broken-link');
    symlinkSync(join(cwd, 'does-not-exist'), link);
    const info = inspectPath(link);
    assert.equal(info.exists, true);
    assert.equal(info.irregular, true);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-12) inspectPath: ディレクトリは irregular:true', () => {
  const cwd = makeTmpDir('watchdog-inspect-');
  try {
    const d = join(cwd, 'a-directory');
    mkdirSync(d);
    const info = inspectPath(d);
    assert.equal(info.exists, true);
    assert.equal(info.irregular, true);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// 正常系（インプロセス。分未満のしきい値・秒未満の間隔でテスト時間を短縮）
// ===========================================================================

test('(#99-13) runWatchdog: done マーカーが最初から存在すれば即 exit 0', async () => {
  const cwd = makeTmpDir('watchdog-done-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    const doneMarker = join(cwd, 'done');
    touch(doneMarker);
    const res = await runWatchdog({ heartbeatPath, doneMarker, thresholdMin: 0.02, intervalSec: 0.02 });
    assert.equal(res.code, 0);
    assert.equal(res.result, 'done');
    assert.equal(typeof res.elapsed_min, 'number');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-14) runWatchdog: heartbeat が継続更新される間は無音検出しない（生存確認）', async () => {
  const cwd = makeTmpDir('watchdog-alive-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    const doneMarker = join(cwd, 'done');
    touch(heartbeatPath);

    // サブエージェントが5分ごとに heartbeat を打つ運用を、20msごとの打刻でシミュレートする。
    const touchInterval = setInterval(() => touch(heartbeatPath), 20);
    const startedAt = Date.now();
    setTimeout(() => {
      clearInterval(touchInterval);
      touch(doneMarker); // 生存確認後に完了させる
    }, 400);

    // しきい値(150ms)より打刻間隔(20ms)が十分短いため、打刻継続中はstallに到達しないはず
    const res = await runWatchdog({ heartbeatPath, doneMarker, thresholdMin: 150 / 60_000, intervalSec: 30 / 1000 });
    const elapsedRealMs = Date.now() - startedAt;

    assert.equal(res.result, 'done', `heartbeat継続更新中にstallと誤判定した: ${JSON.stringify(res)}`);
    assert.equal(res.code, 0);
    // 400ms経過するまでdoneに到達しないはずなので、それより十分前に終わっていないことを確認する
    assert.ok(elapsedRealMs >= 350, `生存中にもかかわらず早期終了した（${elapsedRealMs}ms）`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// 停止系（制御群）: heartbeat を意図的に放置し、無音検出（exit 3）が実際に機能することを実測する
// ===========================================================================

test('(#99-15)【制御群】runWatchdog: heartbeat を放置すると閾値超過でexit 3になる', async () => {
  const cwd = makeTmpDir('watchdog-stall-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    const doneMarker = join(cwd, 'done');
    touch(heartbeatPath); // 一度だけ打刻し、以後は更新しない（サブエージェントの無音停止を模擬）

    const res = await runWatchdog({ heartbeatPath, doneMarker, thresholdMin: 80 / 60_000, intervalSec: 20 / 1000 });

    assert.equal(res.result, 'stall', `無音を検出できなかった（検出系が機能していない）: ${JSON.stringify(res)}`);
    assert.equal(res.code, 3);
    // しきい値がミリ秒オーダーのため round2（小数第2位）で 0 に丸まりうる。数値型であることのみ確認する。
    assert.equal(typeof res.elapsed_min, 'number');
    assert.ok(res.elapsed_min >= 0);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-16)【制御群】runWatchdog: heartbeat が一度も作られないまま閾値超過すると exit 3', async () => {
  const cwd = makeTmpDir('watchdog-stall-unstarted-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log'); // 作成しない（着手前を模擬）
    const doneMarker = join(cwd, 'done');

    const res = await runWatchdog({ heartbeatPath, doneMarker, thresholdMin: 80 / 60_000, intervalSec: 20 / 1000 });

    assert.equal(res.result, 'stall', `未着手のまま閾値超過を検出できなかった: ${JSON.stringify(res)}`);
    assert.equal(res.code, 3);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// 封じ込め系（別プロセス spawn + 親からの setTimeout→SIGKILL。timeout(1) は使わない）
//
// 制御群「生の readFileSync → FIFO がハングし SIGKILL されること」を先に確認してから、
// watchdog.js 本体が同じ FIFO に対してハングせず exit 2 で完走することを確認する
// （インシデント #4 教訓13: 否定的観測には検出系の実測を対にする）。
// ===========================================================================

/**
 * 別プロセスでコマンドを実行し、親のタイムアウトで SIGKILL する。
 * 同期ハングはインプロセスの setTimeout / Promise.race では捕捉できないため、
 * 必ず別プロセス境界 + 外部シグナルで時間制限する（インシデント #4 教訓13）。
 *
 * @returns {Promise<{ code: number|null, signal: string|null, timedOut: boolean, stdout: string, stderr: string, elapsedMs: number }>}
 */
function runInChild(command, args, { cwd, timeoutMs }) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL'); // 同期read中のFIFOハングはSIGTERMでは死なない
    }, timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, timedOut, stdout, stderr, elapsedMs: Date.now() - started });
    });
  });
}

test('(#99-17)【制御群】生の readFileSync が FIFO で実際にハングし SIGKILL されること（検出系の機能実証）', async () => {
  const cwd = makeTmpDir('watchdog-fifo-control-');
  try {
    const fifoPath = join(cwd, 'raw.fifo');
    execFileSync('mkfifo', [fifoPath]);
    assert.ok(lstatSync(fifoPath).isFIFO(), '前提: FIFO であるべき');

    const script = `require('fs').readFileSync(${JSON.stringify(fifoPath)}); process.stdout.write('SHOULD_NOT_REACH_HERE');`;
    const r = await runInChild(process.execPath, ['-e', script], { cwd, timeoutMs: 1500 });

    assert.ok(r.timedOut, '制御群: 生の readFileSync がハングしなかった（検出系が機能していない証拠）');
    assert.equal(r.signal, 'SIGKILL', `制御群はSIGKILLで停止するはず（signal=${r.signal}）`);
    assert.ok(!r.stdout.includes('SHOULD_NOT_REACH_HERE'), 'ハングせず読み込みが完了してしまった');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-18)【変異テスト】heartbeat が FIFO のとき watchdog.js はハングせず exit 2 で完走する', async () => {
  const cwd = makeTmpDir('watchdog-fifo-hb-');
  try {
    const fifoPath = join(cwd, 'heartbeat.fifo');
    execFileSync('mkfifo', [fifoPath]);
    assert.ok(lstatSync(fifoPath).isFIFO(), '前提: FIFO であるべき');
    const doneMarker = join(cwd, 'done'); // 未作成

    const r = await runInChild(
      process.execPath,
      [WATCHDOG_BIN, fifoPath, '--threshold-min', '10', '--done-marker', doneMarker, '--interval-sec', '0.05'],
      { cwd, timeoutMs: 5000 }
    );

    assert.ok(!r.timedOut, `heartbeatがFIFOのときwatchdogがハングした（elapsed=${r.elapsedMs}ms）:\n${r.stdout}\n${r.stderr}`);
    assert.equal(r.code, 2, `exit 2 を期待: code=${r.code}, stdout=${r.stdout}`);
    const json = JSON.parse(r.stdout.trim());
    assert.equal(json.result, 'error');
    assert.ok(json.reason.includes('heartbeat'), `理由にheartbeatパスが含まれない: ${json.reason}`);
    // FIFO のまま（読み込みで置き換えられていない）
    assert.ok(lstatSync(fifoPath).isFIFO(), 'FIFO が置き換えられた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-19)【変異テスト】done-marker が FIFO のとき watchdog.js はハングせず exit 2 で完走する', async () => {
  const cwd = makeTmpDir('watchdog-fifo-done-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    touch(heartbeatPath);
    const fifoPath = join(cwd, 'done.fifo');
    execFileSync('mkfifo', [fifoPath]);
    assert.ok(lstatSync(fifoPath).isFIFO(), '前提: FIFO であるべき');

    const r = await runInChild(
      process.execPath,
      [WATCHDOG_BIN, heartbeatPath, '--threshold-min', '10', '--done-marker', fifoPath, '--interval-sec', '0.05'],
      { cwd, timeoutMs: 5000 }
    );

    assert.ok(!r.timedOut, `done-markerがFIFOのときwatchdogがハングした（elapsed=${r.elapsedMs}ms）:\n${r.stdout}\n${r.stderr}`);
    assert.equal(r.code, 2, `exit 2 を期待: code=${r.code}, stdout=${r.stdout}`);
    const json = JSON.parse(r.stdout.trim());
    assert.equal(json.result, 'error');
    assert.ok(json.reason.includes('done-marker'), `理由にdone-markerパスが含まれない: ${json.reason}`);
    assert.ok(lstatSync(fifoPath).isFIFO(), 'FIFO が置き換えられた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// CLI end-to-end（実プロセス起動。ハング懸念のないケースは spawnSync で可）
// ===========================================================================

test('(#99-20) CLI: 引数不正（--threshold-min 欠落）はexit 2でJSONエラーを出す', () => {
  const cwd = makeTmpDir('watchdog-cli-badargs-');
  try {
    const r = spawnSync(process.execPath, [WATCHDOG_BIN, join(cwd, 'hb'), '--done-marker', join(cwd, 'done')], {
      cwd, encoding: 'utf-8', timeout: 5000
    });
    assert.equal(r.status, 2);
    const json = JSON.parse(r.stdout.trim());
    assert.equal(json.result, 'error');
    assert.ok(json.reason.includes('threshold-min'));
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-21) CLI: done マーカーが存在すればexit 0でJSON結果を出す', () => {
  const cwd = makeTmpDir('watchdog-cli-done-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    const doneMarker = join(cwd, 'done');
    touch(doneMarker);
    const r = spawnSync(process.execPath, [
      WATCHDOG_BIN, heartbeatPath, '--threshold-min', '10', '--done-marker', doneMarker, '--interval-sec', '0.02'
    ], { cwd, encoding: 'utf-8', timeout: 5000 });
    assert.equal(r.status, 0, `stdout=${r.stdout} stderr=${r.stderr}`);
    const json = JSON.parse(r.stdout.trim());
    assert.equal(json.result, 'done');
    assert.equal(typeof json.elapsed_min, 'number');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#99-22) CLI: heartbeat無音のまま閾値超過するとexit 3でJSON結果を出す', () => {
  const cwd = makeTmpDir('watchdog-cli-stall-');
  try {
    const heartbeatPath = join(cwd, 'heartbeat.log');
    touch(heartbeatPath);
    const doneMarker = join(cwd, 'done');
    const r = spawnSync(process.execPath, [
      WATCHDOG_BIN, heartbeatPath, '--threshold-min', String(80 / 60_000), '--done-marker', doneMarker, '--interval-sec', '0.02'
    ], { cwd, encoding: 'utf-8', timeout: 5000 });
    assert.equal(r.status, 3, `stdout=${r.stdout} stderr=${r.stderr}`);
    const json = JSON.parse(r.stdout.trim());
    assert.equal(json.result, 'stall');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
