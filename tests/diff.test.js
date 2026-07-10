/**
 * unified diff 生成（bin/lib/diff.js）のテスト
 *
 * 実装が GNU `diff -u` 相当の出力を返すことを、実際の diff 出力に照らして検証する。
 * トートロジー（実装内の文字列リテラルへの assert）は避け、diff の意味（どの行が
 * 追加/削除されたか・ハンクヘッダの行番号・末尾改行の扱い）を検証する。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { unifiedDiff } from '../bin/lib/diff.js';

/** ヘッダ（--- / +++）を除いた本体行を返す */
function bodyLines(diff) {
  return diff.split('\n').filter((l) => !l.startsWith('--- ') && !l.startsWith('+++ '));
}

test('同一テキストは空文字列を返す', () => {
  assert.equal(unifiedDiff('a\nb\nc\n', 'a\nb\nc\n'), '', '同一なら空文字列であるべき');
  assert.equal(unifiedDiff('', ''), '', '空同士も空文字列であるべき');
});

test('追加のみ: 空ファイルから 2 行追加すると +行 のみになる', () => {
  const diff = unifiedDiff('', 'a\nb\n', { oldLabel: 'f1', newLabel: 'f2' });
  // ヘッダのラベルが反映される
  assert.ok(diff.startsWith('--- f1\n+++ f2\n'), `ヘッダが正しくない:\n${diff}`);
  // ハンクヘッダは対応行 0 件のため -0,0（GNU diff 準拠）
  assert.ok(diff.includes('@@ -0,0 +1,2 @@'), `ハンクヘッダが -0,0 +1,2 でない:\n${diff}`);
  // 追加された 2 行が + 付きで並ぶ
  assert.ok(diff.includes('+a\n'), 'a の追加行が無い');
  assert.ok(diff.includes('+b\n'), 'b の追加行が無い');
  // 削除行（-）は存在しない
  assert.ok(!bodyLines(diff).some((l) => l.startsWith('-')), '追加のみなのに削除行がある');
});

test('削除のみ: 2 行を空ファイルにすると -行 のみになる', () => {
  const diff = unifiedDiff('a\nb\n', '');
  assert.ok(diff.includes('@@ -1,2 +0,0 @@'), `ハンクヘッダが -1,2 +0,0 でない:\n${diff}`);
  assert.ok(diff.includes('-a\n'), 'a の削除行が無い');
  assert.ok(diff.includes('-b\n'), 'b の削除行が無い');
  // 追加行（+）は存在しない
  assert.ok(!bodyLines(diff).some((l) => l.startsWith('+')), '削除のみなのに追加行がある');
});

test('変更: 中央 1 行の書き換えは 前後を文脈として保ちつつ -旧 +新 になる', () => {
  const diff = unifiedDiff('x\ny\nz\n', 'x\ny2\nz\n');
  assert.ok(diff.includes('@@ -1,3 +1,3 @@'), `ハンクヘッダが -1,3 +1,3 でない:\n${diff}`);
  assert.ok(diff.includes('-y\n'), '旧行 y の削除が無い');
  assert.ok(diff.includes('+y2\n'), '新行 y2 の追加が無い');
  // 変更していない x / z は文脈行（先頭スペース）として残る
  assert.ok(diff.includes(' x\n'), '文脈行 x が無い');
  assert.ok(diff.includes(' z\n'), '文脈行 z が無い');
});

test('末尾改行の有無だけが違う場合も差分として検出し、No newline 注記を出す', () => {
  const withNl = 'a\nb\n';
  const withoutNl = 'a\nb';
  const diff = unifiedDiff(withNl, withoutNl);
  // 内容行は同じでも末尾改行が違えば別物として差分が出る（空文字列ではない）
  assert.notEqual(diff, '', '末尾改行の違いが差分として検出されていない');
  // GNU diff と同じく末尾改行の無い行に注記が付く
  assert.ok(
    diff.includes('\\ No newline at end of file'),
    `No newline 注記が無い:\n${diff}`
  );
  // b 行が「改行あり削除 → 改行なし追加」として現れる
  assert.ok(diff.includes('-b\n'), '改行付き b の削除行が無い');
  assert.ok(diff.includes('+b\n'), '改行なし b の追加行が無い');
});

test('複数ハンク: 離れた 2 箇所の変更は別々のハンクに分割される', () => {
  // 先頭と末尾を変え、間に文脈 3 行を超える未変更行（10 行）を挟む
  const middle = Array.from({ length: 10 }, (_, i) => `m${i}`).join('\n');
  const oldText = `head\n${middle}\ntail\n`;
  const newText = `HEAD\n${middle}\nTAIL\n`;

  const diff = unifiedDiff(oldText, newText, { context: 3 });
  const headers = diff.split('\n').filter((l) => l.startsWith('@@'));
  assert.equal(headers.length, 2, `ハンクは 2 つに分かれるべき:\n${diff}`);

  // 先頭側のハンク: head→HEAD
  assert.ok(diff.includes('-head\n') && diff.includes('+HEAD\n'), '先頭の変更が無い');
  // 末尾側のハンク: tail→TAIL
  assert.ok(diff.includes('-tail\n') && diff.includes('+TAIL\n'), '末尾の変更が無い');
  // 間の未変更行（m5 など）は、どちらのハンクにも含まれない（変更から遠いため）
  assert.ok(!diff.includes('m5'), '離れた未変更行 m5 がハンクに混入している');
});

test('context の指定で文脈行数が変わる', () => {
  const oldText = 'a\nb\nc\nd\ne\n';
  const newText = 'a\nb\nc2\nd\ne\n';
  // ラベルは既定（a/b）だと `--- a` が ` a\n` を含み文脈判定と衝突するため明示指定する
  const labels = { oldLabel: 'f1', newLabel: 'f2' };
  // context=1 なら変更行 c の前後 1 行（b, d）のみ文脈になる
  const diff1 = unifiedDiff(oldText, newText, { ...labels, context: 1 });
  assert.ok(diff1.includes(' b\n') && diff1.includes(' d\n'), 'context=1 の隣接文脈が無い');
  assert.ok(!diff1.includes(' a\n') && !diff1.includes(' e\n'), 'context=1 なのに離れた行が含まれる');
  // context=3 なら a, e まで文脈に含まれる
  const diff3 = unifiedDiff(oldText, newText, { ...labels, context: 3 });
  assert.ok(diff3.includes(' a\n') && diff3.includes(' e\n'), 'context=3 の文脈 a/e が無い');
});
