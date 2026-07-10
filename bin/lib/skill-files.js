/**
 * .claude/commands/ に配布するSkillファイルの一覧（単一の信頼できる情報源）。
 * setup.js / postinstall.js / upgrade.js / sync-templates.js がこれを参照します。
 *
 * 静的リストではなく skills/ ディレクトリを走査して決定します。
 * skills/ にスキルを追加・削除しても、命名規則（ai-team-*.md）に従っていれば
 * 自動的に配布対象へ反映されます。README 等の混入は命名規則フィルタで防ぎます。
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
 * 指定ディレクトリを走査し、配布対象スキル（ai-team-*.md）のファイル名を
 * ソート済みで返す。ディレクトリが存在しない場合は空配列を返す。
 *
 * @param {string} [skillsDir] 走査するディレクトリ（既定: リポジトリ直下 skills/）
 * @returns {string[]}
 */
export function listSkillFiles(skillsDir = DEFAULT_SKILLS_DIR) {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir)
    .filter((name) => SKILL_FILE_PATTERN.test(name))
    .sort();
}

/**
 * 既定の skills/ を走査して得た配布対象スキル一覧。
 * 従来の静的配列 SKILL_FILES と同じ形（string[]）で、後方互換のため名前を維持する。
 */
export const SKILL_FILES = listSkillFiles();
