/**
 * .claude/commands/ に配布するSkillファイルの一覧（単一の信頼できる情報源）。
 * setup.js / postinstall.js / upgrade.js / sync-templates.js がこれを参照します。
 *
 * 静的リストではなく skills/ ディレクトリを走査して決定します。
 * skills/ にスキルを追加・削除しても、命名規則（ai-team-*.md）に従っていれば
 * 自動的に配布対象へ反映されます。README 等の混入は命名規則フィルタで防ぎます。
 *
 * 命名規則に一致しない短縮エイリアス（airun.md 等）は SKILL_ALIAS_FILES に明示列挙します。
 * 配布対象かどうかの判定は isSkillFile() に集約されており、sync-templates.js と
 * apply-model-profile.js もこの関数を参照します（判定の二重実装を作らないこと）。
 */

import { readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 配布対象スキルの既定ディレクトリ（リポジトリ直下の skills/） */
const DEFAULT_SKILLS_DIR = resolve(__dirname, '..', '..', 'skills');

/**
 * 配布対象スキルのファイル名規則。
 * `ai-team-` で始まる `.md` のみを配布し、README.md や .gitkeep 等は除外する。
 */
export const SKILL_FILE_PATTERN = /^ai-team-.*\.md$/;

/**
 * 短縮エイリアスのファイル名。
 *
 * `ai-team-` 接頭辞を持たないため SKILL_FILE_PATTERN に一致しない。正規表現を緩めると
 * README.md 等の混入を防げなくなるため、緩和ではなく明示列挙で配布対象に加える。
 * エイリアスを増やすときはここへ追記する。
 */
export const SKILL_ALIAS_FILES = new Set(['airun.md', 'aiwatch.md', 'aiticket.md']);

/**
 * 配布対象のSkillファイルかどうかを判定する（配布判定の単一の情報源）。
 *
 * 命名規則（ai-team-*.md）に一致するもの、または短縮エイリアスとして明示列挙された
 * ものを配布対象とする。README.md / .gitkeep / notes.txt などは対象外。
 *
 * @param {string} name ファイル名（ディレクトリを含まない basename）
 * @returns {boolean}
 */
export function isSkillFile(name) {
  return SKILL_FILE_PATTERN.test(name) || SKILL_ALIAS_FILES.has(name);
}

/**
 * 指定ディレクトリを走査し、配布対象スキル（ai-team-*.md および短縮エイリアス）の
 * ファイル名をソート済みで返す。ディレクトリが存在しない場合は空配列を返す。
 *
 * @param {string} [skillsDir] 走査するディレクトリ（既定: リポジトリ直下 skills/）
 * @returns {string[]}
 */
export function listSkillFiles(skillsDir = DEFAULT_SKILLS_DIR) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => isSkillFile(name))
    .sort();
}

/**
 * 既定の skills/ を走査して得た配布対象スキル一覧。
 * 従来の静的配列 SKILL_FILES と同じ形（string[]）で、後方互換のため名前を維持する。
 */
export const SKILL_FILES = listSkillFiles();
