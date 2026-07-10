/**
 * リンク安全性の検査ユーティリティ（Issue #86 R-1）。
 *
 * copyFileSync / writeFileSync / mkdirSync(recursive) は、いずれも書き込み先へ至る経路上の
 * シンボリックリンクをすべて辿る。upgrade が更新するのは .claude/ 配下のみと宣言している以上、
 * 経路のどこか（葉＝最終要素だけでなく、中間ディレクトリ）にリンクがあれば、リンクを辿って
 * .claude/ の外（ドットファイル管理リポジトリのリンク先など）を意図せず書き換えてしまう。
 *
 * そこで「書き込み先へ至るパス要素を1つずつ降りながら lstatSync でリンクを検査する」
 * 封じ込め方式を提供する。
 *
 * realpathSync を使わない理由: 壊れたリンク（リンク先が存在しない）を「内側」と誤判定する。
 * realpathSync は解決途中で存在しない要素に当たると失敗し、祖先まで遡って未作成部分を
 * 連結するため、これから作られる（＝まだ存在しない）リンク先を安全と判断してしまう。
 * lstatSync ベースのパス走査なら、壊れたリンクも「リンクである」ことだけは検出できるため
 * 正しく弾ける。
 */

import { lstatSync, readlinkSync } from 'fs';
import { join } from 'path';

/**
 * lstatSync のラッパ。対象が存在しなければ（ENOENT）null を返す。
 * それ以外の例外（EACCES / ENOTDIR / ELOOP 等）は握りつぶさず再送出する（fail-closed）。
 *
 * 「例外＝存在しない＝安全」とまとめて握りつぶす実装（catch { return false }）は、
 * 権限エラーやリンクループを「リンクではない」と誤認して素通しさせてしまう。
 * 検査できないなら安全側（＝書き込まない・中止する）に倒すため、ENOENT 以外は伝播させる。
 *
 * @param {string} absPath 検査対象の絶対パス
 * @returns {import('fs').Stats | null}
 */
function lstatOrNull(absPath) {
  try {
    return lstatSync(absPath);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/**
 * シンボリックリンクのリンク先（生の文字列）を返す。警告表示に用いる。
 * 何らかの理由で読めない場合でも例外にせず、代替文言を返す。
 *
 * @param {string} absPath シンボリックリンクの絶対パス
 * @returns {string}
 */
export function symlinkTarget(absPath) {
  try {
    return readlinkSync(absPath);
  } catch {
    return '(リンク先を取得できません)';
  }
}

/**
 * baseDir から rel まで、パス要素を1つずつ降りながらシンボリックリンクを検査する。
 * 最初に見つかったリンクの { rel（baseDir 相対の要素パス）, target（リンク先） } を返す。
 * 経路上に1つもリンクが無ければ null。
 *
 *  - 存在しない要素はスキップして次へ進む（これから作られるため）。
 *  - 壊れたリンク（リンク先が存在しない）も lstatSync はリンクとして検出できるため弾ける。
 *  - baseDir 自体は検査しない（利用者が選んだ作業ディレクトリは信頼する）。
 *  - リンクを1つ見つけたら即座に返す。以降の要素を lstat すると、そのリンクを辿った先を
 *    検査することになり無意味なため。
 *
 * @param {string} baseDir 起点の絶対パス（通常は cwd）
 * @param {string} rel     baseDir からの相対パス（OS 依存セパレータ可）
 * @returns {{ rel: string, target: string } | null}
 */
export function firstSymlinkInPath(baseDir, rel) {
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  let curRel = '';
  for (const part of parts) {
    curRel = curRel ? `${curRel}/${part}` : part;
    const abs = join(baseDir, curRel);
    const st = lstatOrNull(abs);
    if (st === null) continue; // これから作られる要素 → スキップ
    if (st.isSymbolicLink()) {
      return { rel: curRel, target: symlinkTarget(abs) };
    }
  }
  return null;
}

/**
 * absPath がハードリンク（nlink > 1 の通常ファイル）なら nlink を返す。
 * そうでなければ（存在しない・シンボリックリンク・ディレクトリ・nlink<=1）null。
 * ENOENT 以外の lstat 例外は再送出する（fail-closed）。
 *
 * ハードリンクは isSymbolicLink() では検出できず、copyFileSync が共有 inode を上書きして
 * 外部ファイルの内容を破壊する。バックアップも同じ実体を指すため退避の意味を持たない。
 * そこで書き込み前にこの検査で弾く。
 *
 * @param {string} absPath 検査対象の絶対パス
 * @returns {number | null}
 */
export function hardlinkNlink(absPath) {
  const st = lstatOrNull(absPath);
  if (st && !st.isSymbolicLink() && st.isFile() && st.nlink > 1) {
    return st.nlink;
  }
  return null;
}

/**
 * absPath が「通常ファイルでない実体」（ディレクトリ / FIFO / ソケット / ブロック・
 * キャラクタデバイス等）なら、その種別文字列を返す。存在しない・シンボリックリンク・
 * 通常ファイルの場合は null。ENOENT 以外の lstat 例外は再送出する（fail-closed）。
 *
 * upgrade の書き込み系（copyFileSync）と比較系（readFileSync(...).equals(...)）は、いずれも
 * 書き込み先・比較先が「通常ファイル」であることを暗黙の前提にしている。前提が崩れると:
 *  - ディレクトリ  … readFileSync / copyFileSync が EISDIR で異常終了する
 *  - FIFO          … reader/writer が居ないと read/write がブロックしてハングする
 *  - デバイスファイル … デバイスへの読み書きという想定外の副作用を起こす
 *
 * これらは「テンプレートで置き換え可能な通常ファイル」ではないため、リンク（シンボリック／
 * ハード）と同じく辿らず（触れず）スキップして明示する。#84 のインシデント教訓に従い、
 * ディレクトリだけを個別対応するのではなく「通常ファイルでないものはすべて」一般化して弾く。
 *
 * シンボリックリンクは firstSymlinkInPath、ハードリンクは hardlinkNlink が別途弾くため、
 * ここでは対象外にする（呼び出し側で symlink → hardlink → irregular の順に検査する）。
 *
 * @param {string} absPath 検査対象の絶対パス
 * @returns {{ fileType: 'directory'|'fifo'|'socket'|'blockDevice'|'charDevice'|'unknown' } | null}
 */
export function irregularFileType(absPath) {
  const st = lstatOrNull(absPath);
  if (st === null) return null;         // 未作成 → これから通常ファイルとして作られる
  if (st.isSymbolicLink()) return null; // シンボリックリンクは firstSymlinkInPath が処理
  if (st.isFile()) return null;         // 通常ファイル（nlink 判定は hardlinkNlink が担当）
  // ここに来るのは通常ファイルでない実体。人間が読める種別に落として明示する。
  let fileType = 'unknown';
  if (st.isDirectory()) fileType = 'directory';
  else if (st.isFIFO()) fileType = 'fifo';
  else if (st.isSocket()) fileType = 'socket';
  else if (st.isBlockDevice()) fileType = 'blockDevice';
  else if (st.isCharacterDevice()) fileType = 'charDevice';
  return { fileType };
}
