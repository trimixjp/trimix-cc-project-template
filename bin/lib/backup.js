/**
 * バックアップ機能
 *
 * アップグレードで既存ファイルを上書きする前に、対象ファイルを
 * <cwd>/.ai-team-backups/<YYYYMMDD-HHMMSS>/ へ退避する。
 *
 * 設計方針:
 *  - 元の相対パスを保持してコピーする（例:
 *    .ai-team-backups/20260710-120000/.claude/teams/backend/agents/tech-lead.md）。
 *    アップグレード対象はすべて .claude/ 配下に収まるため、復元は
 *    `cp -R <バックアップdir>/.claude ./` の一行で済む。
 *  - fail-closed: コピー後に SHA-256 を再計算して退避元と照合し、1件でも
 *    コピー失敗・不一致があれば例外を投げる。呼び出し側（upgrade）は例外を
 *    握りつぶさず、アップグレードの適用を必ず中止しなければならない。
 */

import {
  existsSync, mkdirSync, copyFileSync, readFileSync, writeFileSync
} from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';

/** バックアップ格納ルートのディレクトリ名（.gitignore に登録する対象） */
export const BACKUP_ROOT_DIRNAME = '.ai-team-backups';

/** ファイルの SHA-256 を16進文字列で返す */
export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

/** YYYYMMDD-HHMMSS 形式のタイムスタンプを返す（ローカル時刻） */
function formatTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/**
 * 衝突しない世代ディレクトリを作成し、その絶対パスを返す。
 *
 * 方式: 連番付与。まず YYYYMMDD-HHMMSS 名で作成を試み、既に存在すれば
 *   `-2`, `-3`, ... を付けて空いている名前を探し、必ず新しいディレクトリを作る。
 * 理由: mkdirSync(recursive: true) は既存ディレクトリを黙って再利用するため、
 *   タイムスタンプが秒精度だと同一秒内に createBackup を2回呼んだとき先行世代の
 *   ファイルと manifest.json が上書きされ、退避したはずの内容が失われる（R-1）。
 *   世代ディレクトリは絶対に再利用せず、既存時は recursive: false により EEXIST を
 *   受けて次の連番へ進む。連番方式を選んだのは、ミリ秒精度より確実に一意で
 *   （高速な連続呼び出しでも衝突しない）、かつ人間が世代の作成順を読み取れるため。
 */
function createBackupDir(cwd) {
  const root = join(cwd, BACKUP_ROOT_DIRNAME);
  // 親（バックアップルート）は再帰作成でよい。ここが既存の「ファイル」であれば
  // mkdirSync が EEXIST を投げ、fail-closed で呼び出し側がアップグレードを中止する。
  mkdirSync(root, { recursive: true });

  const base = formatTimestamp();
  for (let seq = 1; ; seq++) {
    const candidate = seq === 1 ? join(root, base) : join(root, `${base}-${seq}`);
    try {
      // recursive: false により、既存ディレクトリは再利用せず EEXIST を投げる
      mkdirSync(candidate, { recursive: false });
      return candidate;
    } catch (e) {
      if (e.code === 'EEXIST') continue; // 既存世代 → 次の連番を試す
      throw e; // 権限エラー等はそのまま伝播（fail-closed）
    }
  }
}

/**
 * バックアップを作成する。
 *
 * @param {object} opts
 * @param {string}   opts.cwd            退避元プロジェクトのルート（絶対パス）
 * @param {string[]} opts.targets        退避対象（cwd からの相対パス）。存在しないものは
 *                                       退避対象から除外する（エラーにはしない）。
 * @param {string}   opts.packageVersion manifest に記録する @trimix/ai-team のバージョン
 * @param {(src: string, dest: string) => void} [opts.copyFile]
 *                                       コピー実装の注入点（既定は copyFileSync）。
 *                                       テストで「コピーは成功したが内容が退避元と一致しない」
 *                                       経路を再現し、SHA-256 検証（最終防衛線）を通すために使う。
 * @returns {{ dir: string, files: string[], manifestPath: string }}
 *   dir はバックアップディレクトリの絶対パス、files は実際に退避した相対パス一覧、
 *   manifestPath は manifest.json の絶対パス。
 * @throws コピー失敗・SHA-256不一致が1件でもあれば例外を投げる（fail-closed）。
 */
export function createBackup({ cwd, targets, packageVersion, copyFile = copyFileSync }) {
  const dir = createBackupDir(cwd);

  const manifestFiles = [];
  const backedUp = [];

  for (const rel of targets) {
    const srcAbs = join(cwd, rel);
    // 存在しない退避対象はスキップ（エラーにしない）
    if (!existsSync(srcAbs)) continue;

    // 元の相対パスを保持して退避先を決める
    const destAbs = join(dir, rel);
    mkdirSync(dirname(destAbs), { recursive: true });

    // コピー本体。失敗すれば例外が伝播し、以降の適用は行われない（fail-closed）。
    copyFile(srcAbs, destAbs);

    // 検証: 退避元と退避先の SHA-256 が一致することを確認する。
    // 破損・切り詰めコピーを検出し、不完全なバックアップでの上書きを防ぐ。
    const srcHash = sha256File(srcAbs);
    const destHash = sha256File(destAbs);
    if (srcHash !== destHash) {
      throw new Error(
        `バックアップ検証に失敗しました: ${rel} の内容が退避元と一致しません` +
        `（元=${srcHash}, 退避先=${destHash}）`
      );
    }

    manifestFiles.push({ path: rel, sha256: srcHash });
    backedUp.push(rel);
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    packageVersion,
    files: manifestFiles
  };
  const manifestPath = join(dir, 'manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');

  return { dir, files: backedUp, manifestPath };
}

/**
 * .gitignore に `.ai-team-backups/` を冪等に追記する。
 * 既に記載があれば何もしない。.gitignore が無ければ新規作成する。
 *
 * @param {string} cwd プロジェクトルート（絶対パス）
 * @returns {{ added: boolean, path: string }} added は今回追記したかどうか
 */
export function ensureGitignore(cwd) {
  const gitignorePath = join(cwd, '.gitignore');
  const entry = `${BACKUP_ROOT_DIRNAME}/`;

  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
    return { added: true, path: gitignorePath };
  }

  const content = readFileSync(gitignorePath, 'utf-8');
  // 行単位で厳密一致を確認する（"/" 付き・無しの両表記を冪等とみなす）
  const alreadyListed = content
    .split('\n')
    .map((line) => line.trim())
    .some((line) => line === entry || line === BACKUP_ROOT_DIRNAME);
  if (alreadyListed) {
    return { added: false, path: gitignorePath };
  }

  // 末尾に改行が無ければ足してから追記し、行が連結されるのを防ぐ
  const needsNewline = content.length > 0 && !content.endsWith('\n');
  writeFileSync(gitignorePath, `${content}${needsNewline ? '\n' : ''}${entry}\n`, 'utf-8');
  return { added: true, path: gitignorePath };
}

/**
 * バックアップ開始前の説明を表示する。
 * なぜバックアップが必要なのか（カスタマイズ済み定義の消失事故を防ぐため）を伝える。
 */
export function printBackupIntro() {
  console.log('');
  console.log('🛟 アップグレード前に、上書き対象の既存ファイルをバックアップします');
  console.log('   理由: カスタマイズしたエージェント定義やワークフローが上書きで失われる事故を防ぐためです。');
  console.log('   `# customized: true` による上書き保護は、マーカーの付いていない旧世代ファイルや');
  console.log('   手編集したファイルまでは守れません。そこで適用直前に必ず退避します。');
}

/**
 * バックアップ完了後の案内を表示する。
 * どこに保存したか・どう戻すか・自動削除されないことを伝える。
 */
export function printBackupSummary({ dir, files }) {
  console.log('');
  console.log(`✅ バックアップを作成しました: ${dir}`);
  console.log(`   退避ファイル数: ${files.length} 件`);
  console.log('   元に戻すには（バックアップから復元）:');
  console.log(`     cp -R ${join(dir, '.claude')} ./`);
  console.log('   ※ このバックアップは自動削除されません。不要になったら手動で削除してください。');
}
