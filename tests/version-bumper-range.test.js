/**
 * version-bumper 範囲判定ロジックの回帰テスト（Issue #54）
 *
 * 背景: git タグが未初期化のリポジトリでは、従来 version-bumper の対象コミット範囲が
 *       RANGE="HEAD"（全履歴）にフォールバックし、過去の大量の `feat:` を誤って拾って
 *       semver 種別を誤判定（誤バンプ）していた。
 *
 * 本テストは、エージェント定義（手順書）である version-bumper.md に対し:
 *   (1) 多段フォールバック（タグ無し時に直近の版バンプコミットを境界にする）の記述が含まれること
 *   (2) 版バンプコミット検出正規表現が `chore: vX.Y.Z にバージョンアップ` にマッチし、
 *       `feat:` 等の他種別コミットにはマッチしないこと
 * を検証する。SSOT（templates/）を真の情報源として参照する既存方針に揃える。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, '..');

// SSOT（テンプレートが真の情報源。.claude/ は sync 生成のため検査対象にしない）
const SSOT_PATH = join(
  packageRoot,
  'templates',
  'teams',
  'backend',
  'agents',
  'version-bumper.md'
);

// tech-writer も version-bumper と同一の多段フォールバックで RANGE を決定する（Issue #71）
const TECH_WRITER_PATH = join(
  packageRoot,
  'templates',
  'teams',
  'backend',
  'agents',
  'tech-writer.md'
);

/**
 * version-bumper.md が参照する版バンプコミット検出の正規表現（SSOT のコマンドブロックと一致）。
 * git log --format='%H %s' の各行（`<hash> <subject>` 形式）に適用する想定。
 */
const BUMP_LINE_RE = /^[0-9a-f]+ chore: v[0-9]+\.[0-9]+\.[0-9]+ にバージョンアップ$/;

/**
 * サブジェクト単独（HEAD 自身がバンプコミットかの判定用。SSOT のコマンドブロックと一致）。
 */
const BUMP_SUBJECT_RE = /^chore: v[0-9]+\.[0-9]+\.[0-9]+ にバージョンアップ$/;

// ============================================================
// (1) 多段フォールバックの記述が version-bumper.md に含まれること
// ============================================================

test('範囲判定: version-bumper.md に多段フォールバック（タグ無し時に直近版バンプコミットを境界化）の記述が含まれる', () => {
  const content = readFileSync(SSOT_PATH, 'utf-8');

  // タグ境界（後方互換）の記述
  assert.ok(
    content.includes('git describe --tags --abbrev=0'),
    'タグ境界判定（git describe）の記述が見当たらない'
  );

  // 直近版バンプコミット境界（本対策の主軸）の検出正規表現が手順書に明記されている
  assert.ok(
    /chore: v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+ にバージョンアップ/.test(content),
    '直近版バンプコミット検出の正規表現（chore: vX.Y.Z にバージョンアップ）が手順書に明記されていない'
  );

  // package.json version 変更コミット境界（補助フォールバック）の記述
  assert.ok(
    content.includes('git log -1 --format=') && content.includes('package.json'),
    'package.json version 変更コミット境界（補助フォールバック）の記述が見当たらない'
  );

  // HEAD 全件は真の初回バンプ時のみという記述（全履歴への無条件フォールバックを排した旨）
  assert.ok(
    content.includes('初回バンプ'),
    'HEAD 全件フォールバックを初回バンプ時に限定する記述が見当たらない'
  );

  // 多段フォールバックである旨が明示されている
  assert.ok(
    content.includes('多段フォールバック'),
    '「多段フォールバック」の明示が見当たらない'
  );
});

// ============================================================
// (2) 版バンプコミット検出正規表現の挙動検証
// ============================================================

test('範囲判定: 版バンプ検出正規表現が `chore: vX.Y.Z にバージョンアップ` 行にマッチする', () => {
  // git log --format='%H %s' の出力形式（hash + subject）
  const matching = [
    '08b404e0000000000000000000000000000000000 chore: v0.21.0 にバージョンアップ',
    'abc1234def5678901234567890123456789012345 chore: v1.0.0 にバージョンアップ',
    '0000000000000000000000000000000000000000 chore: v10.20.30 にバージョンアップ',
  ];
  for (const line of matching) {
    assert.ok(
      BUMP_LINE_RE.test(line),
      `版バンプコミット行にマッチすべきだがマッチしなかった: ${line}`
    );
  }
});

test('範囲判定: 版バンプ検出正規表現が feat: 等の他種別コミット行にはマッチしない', () => {
  const nonMatching = [
    'abc1234def5678901234567890123456789012345 feat: 新機能を追加',
    'abc1234def5678901234567890123456789012345 fix: バグを修正',
    'abc1234def5678901234567890123456789012345 chore: v0.21.0 にバージョンアップしました', // 末尾が異なる
    'abc1234def5678901234567890123456789012345 chore: バージョンアップ', // バージョン番号なし
    'abc1234def5678901234567890123456789012345 chore: v0.21 にバージョンアップ', // semver 不完全
    'abc1234def5678901234567890123456789012345 docs: chore: v0.21.0 にバージョンアップ', // 先頭が docs:
  ];
  for (const line of nonMatching) {
    assert.ok(
      !BUMP_LINE_RE.test(line),
      `版バンプコミット行にマッチすべきでないがマッチした: ${line}`
    );
  }
});

test('範囲判定: HEAD サブジェクト単独の版バンプ判定が正しく動作する（連続バンプ対策）', () => {
  // HEAD 自身がバンプコミットかを判定する正規表現（hash プレフィックスなし）
  assert.ok(
    BUMP_SUBJECT_RE.test('chore: v0.21.0 にバージョンアップ'),
    'バンプサブジェクトにマッチすべきだがマッチしなかった'
  );
  assert.ok(
    !BUMP_SUBJECT_RE.test('feat: 新機能を追加'),
    'feat コミットのサブジェクトにマッチすべきでないがマッチした'
  );
  assert.ok(
    !BUMP_SUBJECT_RE.test('fix: タグ未初期化時の範囲判定を多段フォールバック化'),
    'fix コミットのサブジェクトにマッチすべきでないがマッチした'
  );
});

// ============================================================
// (3) tech-writer.md にも同一の多段フォールバックの記述が含まれること（Issue #71）
//     tech-writer はバンプコミットの「後」に起動するため、フォールバック (3) で
//     HEAD 自身（＝バンプコミット）を境界にして RANGE=<HEAD>..HEAD（0件）に
//     ならないよう、HEAD 除外分岐を持つことも検証する。
// ============================================================

test('範囲判定: tech-writer.md に4段フォールバック（tag → bump-commit → package.json → HEAD）の記述が含まれる', () => {
  const content = readFileSync(TECH_WRITER_PATH, 'utf-8');

  // (1) タグ境界（後方互換）の記述
  assert.ok(
    content.includes('git describe --tags --abbrev=0'),
    'タグ境界判定（git describe）の記述が見当たらない'
  );

  // (2) 直近版バンプコミット境界の検出正規表現（BUMP_RE）が手順書に明記されている
  assert.ok(
    /chore: v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+ にバージョンアップ/.test(content),
    '直近版バンプコミット検出の正規表現（chore: vX.Y.Z にバージョンアップ）が手順書に明記されていない'
  );
  assert.ok(
    content.includes('BUMP_RE='),
    'BUMP_RE 変数の定義が見当たらない'
  );

  // (3) package.json version 変更コミット境界（補助フォールバック）の記述
  assert.ok(
    content.includes('git log -1 --format=') && content.includes('package.json'),
    'package.json version 変更コミット境界（補助フォールバック）の記述が見当たらない'
  );

  // (4) HEAD 全件は真の初回のみという記述（全履歴への無条件フォールバックを排した旨）
  assert.ok(
    content.includes('RANGE="HEAD"') && content.includes('真の初回'),
    'HEAD 全件フォールバックを真の初回に限定する記述が見当たらない'
  );

  // 多段フォールバックである旨が明示されている
  assert.ok(
    content.includes('多段フォールバック'),
    '「多段フォールバック」の明示が見当たらない'
  );
});

test('範囲判定: tech-writer.md のフォールバック(3)に HEAD 除外分岐（初回リリース時の空 RANGE 対策）が含まれる', () => {
  const content = readFileSync(TECH_WRITER_PATH, 'utf-8');

  // HEAD 自身が package.json 変更コミット（今回のバンプコミット）かの判定
  assert.ok(
    content.includes('git rev-parse HEAD'),
    'HEAD 自身が package.json 変更コミットかを判定する記述（git rev-parse HEAD との比較）が見当たらない'
  );

  // HEAD を除外して前回の package.json 変更コミットを探す分岐
  assert.ok(
    content.includes("git log -1 --format='%H' HEAD~1 -- package.json"),
    'HEAD を除外して前回の package.json 変更コミットを探す分岐（HEAD~1 起点の git log）が見当たらない'
  );

  // HEAD~1 が存在しない単一コミットリポジトリの分岐（(4) HEAD 全件へフォールバック）
  assert.ok(
    content.includes('git rev-parse --verify -q HEAD~1'),
    'HEAD~1 が存在しない単一コミットリポジトリの分岐（git rev-parse --verify）が見当たらない'
  );
  assert.ok(
    content.includes('単一コミットリポジトリ'),
    '単一コミットリポジトリ時に (4) HEAD 全件へフォールバックする旨の記述が見当たらない'
  );
});

test('範囲判定: tech-writer.md の失敗時挙動に RANGE 0件時のエスカレーションが定義されている', () => {
  const content = readFileSync(TECH_WRITER_PATH, 'utf-8');

  // git log $RANGE --oneline | wc -l が0件の場合のエスカレーション
  assert.ok(
    content.includes('git log $RANGE --oneline | wc -l'),
    'RANGE の対象コミット件数を計測するコマンド（git log $RANGE --oneline | wc -l）の記述が見当たらない'
  );
  assert.ok(
    content.includes('境界検出失敗'),
    'RANGE 0件を境界検出失敗としてエスカレーションする記述が見当たらない'
  );

  // versions/ ディレクトリが存在するが空の場合のエスカレーション
  assert.ok(
    content.includes('存在するが空'),
    'docs-src/versions/ が存在するが空の場合のエスカレーション分岐が見当たらない'
  );
});
