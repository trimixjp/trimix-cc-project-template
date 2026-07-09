# ローカルチケット（Markdown）

GitHub Issues の代わりに、**リポジトリ内の Markdown ファイル**で進捗管理します。  
エージェントは `ai-team ticket` CLI 経由でこのディレクトリを操作します。

## ディレクトリ構成

```
tickets/
  open/           # 未クローズ
  closed/         # クローズ済み
  _templates/     # 新規作成用テンプレート
  README.md       # 本ファイル
```

## Obsidian を使う場合（推奨・非エンジニア向け）

Obsidian は **無料・ローカル完結**で Markdown を見やすく管理できます。  
プライベート GitHub が使えない・エンジニア以外のメンバー向けに推奨します。

1. [Obsidian](https://obsidian.md/) をインストールする
2. **Open folder as vault** で、この `tickets/` フォルダ（またはプロジェクトルート）を開く
3. `open/` 内の md を編集・閲覧する
4. 必須プラグインはありません（任意で Dataview / Kanban）

> エージェントは Obsidian API を使いません。**ファイルが SSOT**です。  
> Obsidian で frontmatter の `labels` を手で壊さないよう注意してください（ラベル遷移は CLI / エージェントが行います）。

## CLI

プロジェクトルートで:

```bash
# バックエンド確認
npx @trimix/ai-team ticket backend

# 一覧
npx @trimix/ai-team ticket list

# 詳細
npx @trimix/ai-team ticket view 1

# 作成
npx @trimix/ai-team ticket create --title "題名" --body "本文"

# コメント
npx @trimix/ai-team ticket comment 1 --body "作業メモ"

# ラベル
npx @trimix/ai-team ticket edit 1 --add-label "backend:implementer" --remove-label "backend:tech-lead"

# クローズ
npx @trimix/ai-team ticket close 1
```

## git 管理

- **チームで共有する**: `tickets/` を commit する
- **個人のみ**: `.gitignore` に `tickets/open/` `tickets/closed/` を追加してもよい（テンプレートは残す）

## 設定

`.claude/ai-team-config.yml`:

```yaml
ticket_backend: local   # github | local
local_tickets:
  dir: tickets
  id_prefix: ""
```
