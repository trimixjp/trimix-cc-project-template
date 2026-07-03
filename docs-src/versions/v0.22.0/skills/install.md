# /ai-team-install — プラグインインストール

ワークフロープラグイン（チーム単位）を後から追加インストールするスキルです。`/ai-team-setup` 時に選択しなかったチームを後で導入したい場合に使用します。

> **スキル定義**: `skills/ai-team-install.md`

---

## 使い方

```
/ai-team-install <team_id>
```

`team_id` は以下のいずれかです。

| team_id | チーム | 概要 |
|---------|-------|------|
| `backend` | バックエンドチーム | コード実装・レビュー・PR作成 |
| `frontend` | フロントエンドチーム | UI実装・コンポーネント開発 |
| `content` | コンテンツチーム | 記事・ドキュメント作成 |
| `infra` | インフラチーム | クラウド構成・セキュリティ |
| `sns` | SNS運用チーム | X・Instagram の投稿運用 |
| `youtube` | YouTube動画制作チーム | YouTube動画の企画・台本・生成・公開 |

引数を省略した場合、対話的にチーム ID を確認します。

---

## ステップ 1: 引数の確認

ユーザーが指定した `<team_id>` を確認します。指定がない場合は次の質問が行われます。

```
インストールしたいチームIDを教えてください（例: backend, frontend, content, infra）
```

---

## ステップ 2: インストールコマンドの実行

Bash ツールで次のコマンドを実行します。

```bash
npx @trimix/ai-team install <team_id>
```

`npx` で見つからない場合は次のフォールバックを使用します。

```bash
node node_modules/@trimix/ai-team/bin/setup.js install <team_id>
```

このコマンドは `bin/lib/plugin-install.js` で実装されており、`templates/teams/<team_id>/` をプロジェクトの `.claude/teams/<team_id>/` にコピーします。

---

## ステップ 3: 結果確認と報告

実行結果から以下を報告します。

- インストールされたファイルの一覧
- GitHub ラベルの作成結果
- エラーがあれば内容と解決策

インストールされた内容は `ai-team-plugins.json` に記録されます（コミット対象）。

```json
{
  "installed": {
    "trimix-backend": {
      "id": "trimix-backend",
      "team_id": "backend",
      "label_prefix": "backend",
      "name": "バックエンドチーム",
      "package": "@trimix/workflow-trimix-backend",
      "version": "1.0.0",
      "installed_at": "2026-05-17T02:14:21.048Z",
      "files": [
        ".claude/teams/backend/agents/implementer.md",
        ".claude/teams/backend/agents/pr-creator.md",
        ".claude/teams/backend/workflow.yml",
        ".claude/teams/backend/review-config.yml",
        ".github/ISSUE_TEMPLATE/backend-bugfix.yml",
        ...
      ]
    }
  }
}
```

---

## ステップ 4: セットアップを案内

インストール完了後、次のメッセージで後続アクションを案内します。

```
インストールが完了しました。次のステップ:
1. /ai-team-setup を実行してプロジェクトへのセットアップを完了してください
2. GitHub のラベルが作成されたか確認してください
3. /ai-team-run <Issue番号> でワークフローを起動できます
```

---

## エラー対応

| エラーメッセージ | 対処法 |
|----------------|--------|
| `team_id が見つかりません` | 正しいチームID（backend/frontend/content/infra）を確認して再実行 |
| `team_id 衝突エラー` | 既存プラグインを `/ai-team-uninstall` してから再実行（または `npx @trimix/ai-team uninstall <team_id>`） |
| `gh コマンドが見つかりません` | GitHub CLI をインストール（`brew install gh` または [公式サイト](https://cli.github.com/)） |

---

## 注意事項

- このスキルは**プロジェクトルートで実行**する必要があります
- インストール後に `ai-team-plugins.json` が生成・更新されます（Git でコミットしてください）
- 既に `.claude/teams/<team_id>/` がある場合、ファイルが上書きされる可能性があります。カスタマイズした内容はバックアップを取ってから実行してください

---

## 関連ドキュメント

- [ai-team-gallery](gallery.html) — 利用可能なプラグイン一覧
- [ai-team-setup](setup.html) — プロジェクト全体のセットアップ
- [チーム概要](../teams/overview.html) — 各チームの詳細
