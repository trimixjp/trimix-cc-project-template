# バージョン移行ガイド

`@trimix/ai-team` のバージョンアップ手順をまとめています。

---

## v0.10.x から v0.11.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| Opus 最適化 | 全エージェント定義が Claude Opus で動作する前提に最適化。モデルはエイリアス指定（`architect` のみ `model: opus` を明示） |
| レビュー方式の機械判定化 | `review-config.yml` の `sensitive_areas` に正規表現 `pattern` を追加。`detection_procedure`（base_branch 検証・git diff 計測・パス照合=確定 / 本文照合=参考値）で機械判定 |
| 差し戻し上限 | `workflow.yml` に `rework_limit: 2` と `on_rework.limit_exceeded_next` を追加（全 5 チーム）。3 回目の不合格は `escalated:human` へ。先頭行照合による決定論的カウント |
| AND 待機のアトミック遷移 | `requires_all_of` 合流時のレースコンディション対策（待機パス再確認・冪等付与・誤発動ガード付きリカバリ） |
| `return_to_previous` の構造化 | human-escalator が「エスカレーション元ステップ」を構造化フィールドで記録し、`/ai-team resume` が機械的に復帰 |
| リマインド方針 | 人間無応答時、48 時間経過後に 1 回のみリマインドコメントを投稿 |
| エージェント統一規約 | コメント必須 5 フィールド・完了条件（exit criteria）・状態記録の原則を全エージェントに適用 |
| レビュアー観点差別化 | Reviewer-A = 設計・保守性・テスト、Reviewer-B = セキュリティ・パフォーマンス・エラー処理 |
| 生成器の新規約対応 | `/ai-team create`・`/ai-team configure` が生成するファイルも新規約に準拠。テンプレート整合性テストを追加 |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.11.0.tgz
```

#### ステップ 2: セットアップウィザードを再実行

機械判定（`pattern` / `detection_procedure`）・`rework_limit`・統一規約は `.claude/teams/` 配下のテンプレート更新で反映されるため、`/ai-team-setup` の再実行を推奨します。

> **注意**: `# customized: true` コメントがあるファイルは上書きされません。カスタマイズ済みの workflow.yml / review-config.yml に新フィールドを反映したい場合は、手動で `rework_limit: 2`・`limit_exceeded_next`・`pattern`・`detection_procedure` を追記してください。

#### ステップ 3: 確認事項チェックリスト

- [ ] `npm list @trimix/ai-team` でバージョンが `0.11.0` になっている
- [ ] 各チームの `workflow.yml` に `rework_limit: 2` が存在する
- [ ] backend / frontend の `review-config.yml` に `detection_procedure` と `sensitive_areas[].pattern` が存在する
- [ ] `.claude/agents/human-escalator.md` のエスカレーションコメント形式に「エスカレーション元ステップ」フィールドが含まれている
- [ ] `detection_procedure.base_branch` がプロジェクトのデフォルトブランチと一致している（`main` 以外の場合は変更）

### v0.10.x からの破壊的変更

ワークフローの構造に**破壊的変更はありません**。ただし旧形式のエスカレーションコメント（「エスカレーション元ステップ」フィールドなし）が残っている Issue では、`/ai-team resume` が復帰先を機械的に決定できないため、コメント履歴から文脈で判断するフォールバック動作になります。

---

## v0.6.x から v0.7.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| SNS運用チームの追加 | Strategist / Researcher / Writer / Operator の 4 エージェント構成のテンプレートが新規追加 |
| Issue 強制チェック（hooks）オプション | セットアップ時に `UserPromptSubmit` フックで変更系指示をブロックする設定を選択可能に |
| `.gitignore` の自動更新 | セットアップ時に `.claude/` 配下の個人設定ファイルを `.gitignore` から除外するパターンを追記 |

---

### 移行手順

#### ステップ 1: 新しい `.tgz` を入手してインストール

配布された `trimix-ai-team-0.7.0.tgz` をプロジェクトルートに配置してインストールします。

```bash
npm install --save-dev ./trimix-ai-team-0.7.0.tgz
```

インストール完了メッセージで 7 件のスキルファイルが展開されたことを確認してください。

---

#### ステップ 2: セットアップウィザードを再実行（オプション）

SNS チームを追加したい場合や、hooks による Issue 強制チェックを有効にしたい場合は、`/ai-team-setup` を再実行してください。

```
/ai-team-setup
```

> **注意**: 既存チームのワークフロー・エージェント定義（`.claude/teams/` 配下）は、ファイルに `# customized: true` コメントがある場合は上書きされません。カスタマイズ済みの設定は保持されます。

---

#### ステップ 3: 確認事項チェックリスト

移行後に以下を確認してください。

- [ ] `npm list @trimix/ai-team` でバージョンが `0.7.0` になっている
- [ ] `.claude/commands/` に 7 つのスキルファイルが存在する
- [ ] 既存チームのワークフロー定義（`.claude/teams/*/workflow.yml`）が想定通りの内容になっている
- [ ] SNS チームを追加した場合、`.claude/teams/sns/` が正しく展開されている
- [ ] hooks を有効にした場合、`.claude/hooks/ensure-issue.sh` が存在し、`.claude/settings.json` に登録されている

---

### v0.6.x からの破壊的変更

v0.6.x から v0.7.0 への変更に**破壊的変更はありません**。既存のワークフロー・エージェント・設定ファイルはそのまま動作します。

---

## v0.5.x から v0.6.0 への移行（参考）

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| Version-Bumper ステップの追加 | バックエンドワークフローに `version-bumper` ステップが追加（Reviewer 合格後に `package.json` を自動更新） |
| バージョン管理設定 | `ai-team-config.yml` に `version_management` フィールドを追加（`auto` / `manual` を選択） |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.6.0.tgz
```

#### ステップ 2: `ai-team-config.yml` に `version_management` を追加

v0.5.x では `version_management` フィールドが存在しないため、手動で追加する必要があります。

```yaml
# .claude/ai-team-config.yml に追記
version_management: manual  # または auto
```

`auto` を選択すると、Reviewer 合格後に conventional commit に基づき `package.json` のバージョンが自動インクリメントされます。

#### ステップ 3: 確認事項チェックリスト

- [ ] `ai-team-config.yml` に `version_management` フィールドが存在する
- [ ] バックエンドワークフローの `steps` に `version-bumper` ステップが含まれている（`auto` 選択時）

---

## バージョン履歴

| バージョン | 主な変更内容 |
|-----------|------------|
| v0.11.0 | Opus 最適化と再現性強化（レビュー機械判定・`rework_limit`・アトミック遷移・`return_to_previous` 構造化・統一規約） |
| v0.10.0 | `/ai-team-create` スキル追加（カスタムチーム作成ウィザード） |
| v0.9.0 | `/ai-team-gallery` の実行環境判定バグ修正・`npm run sync` 追加 |
| v0.8.0 | ワークフロー設計の汎用化・全チーム workflow.yml の整合性修正・月次見直しの仕組み追加 |
| v0.7.0 | SNS運用チーム追加・hooks による Issue 強制チェック・`.gitignore` 自動更新 |
| v0.6.0 | Version-Bumper ステップ追加・バージョン管理設定サポート |
| v0.5.2 | Mermaid.js 対応・マニュアル全体の構造再編成 |
| v0.5.1 | postinstall でスキルファイルが展開されない問題を修正 |
| v0.5.0 | ワークフロー設定ウィザード（`/ai-team-configure`）を追加 |

---

## 関連ドキュメント

- [インストール](../installation.html) — インストール手順の詳細
- [セットアップガイド](setup.html) — `/ai-team-setup` の詳細
- [設定ファイル](../reference/config.html) — `ai-team-config.yml` の全フィールド
