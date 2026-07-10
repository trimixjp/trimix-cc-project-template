/**
 * baseline（ハッシュ台帳）と upgrade の三方比較保護（Issue #85）のテスト
 *
 * すべて一時ディレクトリ（mkdtempSync）を cwd として実関数を呼び、ファイルの中身を
 * 読んで検証する。テンプレートの正源はリポジトリの templates/・skills/ をそのまま参照する。
 *
 * 中核の規則:
 *   現物 == baseline（前回このツールが書いた内容）  → 未編集 → 更新
 *   現物 != baseline                              → 編集済み → 保護（.new）
 *   baseline に記録が無い                          → 判定不能 → 保護（安全側）
 *   ヘッダ5行に # customized: true                 → ハッシュに関わらず保護（後方互換）
 *
 * 正規化は「CRLF→LF」と「末尾改行の有無」のみ。空白は削らない（本物の編集を見逃さない）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  symlinkSync, linkSync, lstatSync
} from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

import { runUpgrade, diffTargets, enumerateUpgradeTargets, runBaseline } from '../bin/lib/upgrade.js';
import {
  normalizedHash, loadBaseline, saveBaseline, recordEntries, recordFiles, pruneMissing,
  matchesBaseline, BASELINE_REL
} from '../bin/lib/baseline.js';
import { applyModelProfile } from '../bin/lib/apply-model-profile.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, '..');

/** リポジトリの実テンプレートを読む */
function readTemplate(rel) {
  return readFileSync(join(packageRoot, 'templates', rel), 'utf-8');
}

/** cwd 配下の相対パスにファイルを書く（親も作る） */
function writeUnder(cwd, rel, content) {
  const abs = join(cwd, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return abs;
}

/** frontmatter から key の値を1つ取り出す（先頭一致・簡易） */
function frontmatterValue(content, key) {
  const m = content.match(new RegExp(`^${key}:\\s*(\\S+)`, 'm'));
  return m ? m[1] : null;
}

/** 標準出力を捕捉する */
async function captureStdout(fn) {
  const orig = process.stdout.write.bind(process.stdout);
  let out = '';
  process.stdout.write = (chunk) => { out += typeof chunk === 'string' ? chunk : chunk.toString(); return true; };
  try { await fn(); } finally { process.stdout.write = orig; }
  return out;
}

/** 標準エラーを捕捉する */
async function captureStderr(fn) {
  const orig = process.stderr.write.bind(process.stderr);
  let err = '';
  process.stderr.write = (chunk) => { err += typeof chunk === 'string' ? chunk : chunk.toString(); return true; };
  try { await fn(); } finally { process.stderr.write = orig; }
  return err;
}

const WORKFLOW_REL = '.claude/teams/backend/workflow.yml';
const OLD_WORKFLOW = '# 旧世代のワークフロー（テンプレートと異なる）\nsteps: []\n';

/**
 * backend の workflow.yml を「ツールが前回配置した」状態で用意する。
 * content を配置し、その正規化ハッシュを baseline に記録して返す。
 */
function makeSeeded(content = OLD_WORKFLOW) {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-'));
  writeUnder(cwd, WORKFLOW_REL, content);
  recordFiles(cwd, [WORKFLOW_REL]);
  return cwd;
}

// ===========================================================================
// baseline モジュールの単体テスト
// ===========================================================================

test('(#85-U1) normalizedHash: CRLF と LF は同じハッシュになる', () => {
  const lf = 'a: 1\nb: 2\n';
  const crlf = 'a: 1\r\nb: 2\r\n';
  assert.equal(normalizedHash(lf), normalizedHash(crlf), 'CRLF→LF 正規化が効いていない');
});

test('(#85-U2) normalizedHash: 末尾改行の有無は同じハッシュになる', () => {
  assert.equal(
    normalizedHash('a: 1\nb: 2\n'), normalizedHash('a: 1\nb: 2'),
    '末尾改行の有無を揃えていない'
  );
});

test('(#85-U3) normalizedHash: 行頭の空白差は別のハッシュになる（正規化しすぎない）', () => {
  assert.notEqual(
    normalizedHash('a: 1\nb: 2\n'), normalizedHash('a: 1\n b: 2\n'),
    '行頭の空白を削ってしまっている（本物の編集を見逃す）'
  );
});

test('(#85-U4) normalizedHash: 行中・行末の空白差も別のハッシュになる', () => {
  assert.notEqual(normalizedHash('a: 1\n'), normalizedHash('a:  1\n'), '行中の空白を削っている');
  assert.notEqual(normalizedHash('a: 1\n'), normalizedHash('a: 1 \n'), '行末の空白を削っている');
});

test('(#85-U5) loadBaseline: ファイルが無ければ空を返し例外を投げない', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-'));
  try {
    const bl = loadBaseline(cwd);
    assert.deepEqual(bl.files, {});
    assert.equal(bl.version, null);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-U6) recordEntries → loadBaseline のラウンドトリップ', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-'));
  try {
    const res = recordEntries(cwd, { '.claude/a.yml': 'hash-a', '.claude/b.yml': 'hash-b' });
    assert.equal(res.written, true);
    const bl = loadBaseline(cwd);
    assert.equal(bl.files['.claude/a.yml'], 'hash-a');
    assert.equal(bl.files['.claude/b.yml'], 'hash-b');
    // 追加・更新（マージ）される
    recordEntries(cwd, { '.claude/a.yml': 'hash-a2', '.claude/c.yml': 'hash-c' });
    const bl2 = loadBaseline(cwd);
    assert.equal(bl2.files['.claude/a.yml'], 'hash-a2', '既存キーが更新されていない');
    assert.equal(bl2.files['.claude/b.yml'], 'hash-b', '既存キーが消えた');
    assert.equal(bl2.files['.claude/c.yml'], 'hash-c', '新規キーが追加されていない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-U7) pruneMissing: 実在しないファイルの記録を剪定する', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-'));
  try {
    writeUnder(cwd, '.claude/exists.yml', 'x\n');
    recordEntries(cwd, {
      '.claude/exists.yml': normalizedHash('x\n'),
      '.claude/gone.yml': 'stale-hash'
    });
    const res = pruneMissing(cwd);
    assert.deepEqual(res.pruned, ['.claude/gone.yml']);
    const bl = loadBaseline(cwd);
    assert.ok(bl.files['.claude/exists.yml'], '実在する記録が消えた');
    assert.ok(!bl.files['.claude/gone.yml'], '実在しない記録が剪定されていない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-U8) matchesBaseline: 記録の有無と一致を区別する', () => {
  const bl = { version: null, files: { '.claude/a.yml': normalizedHash('a\n') } };
  assert.deepEqual(matchesBaseline(bl, '.claude/a.yml', 'a\n'), { recorded: true, matches: true });
  assert.deepEqual(matchesBaseline(bl, '.claude/a.yml', 'a\r\n'), { recorded: true, matches: true }); // 正規化
  assert.deepEqual(matchesBaseline(bl, '.claude/a.yml', 'b\n'), { recorded: true, matches: false });
  assert.deepEqual(matchesBaseline(bl, '.claude/none.yml', 'x'), { recorded: false, matches: false });
});

// ===========================================================================
// upgrade の三方比較保護
// ===========================================================================

test('(#85-1) baseline と一致するファイルは更新される', async () => {
  const cwd = makeSeeded();
  try {
    const abs = join(cwd, WORKFLOW_REL);
    const template = readTemplate('teams/backend/workflow.yml');
    assert.notEqual(readFileSync(abs, 'utf-8'), template, '前提: 旧内容はテンプレートと異なる');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(abs, 'utf-8'), template, 'baseline 一致なのに更新されなかった');
    assert.ok(!existsSync(`${abs}.new`), '更新なのに .new が書き出された');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-2) baseline と不一致（1文字追加）は保護され .new が書かれる', async () => {
  const cwd = makeSeeded();
  try {
    const abs = join(cwd, WORKFLOW_REL);
    // ユーザーが1文字追加して編集した（baseline とハッシュが変わる）
    const edited = `${OLD_WORKFLOW}x`;
    writeFileSync(abs, edited, 'utf-8');
    const template = readTemplate('teams/backend/workflow.yml');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(abs, 'utf-8'), edited, '編集済みファイルが上書きされた（保護されていない）');
    assert.ok(existsSync(`${abs}.new`), '保護されたのに .new が書き出されていない');
    assert.equal(readFileSync(`${abs}.new`, 'utf-8'), template, '.new の内容がテンプレートと一致しない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-3) baseline に記録が無いファイルは保護される（安全側）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-'));
  try {
    const abs = writeUnder(cwd, WORKFLOW_REL, OLD_WORKFLOW); // baseline を記録しない
    assert.ok(!existsSync(join(cwd, BASELINE_REL)), '前提: baseline は無い');

    const out = await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0);
    });

    assert.equal(readFileSync(abs, 'utf-8'), OLD_WORKFLOW, '記録が無いのに上書きされた');
    assert.ok(existsSync(`${abs}.new`), '記録が無いとき .new が書かれていない（保護されていない）');
    // 自動判定の確立方法（baseline record）が案内される
    assert.ok(out.includes('baseline record'), `baseline record の案内が無い:\n${out}`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-4) CRLF に変換しただけのファイルは更新される（正規化が効く）', async () => {
  const cwd = makeSeeded(OLD_WORKFLOW); // baseline は LF 版で記録
  try {
    const abs = join(cwd, WORKFLOW_REL);
    // 中身は同じで改行だけ CRLF に変換する（バイト列はテンプレートとも baseline とも異なる）
    writeFileSync(abs, OLD_WORKFLOW.replace(/\n/g, '\r\n'), 'utf-8');
    const template = readTemplate('teams/backend/workflow.yml');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(abs, 'utf-8'), template, 'CRLF 変換だけなのに更新されなかった（正規化が効いていない）');
    assert.ok(!existsSync(`${abs}.new`), 'CRLF 変換だけなのに保護された');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-5) 末尾改行を足しただけのファイルは更新される', async () => {
  // baseline は末尾改行「あり」の内容から取り、現物は末尾改行を1つ増やす
  const base = '# 旧世代\nsteps: []\n';
  const cwd = makeSeeded(base);
  try {
    const abs = join(cwd, WORKFLOW_REL);
    writeFileSync(abs, `${base}\n`, 'utf-8'); // 末尾に改行をもう1つ（正規化で吸収される差）
    const template = readTemplate('teams/backend/workflow.yml');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(abs, 'utf-8'), template, '末尾改行を足しただけなのに更新されなかった');
    assert.ok(!existsSync(`${abs}.new`), '末尾改行を足しただけなのに保護された');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-6) 行頭に空白を1つ足したファイルは保護される（正規化しすぎていない）', async () => {
  const base = '# 旧世代\nsteps: []\n';
  const cwd = makeSeeded(base);
  try {
    const abs = join(cwd, WORKFLOW_REL);
    const edited = '# 旧世代\n steps: []\n'; // steps の前に空白1つ（YAML 上は意味が変わりうる編集）
    writeFileSync(abs, edited, 'utf-8');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    assert.equal(readFileSync(abs, 'utf-8'), edited, '行頭空白を足した編集が上書きされた（保護されていない）');
    assert.ok(existsSync(`${abs}.new`), '行頭空白の編集が保護されず .new も書かれていない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-7) # customized: true があればハッシュ一致でも保護される（後方互換）', async () => {
  // 本体はマーカー付き。baseline にはその本体をそのまま記録する（ハッシュは一致する）。
  const marked = '# customized: true\n# 旧世代のワークフロー\nsteps: []\n';
  const cwd = makeSeeded(marked);
  try {
    const abs = join(cwd, WORKFLOW_REL);
    // 前提: baseline と現物のハッシュは一致する（マーカーが無ければ update になる状況）
    assert.ok(
      matchesBaseline(loadBaseline(cwd), WORKFLOW_REL, readFileSync(abs)).matches,
      '前提: baseline と現物のハッシュは一致するべき'
    );

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    // マーカーがあるためハッシュ一致でも保護される
    assert.equal(readFileSync(abs, 'utf-8'), marked, 'マーカー付きファイルがハッシュ一致で上書きされた');
    assert.ok(existsSync(`${abs}.new`), 'マーカー保護なのに .new が書かれていない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-8) 実在の配布物 ai-team-configure.md は baseline 一致で update に分類される（インシデント#3・#85）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-cfg-'));
  try {
    const realConfigure = readFileSync(join(packageRoot, 'skills', 'ai-team-configure.md'), 'utf-8');
    // 本文にマーカー文字列を含むが、ヘッダ5行には無い（誤検出の温床）
    assert.ok(realConfigure.includes('# customized: true'), '前提: 本文にマーカー文字列がある');
    assert.ok(
      !realConfigure.split('\n').slice(0, 5).join('\n').includes('# customized: true'),
      '前提: 先頭5行にはマーカーが無い'
    );
    const dest = '.claude/commands/ai-team-configure.md';
    // 旧版として配置し（末尾に1行加える）、baseline に記録（ツールが配置した未編集状態）
    const oldContent = `${realConfigure}\n<!-- 旧版 -->\n`;
    writeUnder(cwd, dest, oldContent);
    recordFiles(cwd, [dest]);

    const { targets } = enumerateUpgradeTargets({ teams: [] });
    const diffs = diffTargets({ cwd, targets, force: false });
    const d = diffs.find((t) => t.dest.split(sep).join('/') === dest);
    assert.ok(d, 'ai-team-configure.md が対象に含まれていない');
    // 本文マーカーの誤検出も no-baseline 誤保護もせず、update に分類される
    assert.equal(d.category, 'update', `configure が update でなく ${d.category}（reason=${d.reason}）`);

    const code = await runUpgrade(['--yes'], { cwd });
    assert.equal(code, 0);
    assert.equal(readFileSync(join(cwd, dest), 'utf-8'), realConfigure, 'configure が最新へ更新されていない');
    assert.ok(!existsSync(join(cwd, `${dest}.new`)), '誤って保護され .new が書かれた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// モデルプロファイルの維持（E2E）と apply-model-profile の baseline 記録
// ===========================================================================

test('(#85-9) apply-model-profile が baseline を記録する（経路4）', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-profile-'));
  try {
    const rel = '.claude/teams/backend/agents/tech-lead.md';
    writeUnder(cwd, rel, readFileSync(join(packageRoot, 'templates/teams/backend/agents/tech-lead.md'), 'utf-8'));
    assert.ok(!existsSync(join(cwd, BASELINE_REL)), '前提: baseline は未作成');

    applyModelProfile({
      root: join(cwd, '.claude'),
      performanceId: 'low-cost', effortId: 'deep', runtimeId: 'claude-code'
    });

    const bl = loadBaseline(cwd);
    assert.ok(bl.files[rel], 'apply-model-profile が baseline に記録していない');
    // 記録ハッシュは適用後（sonnet/xhigh）の現物の正規化ハッシュと一致する
    assert.equal(bl.files[rel], normalizedHash(readFileSync(join(cwd, rel))), '記録ハッシュが現物と一致しない');
    // 適用後は leader=sonnet（low-cost）になっている
    assert.equal(frontmatterValue(readFileSync(join(cwd, rel), 'utf-8'), 'model'), 'sonnet');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-10) upgrade 後もモデルプロファイル（model / effort）が維持される（E2E）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-e2e-'));
  try {
    const rel = '.claude/teams/backend/agents/tech-lead.md';
    // テンプレート既定（balance: opus / normal: high）の tech-lead を配置
    writeUnder(cwd, rel, readFileSync(join(packageRoot, 'templates/teams/backend/agents/tech-lead.md'), 'utf-8'));
    // ユーザーは「低コスト（leader=sonnet）＋深く（xhigh）」を選択したことにする
    writeUnder(cwd, '.claude/ai-team-config.yml',
      'mode: solo\nruntime: claude-code\nmodel_performance: low-cost\neffort_depth: deep\n');
    // setup 相当: プロファイル適用（tech-lead=sonnet/xhigh になり baseline も記録される）
    applyModelProfile({
      root: join(cwd, '.claude'),
      performanceId: 'low-cost', effortId: 'deep', runtimeId: 'claude-code'
    });

    const before = readFileSync(join(cwd, rel), 'utf-8');
    assert.equal(frontmatterValue(before, 'model'), 'sonnet', '前提: 適用後は sonnet');
    assert.equal(frontmatterValue(before, 'effort'), 'xhigh', '前提: 適用後は xhigh');

    const code = await runUpgrade(['backend', '--yes'], { cwd });
    assert.equal(code, 0);

    const after = readFileSync(join(cwd, rel), 'utf-8');
    // テンプレート適用で opus/high に戻るはずが、プロファイル再適用で sonnet/xhigh が維持される
    assert.equal(frontmatterValue(after, 'model'), 'sonnet', 'upgrade でモデル選択（model）が失われた');
    assert.equal(frontmatterValue(after, 'effort'), 'xhigh', 'upgrade で effort 選択が失われた');
    // baseline も更新後の内容で記録され直している
    assert.equal(loadBaseline(cwd).files[rel], normalizedHash(after), 'upgrade 後の baseline が現物と一致しない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// baseline サブコマンドと防御
// ===========================================================================

test('(#85-11) baseline record は既存 baseline があれば --force なしで拒否する', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-cli-'));
  try {
    // 既存 baseline を作る（backend workflow をテンプレートで配置し記録）
    writeUnder(cwd, WORKFLOW_REL, readTemplate('teams/backend/workflow.yml'));
    recordFiles(cwd, [WORKFLOW_REL]);
    assert.ok(existsSync(join(cwd, BASELINE_REL)), '前提: baseline が存在する');

    let code1;
    const err = await captureStderr(async () => { code1 = runBaseline(['record'], { cwd }); });
    assert.equal(code1, 1, '既存 baseline があるのに --force なしで record が成功した');
    assert.ok(err.includes('既に存在') || err.includes('--force'), `拒否理由の案内が無い:\n${err}`);

    // --force なら成功する
    let code2;
    await captureStdout(async () => { code2 = runBaseline(['record', '--force'], { cwd }); });
    assert.equal(code2, 0, '--force でも record が成功しない');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-12) baseline show は記録内容を表示する', async () => {
  const cwd = makeSeeded();
  try {
    const out = await captureStdout(async () => {
      const code = runBaseline(['show'], { cwd });
      assert.equal(code, 0);
    });
    assert.ok(out.includes(WORKFLOW_REL), `show に記録ファイルのパスが無い:\n${out}`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-13) baseline がシンボリックリンク／ハードリンク／ディレクトリのとき書かずに警告する', async () => {
  // (a) シンボリックリンク
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-link-'));
    try {
      const victim = join(cwd, 'victim.txt');
      writeFileSync(victim, '外部（不変であるべき）\n', 'utf-8');
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      symlinkSync(victim, join(cwd, BASELINE_REL));

      const out = await captureStdout(async () => {
        const res = saveBaseline(cwd, { version: '0.24.0', files: { x: 'y' } });
        assert.equal(res.written, false, 'シンボリックリンクなのに書き込んだ');
        assert.equal(res.reason, 'symlink');
      });
      assert.equal(readFileSync(victim, 'utf-8'), '外部（不変であるべき）\n', 'リンク先が書き換えられた');
      assert.ok(out.includes('シンボリックリンク'), `警告が無い:\n${out}`);
      assert.ok(lstatSync(join(cwd, BASELINE_REL)).isSymbolicLink(), 'リンクが実ファイルに置換された');
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
  // (b) ハードリンク
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-link-'));
    try {
      const victim = join(cwd, 'victim.txt');
      const content = '外部（inode 共有・不変）\n';
      writeFileSync(victim, content, 'utf-8');
      mkdirSync(join(cwd, '.claude'), { recursive: true });
      linkSync(victim, join(cwd, BASELINE_REL));

      const out = await captureStdout(async () => {
        const res = saveBaseline(cwd, { version: '0.24.0', files: { x: 'y' } });
        assert.equal(res.written, false, 'ハードリンクなのに書き込んだ');
        assert.equal(res.reason, 'hardlink');
      });
      assert.equal(readFileSync(victim, 'utf-8'), content, 'ハードリンク先 inode が書き換えられた');
      assert.ok(out.includes('ハードリンク'), `警告が無い:\n${out}`);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
  // (c) ディレクトリ
  {
    const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-link-'));
    try {
      mkdirSync(join(cwd, BASELINE_REL), { recursive: true }); // baseline パスをディレクトリにする
      const out = await captureStdout(async () => {
        const res = saveBaseline(cwd, { version: '0.24.0', files: { x: 'y' } });
        assert.equal(res.written, false, 'ディレクトリなのに書き込んだ');
        assert.equal(res.reason, 'irregular');
      });
      assert.ok(lstatSync(join(cwd, BASELINE_REL)).isDirectory(), 'ディレクトリが置き換えられた');
      assert.ok(out.includes('通常ファイルではない'), `警告が無い:\n${out}`);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  }
});

test('(#85-14) 不正な JSON の baseline は例外を投げず空として扱い、upgrade も落ちない', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-badjson-'));
  try {
    writeUnder(cwd, BASELINE_REL, '{ これは不正な JSON ');
    writeUnder(cwd, WORKFLOW_REL, OLD_WORKFLOW);

    // loadBaseline は例外を投げず空を返す
    let bl;
    await captureStdout(async () => { bl = loadBaseline(cwd); });
    assert.deepEqual(bl.files, {}, '不正 JSON を空として扱っていない');

    // upgrade も未捕捉例外で落ちず、記録が無い扱い（＝保護）で完走する
    const abs = join(cwd, WORKFLOW_REL);
    await captureStdout(async () => {
      const code = await runUpgrade(['backend', '--yes'], { cwd });
      assert.equal(code, 0, '不正 baseline で upgrade が異常終了した');
    });
    assert.equal(readFileSync(abs, 'utf-8'), OLD_WORKFLOW, '判定不能なのに上書きされた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-15) --dry では baseline を書かない（副作用ゼロ）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-dry-'));
  try {
    writeUnder(cwd, WORKFLOW_REL, OLD_WORKFLOW); // baseline は作らない
    assert.ok(!existsSync(join(cwd, BASELINE_REL)), '前提: baseline は無い');

    const code = await runUpgrade(['backend', '--dry'], { cwd });
    assert.equal(code, 0);

    assert.ok(!existsSync(join(cwd, BASELINE_REL)), '--dry なのに baseline が作られた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

// ===========================================================================
// #85 差し戻し2: 読み込み経路の封じ込め（loadBaseline）
//
// 書き込み側 saveBaseline には symlink / hardlink / irregular の3検査があるのに、
// 読み込み側 loadBaseline に写し忘れていた。baseline が FIFO のとき readFileSync が
// リーダー／ライターの揃うまでプロセスごと同期ブロックしてハングする（try/catch では
// 捕捉できない。同期ブロックは例外ではない）。
//
// 同期ハングはインプロセスのタイマ（setTimeout / Promise.race）では計測できないため、
// FIFO ケースは必ず別プロセス（spawn）+ 親からの SIGKILL で検証する。ガードを外すと
// 子がハング → 親が SIGKILL → この回帰テストが落ちる（変異テスト）。
// ===========================================================================

const BASELINE_MODULE = pathToFileURL(join(packageRoot, 'bin/lib/baseline.js')).href;

/**
 * 別プロセスで module 関数を実行し、親のタイムアウトで SIGKILL する。
 * ガードが機能していれば子は即座に完走する。ガードを外すと FIFO の readFileSync で
 * 同期ブロックしてハングし、タイムアウトで SIGKILL される（hung=true）。
 *
 * @param {string} script `--input-type=module -e` に渡す ESM スニペット（トップレベル await 可）
 * @param {string} cwd 子プロセスの作業ディレクトリ
 * @param {number} timeoutMs 親のハング判定タイムアウト
 * @returns {Promise<{ hung: boolean, code: number|null, signal: string|null, out: string }>}
 */
function runGuardChild(script, cwd, timeoutMs = 12000) {
  return new Promise((res) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
      cwd, stdio: ['ignore', 'pipe', 'pipe']
    });
    let out = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    let hung = false;
    const timer = setTimeout(() => { hung = true; child.kill('SIGKILL'); }, timeoutMs);
    child.on('exit', (code, signal) => { clearTimeout(timer); res({ hung, code, signal, out }); });
  });
}

test('(#85-16) baseline が FIFO のとき loadBaseline はハングせず空扱い+警告する（別プロセス+SIGKILL・変異テスト）', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-fifo-'));
  try {
    const abs = join(cwd, BASELINE_REL);
    mkdirSync(dirname(abs), { recursive: true });
    // Node に mkfifoSync は無いため mkfifo(1) を使う（既存 FIFO テストと同じ Unix 前提）
    execFileSync('mkfifo', [abs]);
    assert.ok(lstatSync(abs).isFIFO(), '前提: baseline は FIFO であるべき');

    // 別プロセスで loadBaseline を呼ぶ。ガードがあれば即座に完走し、無ければ FIFO の
    // readFileSync で同期ブロックしてハングする（親が SIGKILL で hung=true にする）。
    const script = `
      const { loadBaseline } = await import(${JSON.stringify(BASELINE_MODULE)});
      const b = loadBaseline(${JSON.stringify(cwd)});
      process.stdout.write('CHILD_DONE:' + JSON.stringify(b.files));
    `;
    const r = await runGuardChild(script, cwd);

    assert.ok(!r.hung,
      'FIFO baseline で loadBaseline がハングした（ガードが無い＝変異テストが検出すべき事象）');
    assert.equal(r.code, 0, `子プロセスが異常終了した: ${r.out}`);
    assert.ok(r.out.includes('CHILD_DONE:{}'),
      `loadBaseline が空 baseline を返していない（FIFO を読んでしまった）:\n${r.out}`);
    assert.ok(r.out.includes('通常ファイルではない'),
      `FIFO baseline のスキップ警告が出ていない:\n${r.out}`);
    // FIFO のまま（読み書きで置き換えられていない）
    assert.ok(lstatSync(abs).isFIFO(), 'FIFO baseline が置き換えられた');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('(#85-17) baseline がディレクトリのとき loadBaseline は生クラッシュせず空扱い+警告する', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-team-baseline-dir-'));
  try {
    const abs = join(cwd, BASELINE_REL);
    // baseline パスをディレクトリにする。ガードが無いと readFileSync が EISDIR を投げ、
    // 既存 try/catch が拾って空になるが、警告文言が異なる。ガードがあれば読まずに
    // 「通常ファイルではない（directory）」と明示する（この文言が変異テストの識別点）。
    mkdirSync(abs, { recursive: true });
    assert.ok(lstatSync(abs).isDirectory(), '前提: baseline はディレクトリであるべき');

    let bl;
    const out = await captureStdout(async () => { bl = loadBaseline(cwd); });

    assert.deepEqual(bl.files, {}, 'ディレクトリ baseline なのに空でない');
    assert.ok(out.includes('通常ファイルではない（directory）'),
      `ディレクトリ baseline のガード警告（種別明示）が出ていない:\n${out}`);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
