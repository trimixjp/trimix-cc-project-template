/**
 * unified diff 生成（依存パッケージなし・純 JS 実装）
 *
 * upgrade コマンドが「あなたの現在の版」と「最新テンプレート」の差分を
 * 端末に表示するために使う。dpkg の .dpkg-dist / RPM の .rpmnew と同じ発想で、
 * 保護されたファイルの中身の違いをユーザーが確認できるようにするのが目的。
 *
 * 設計方針:
 *  - 依存パッケージを一切増やさない（この repo の方針）。また diff(1) への
 *    シェルアウトもしない（Windows に diff コマンドが無く非互換のため）。
 *  - 行単位 LCS（動的計画法）でハンクを構成する。対象は数百行のテンプレートに
 *    限られるため O(n×m) の素朴な DP で十分。
 *  - 出力は GNU の `diff -u` と同じ unified diff 形式に揃える（`--- / +++` ヘッダ、
 *    `@@ -l,c +l,c @@` ハンクヘッダ、末尾改行の無い行への
 *    `\ No newline at end of file` 注記まで再現する）。
 */

/**
 * テキストを「行終端（\n）を保持したまま」の行配列に分割する。
 *
 * 行終端を各行に含めたまま比較することで、内容は同じでも末尾改行の有無だけが
 * 異なるファイル（例: "a\nb\n" と "a\nb"）を別物として検出できる。GNU diff が
 * `\ No newline at end of file` を出すのと同じ挙動を、追加のフラグ管理なしに得る。
 *
 * @param {string} text
 * @returns {string[]} 各要素は末尾に \n を含む（ただしファイル末尾行は含まない場合がある）
 */
function splitLinesKeepEnds(text) {
  if (text === '') return [];
  // `[^\n]*\n` … 改行で終わる行 / `[^\n]+$` … 改行で終わらない末尾行
  return text.match(/[^\n]*\n|[^\n]+$/g) || [];
}

/**
 * 2 つの行配列の差分を、線形の編集操作列（op 列）として返す。
 *
 * LCS（最長共通部分列）を DP で求め、後ろ向きに復元して
 * 'equal' / 'delete' / 'insert' の列に落とす。
 *
 * op の形:
 *   equal  … { type: 'equal',  old: i, new: j }
 *   delete … { type: 'delete', old: i }
 *   insert … { type: 'insert', new: j }
 * old/new は 0 始まりの行インデックス（0 は falsy なので参照側は `!== undefined` で判定）。
 *
 * @param {string[]} oldLines
 * @param {string[]} newLines
 * @returns {{type:string, old?:number, new?:number}[]}
 */
function diffLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;

  // dp[i][j] = oldLines[i..] と newLines[j..] の LCS 長。末尾から埋める。
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'equal', old: i, new: j });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      // 同着時は削除を先に選ぶことで、出力を決定的にする。
      // （このタイブレーク規則は GNU / BSD diff のそれとは一致しない場合がある。
      //   diff としての正当性は別途ファズ検証済み。バイト単位で GNU 出力に一致させる
      //   ことは保証しない。）
      ops.push({ type: 'delete', old: i });
      i++;
    } else {
      ops.push({ type: 'insert', new: j });
      j++;
    }
  }
  while (i < n) { ops.push({ type: 'delete', old: i }); i++; }
  while (j < m) { ops.push({ type: 'insert', new: j }); j++; }
  return ops;
}

/**
 * op 列を、変更の周囲に context 行を含むハンク（op のまとまり）へ分割する。
 *
 * 各変更（delete/insert）の前後 context 行までを「含める」印を付け、
 * 印の連続する区間を 1 ハンクとする。変更同士が 2×context 行より離れていれば
 * 印が途切れ、別々のハンクに分かれる（GNU diff と同じ挙動）。
 *
 * @param {{type:string}[]} ops
 * @param {number} context
 * @returns {{type:string, old?:number, new?:number}[][]}
 */
function buildHunks(ops, context) {
  const include = new Array(ops.length).fill(false);
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].type === 'equal') continue;
    for (let d = -context; d <= context; d++) {
      const idx = k + d;
      if (idx >= 0 && idx < ops.length) include[idx] = true;
    }
  }

  const hunks = [];
  let k = 0;
  while (k < ops.length) {
    if (!include[k]) { k++; continue; }
    const start = k;
    while (k < ops.length && include[k]) k++;
    hunks.push(ops.slice(start, k));
  }
  return hunks;
}

/** ハンクヘッダの範囲表記（GNU diff 準拠: 件数が 1 のときは開始行のみ、0 のときは "行,0"） */
function formatRange(start, count) {
  return count === 1 ? `${start}` : `${start},${count}`;
}

/** 1 ハンクから `@@ -l,c +l,c @@` ヘッダ文字列を生成する */
function hunkHeader(hunk) {
  let firstOld = null;
  let firstNew = null;
  let oldCount = 0;
  let newCount = 0;
  for (const op of hunk) {
    if (op.old !== undefined) {
      if (firstOld === null) firstOld = op.old;
      oldCount++;
    }
    if (op.new !== undefined) {
      if (firstNew === null) firstNew = op.new;
      newCount++;
    }
  }
  // 対応する行が 0 件のとき、GNU diff は開始行を 0 とする（例: 空ファイルからの追加 → -0,0）
  const oldStart = oldCount === 0 ? 0 : firstOld + 1;
  const newStart = newCount === 0 ? 0 : firstNew + 1;
  return `@@ -${formatRange(oldStart, oldCount)} +${formatRange(newStart, newCount)} @@`;
}

/**
 * 1 行を prefix（' ' / '-' / '+'）付きで描画する。
 * 末尾に改行を持たない行（＝ファイル末尾行）には `\ No newline at end of file` を添える。
 */
function renderLine(prefix, content) {
  if (content.endsWith('\n')) return prefix + content;
  return `${prefix}${content}\n\\ No newline at end of file\n`;
}

/**
 * 2 つのテキストの unified diff を生成する。
 *
 * @param {string} oldText 変更前（ユーザーの現在の版）
 * @param {string} newText 変更後（最新テンプレート）
 * @param {object} [opts]
 * @param {string} [opts.oldLabel='a'] `---` 行のラベル
 * @param {string} [opts.newLabel='b'] `+++` 行のラベル
 * @param {number} [opts.context=3]    変更の前後に付ける文脈行数
 * @returns {string} unified diff 文字列。差分が無ければ空文字列を返す。
 */
export function unifiedDiff(oldText, newText, opts = {}) {
  const { oldLabel = 'a', newLabel = 'b', context = 3 } = opts;

  // 完全一致なら差分なし。行分割・DP を通しても空になるが、明示的に早期リターンする。
  if (oldText === newText) return '';

  const oldLines = splitLinesKeepEnds(oldText);
  const newLines = splitLinesKeepEnds(newText);
  const ops = diffLines(oldLines, newLines);
  const hunks = buildHunks(ops, context);

  // 変更が無ければ（全 op が equal）ハンクは 0 件 → 空文字列
  if (hunks.length === 0) return '';

  let out = `--- ${oldLabel}\n+++ ${newLabel}\n`;
  for (const hunk of hunks) {
    out += `${hunkHeader(hunk)}\n`;
    for (const op of hunk) {
      if (op.type === 'equal') out += renderLine(' ', oldLines[op.old]);
      else if (op.type === 'delete') out += renderLine('-', oldLines[op.old]);
      else out += renderLine('+', newLines[op.new]);
    }
  }
  return out;
}
