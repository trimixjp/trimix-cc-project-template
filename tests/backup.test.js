/**
 * バックアップ機能（bin/lib/backup.js）のテスト
 *
 * すべて一時ディレクトリ（mkdtempSync）上で実際に createBackup / ensureGitignore を
 * 呼び、退避されたファイルの中身・SHA-256・manifest.json を読んで検証する。
 * 文字列リテラルへの assert（トートロジー）は行わない。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

import {
  createBackup, ensureGitignore, sha256File, BACKUP_ROOT_DIRNAME
} from '../bin/lib/backup.js';

/** 一時プロジェクトルートを作る */
function makeCwd() {
  return mkdtempSync(join(tmpdir(), 'ai-team-backup-'));
}

/** cwd 配下の相対パスにファイルを書く（親ディレクトリも作る） */
function writeUnder(cwd, rel, content) {
  const abs = join(cwd, rel);
  mkdirSync(join(abs, '..'), { recursive: true });
  writeFileSync(abs, content, 'utf-8');
  return abs;
}

/** バイト列から SHA-256 を計算する（検証の独立実装） */
function hashOf(content) {
  return createHash('sha256').update(Buffer.from(content)).digest('hex');
}

/**
 * createBackupDir が世代ディレクトリ名に使う YYYYMMDD-HHMMSS 形式を再現する。
 * bin/lib/backup.js の formatTimestamp と同一のローカル時刻ロジック。
 * (f) が「実時計に依存せず」連番分岐を通すため、createBackup 実行時に生成される世代名を
 * 先回りして作成するのに使う。
 */
function timestampName(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

test('(a) 全ファイルが元の相対パスを保って退避される', () => {
  const cwd = makeCwd();
  const targets = [
    '.claude/teams/backend/agents/tech-lead.md',
    '.claude/teams/backend/workflow.yml',
    '.claude/escalation-rules.yml'
  ];
  writeUnder(cwd, targets[0], '# tech-lead 定義\n');
  writeUnder(cwd, targets[1], 'steps: []\n');
  writeUnder(cwd, targets[2], 'rules: []\n');

  const { dir, files } = createBackup({ cwd, targets, packageVersion: '9.9.9' });

  // 退避先が相対パスを保持していること（実ファイルの存在で検証）
  for (const rel of targets) {
    assert.ok(existsSync(join(dir, rel)), `${rel} が相対パスを保って退避されていない`);
  }
  // 退避先がバックアップルート配下であること
  assert.ok(dir.includes(BACKUP_ROOT_DIRNAME), '退避先が .ai-team-backups 配下でない');
  // files には退避した全対象が含まれること
  assert.deepEqual([...files].sort(), [...targets].sort(), 'files 一覧が退避対象と一致しない');
});

test('存在しない退避対象は除外され、エラーにならない', () => {
  const cwd = makeCwd();
  const real = '.claude/model-profiles.yml';
  writeUnder(cwd, real, 'profiles: {}\n');

  const { dir, files } = createBackup({
    cwd,
    targets: [real, '.claude/does-not-exist.yml'],
    packageVersion: '1.0.0'
  });

  assert.deepEqual(files, [real], '存在するファイルのみが退避されるべき');
  assert.ok(!existsSync(join(dir, '.claude/does-not-exist.yml')), '存在しない対象が退避されている');
});

test('(b) 退避後のファイルの SHA-256 が退避元と一致する', () => {
  const cwd = makeCwd();
  const rel = '.claude/teams/frontend/agents/implementer.md';
  const content = '# implementer\n本文にマルチバイト文字（日本語）も含む\n';
  const srcAbs = writeUnder(cwd, rel, content);

  const { dir } = createBackup({ cwd, targets: [rel], packageVersion: '2.0.0' });
  const destAbs = join(dir, rel);

  // 退避元・退避先を実際に読み直してハッシュ比較する
  assert.equal(sha256File(destAbs), sha256File(srcAbs), '退避先と退避元のハッシュが一致しない');
  assert.equal(sha256File(destAbs), hashOf(content), '退避先のハッシュが期待値と一致しない');
  // バイト列そのものも一致すること
  assert.ok(readFileSync(srcAbs).equals(readFileSync(destAbs)), '退避先のバイト列が退避元と異なる');
});

test('(c) manifest.json の内容が正しい（createdAt / packageVersion / files[].sha256）', () => {
  const cwd = makeCwd();
  const targets = [
    '.claude/teams/infra/workflow.yml',
    '.claude/commands/ai-team-run.md'
  ];
  const contents = ['steps: [plan]\n', '# ai-team-run スキル\n'];
  writeUnder(cwd, targets[0], contents[0]);
  writeUnder(cwd, targets[1], contents[1]);

  const before = Date.now();
  const { manifestPath } = createBackup({ cwd, targets, packageVersion: '3.1.4' });
  const after = Date.now();

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  // packageVersion
  assert.equal(manifest.packageVersion, '3.1.4', 'packageVersion が記録されていない');

  // createdAt が有効な ISO 文字列で、生成前後の時刻範囲に収まること
  const createdMs = Date.parse(manifest.createdAt);
  assert.ok(!Number.isNaN(createdMs), 'createdAt が有効な日時でない');
  assert.ok(createdMs >= before - 1000 && createdMs <= after + 1000, 'createdAt が生成時刻の範囲外');

  // files[] が全対象を含み、各 sha256 が実ファイルのハッシュと一致すること
  assert.equal(manifest.files.length, targets.length, 'files の件数が対象数と一致しない');
  for (let i = 0; i < targets.length; i++) {
    const entry = manifest.files.find((f) => f.path === targets[i]);
    assert.ok(entry, `${targets[i]} が manifest.files に無い`);
    assert.equal(entry.sha256, hashOf(contents[i]), `${targets[i]} の sha256 が実内容と一致しない`);
  }
});

test('(d) 退避のコピーに失敗した場合は例外を投げる（fail-closed）', () => {
  const cwd = makeCwd();
  // 退避対象としてディレクトリを渡すと copyFileSync が EISDIR で失敗する。
  // これにより「退避に失敗したら例外を投げて中断する」fail-closed 挙動を検証する。
  const badTarget = '.claude/teams/backend/agents';
  mkdirSync(join(cwd, badTarget), { recursive: true });

  assert.throws(
    () => createBackup({ cwd, targets: [badTarget], packageVersion: '1.0.0' }),
    /./,
    'コピー失敗時に例外を投げていない'
  );
});

test('(e) ensureGitignore は冪等（2回実行しても行が重複しない）', () => {
  const cwd = makeCwd();
  const gitignorePath = join(cwd, '.gitignore');

  // .gitignore が無い状態から作成される
  const first = ensureGitignore(cwd);
  assert.equal(first.added, true, '初回は追記されるべき');
  const afterFirst = readFileSync(gitignorePath, 'utf-8');
  const entryLine = `${BACKUP_ROOT_DIRNAME}/`;
  const count1 = afterFirst.split('\n').filter((l) => l.trim() === entryLine).length;
  assert.equal(count1, 1, '初回実行後にエントリが1行だけ存在するべき');

  // 2回目は何もしない（冪等）
  const second = ensureGitignore(cwd);
  assert.equal(second.added, false, '2回目は追記されないべき');
  const afterSecond = readFileSync(gitignorePath, 'utf-8');
  const count2 = afterSecond.split('\n').filter((l) => l.trim() === entryLine).length;
  assert.equal(count2, 1, '2回実行してもエントリは1行のままであるべき');
  assert.equal(afterSecond, afterFirst, '2回目で .gitignore の内容が変化してはならない');
});

test('(f) 既存の世代ディレクトリを再利用せず連番へ退避する（実時計に依存せず連番分岐を決定的に通す・R-1）', () => {
  const cwd = makeCwd();
  const rel = '.claude/teams/backend/workflow.yml';
  const root = join(cwd, BACKUP_ROOT_DIRNAME);

  // createBackup 実行時に createBackupDir が生成する世代名（YYYYMMDD-HHMMSS）を「事前に作成」し、
  // mkdirSync(recursive:false) を EEXIST で弾かせて連番分岐（-2 以降）を決定的に通す。
  // これにより「秒境界をまたいでタイムスタンプが元から異なり、連番分岐を一度も通らないまま緑になる」
  // 実時計依存の偽陽性を排除する。
  //
  // 世代名は createBackup 呼び出し時点の秒に依存するため、直前の数回のファイル操作で秒境界を
  // またいでも確実に先回りできるよう、現在秒と次秒の両方の世代ディレクトリを先に作る。
  // それぞれに番兵ファイルを置き、createBackupDir が既存世代を黙って再利用（上書き）していないことを
  // 後で検出できるようにする（recursive:true への実装退行は、番兵を含むこのディレクトリを退避先に
  // 再利用してしまうため、下の assert で確実に落ちる）。
  const occupied = [new Date(), new Date(Date.now() + 1000)].map(timestampName);
  for (const name of occupied) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'sentinel.txt'), `既存世代 ${name} の番兵\n`, 'utf-8');
  }

  writeUnder(cwd, rel, '退避対象の内容\n');
  const b = createBackup({ cwd, targets: [rel], packageVersion: '1.0.0' });

  // 退避先が「事前作成した世代名」そのものではなく、連番分岐を通った `-2` であること。
  // どちらの秒に着地しても該当秒の `-2` に退避されるため、両候補のいずれかに一致すればよい。
  const expectedDirs = occupied.map((name) => join(root, `${name}-2`));
  assert.ok(
    expectedDirs.includes(b.dir),
    `連番分岐（-2）を通っていない。退避先=${b.dir} / 期待=${expectedDirs.join(' | ')}`
  );

  // 事前作成した既存世代が黙って再利用（上書き）されていないこと（番兵が無傷）。
  // recursive:true への退行では、退避先として既存世代を再利用し番兵と同ディレクトリに書き込むため、
  // b.dir が上の `-2` 期待に一致せず、この assert 群の前段で落ちる。
  for (const name of occupied) {
    assert.equal(
      readFileSync(join(root, name, 'sentinel.txt'), 'utf-8'), `既存世代 ${name} の番兵\n`,
      `既存世代 ${name} の番兵が上書きされた（世代ディレクトリが黙って再利用された）`
    );
  }

  // 退避内容そのものは正しく新世代へ書かれていること（退避が実際に走ったことのサニティチェック）。
  assert.equal(
    readFileSync(join(b.dir, rel), 'utf-8'), '退避対象の内容\n',
    '新世代へ退避した内容が正しくない'
  );
  const m = JSON.parse(readFileSync(join(b.dir, 'manifest.json'), 'utf-8'));
  assert.equal(
    m.files.find((f) => f.path === rel).sha256, hashOf('退避対象の内容\n'),
    '新世代の manifest.json の sha256 が退避内容と一致しない'
  );
});

test('(g) コピー内容が退避元と一致しないとき例外を投げる（SHA-256検証の最終防衛線・R-2）', () => {
  const cwd = makeCwd();
  const rel = '.claude/teams/backend/workflow.yml';
  writeUnder(cwd, rel, '正しい内容\n');

  // コピー先へ退避元と異なる内容を書き込む copyFile を注入する。
  // これで「コピー自体は成功したが内容が退避元と一致しない」経路を再現し、
  // createBackup が退避先を再読して SHA-256 照合し、不一致を検出して例外を
  // 投げること（最終防衛線）を確認する。退避元を2回読むだけの反パターンでは
  // この不一致を検出できないため、このテストが検証の実効性を担保する。
  const corruptingCopy = (_srcAbs, destAbs) => {
    writeFileSync(destAbs, '破損した別内容\n', 'utf-8');
  };

  assert.throws(
    () => createBackup({
      cwd, targets: [rel], packageVersion: '1.0.0', copyFile: corruptingCopy
    }),
    /検証に失敗/,
    'コピー内容が退避元と一致しないとき検証例外を投げるべき'
  );
});

test('(e) 既存の .gitignore の末尾に改行が無くても行が連結されない', () => {
  const cwd = makeCwd();
  const gitignorePath = join(cwd, '.gitignore');
  // 末尾に改行の無い既存 .gitignore
  writeFileSync(gitignorePath, 'node_modules/\n*.log', 'utf-8');

  ensureGitignore(cwd);
  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map((l) => l.trim());

  // 既存行が壊れていないこと
  assert.ok(lines.includes('*.log'), '既存の *.log 行が壊れている');
  // バックアップエントリが独立した行として存在すること
  assert.ok(lines.includes(`${BACKUP_ROOT_DIRNAME}/`), 'バックアップエントリが追記されていない');
  // "*.log.ai-team-backups/" のような連結が起きていないこと
  assert.ok(!content.includes(`*.log${BACKUP_ROOT_DIRNAME}`), '行が連結されている');
});
