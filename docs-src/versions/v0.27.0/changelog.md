# v0.27.0 の変更点

**リリース日**: 2026-08-04

## 概要

頻繁に使う3つのスキルに短縮エイリアス `/airun` `/aiwatch` `/aiticket` を追加しました。あわせて、配布対象スキルの判定が2箇所に二重実装されていた問題を解消し、`isSkillFile()` に集約しました。

## 新機能

### スキルの短縮エイリアス

`/ai-team-run` のような長いコマンド名を毎回打つ負担を減らすため、使用頻度の高い3つに短縮名を用意しました。

| 正規名 | エイリアス |
|---|---|
| `/ai-team-run` | `/airun` |
| `/ai-team-watch` | `/aiwatch` |
| `/ai-team-ticket` | `/aiticket` |

- 引数はそのまま引き継がれます（`/airun 42` は `/ai-team-run 42` と同じ）
- エイリアスは正規スキルの手順を複製せず、`$ARGUMENTS` を渡して委譲する薄いファイルです。正規スキルを更新してもエイリアス側の追従は不要です
- モデル・effort は委譲先の正規スキルと同じ値が割り当たります（`airun` / `aiwatch` は leader、`aiticket` は simple）

残る6スキル（`setup` / `resume` / `create` / `configure` / `install` / `gallery`）は正規名のみです。綴りが破綻するもの（`aiinstall` 等）があり、使用頻度も低いためです。

## 改善

### 配布判定の単一化

配布対象スキルかどうかの判定が、`bin/lib/skill-files.js` の命名規則フィルタと `bin/lib/apply-model-profile.js` の接頭辞判定に**二重実装**されていました。エイリアスのように `ai-team-` で始まらないファイルを追加するとき、片方だけを直すと「配布はされるがモデルプロファイルが適用されない」中途半端な状態になります。

判定を `isSkillFile()` に集約し、`bin/sync-templates.js` と `bin/lib/apply-model-profile.js` の両方から参照する形にしました。

- **命名規則の正規表現（`/^ai-team-.*\.md$/`）は緩めていません。** 緩めると `README.md` / `.gitkeep` 等の混入を防げなくなるため、明示的な allowlist（`SKILL_ALIAS_FILES`）で配布対象に加えています
- エイリアスを追加する際は `SKILL_ALIAS_FILES` と `SKILL_ROLES` の**両方**への追記が必要です（片方だけだと role が `worker` にフォールバックします）。両ファイルのコメントに明記しています

### ドキュメント

- v0.26.0 の変更履歴ページの内部リンク4件が、生成後に存在しないパスを指していた問題を修正しました（バージョンディレクトリ直下のページは相対リンクに `../` を付けない規約）

## テスト・品質保証

- `tests/skill-distribution.test.js` に2件追加
  - 短縮エイリアスが配布対象に含まれ、かつ `README.md` / `.gitkeep` / `notes.txt` の除外が維持されること
  - allowlist に無い `ai` 始まりのファイル（`airandom.md`）が弾かれること（正規表現を緩める実装へのすり替わりを検知する回帰ガード）
  - `bin/sync-templates.js` と `bin/lib/apply-model-profile.js` が `isSkillFile` を参照し、独自の接頭辞判定を持たないことのソース検査
- `tests/model-profiles.test.js` のスキル数の期待値を 9 → 12 に更新

## 対象環境

- Claude Code（Opus / Sonnet / Fable）での実行に対応

## 関連ドキュメント

- [スキル一覧](skills/overview.html) — 全コマンドとエイリアスの対応表
- [/ai-team-run](skills/run.html) — `/airun` の委譲先
- [/ai-team-watch](skills/watch.html) — `/aiwatch` の委譲先
- [/ai-team-ticket](skills/ticket.html) — `/aiticket` の委譲先

## 既知の制限（フォローアップで対応予定）

- エイリアスの実行時挙動（`/airun 42` が実際に `/ai-team-run 42` と同じ結果を返すこと）は自動テストで検証していません。静的検証（配布・frontmatter・role/model 解決）までが担保範囲です
- スラッシュコマンド名が他ツールや組込スキルと衝突しないことは検証していません（`/run` は Claude Code 組込スキルと同名になるため候補から除外しました）
- `SKILL_ALIAS_FILES` から `SKILL_ROLES` への相互参照コメントが片方向です（追記忘れはテストで検知されます）
