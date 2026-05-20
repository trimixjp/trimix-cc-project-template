# クイックスタート

`@trimix/ai-team` を使い始めるまでの手順を、最短ルートで説明します。各ステップの詳細は対応するページへのリンクから参照できます。

---

## 前提条件

セットアップを始める前に以下を確認してください。

| 項目 | 必須要件 | 確認コマンド |
|------|---------|-------------|
| Node.js | 18.0.0 以上（`package.json` の `engines.node` で定義） | `node --version` |
| Claude Code CLI | インストール済み・サインイン済み | `claude --version` |
| GitHub CLI | インストール済み・認証済み（ラベル作成・Issue 操作に使用） | `gh auth status` |
| Git リポジトリ | プロジェクトが Git で管理されている | `git status` |
| GitHub リポジトリ | GitHub にリモートリポジトリが存在する（Issues 有効） | `gh repo view` |

GitHub CLI が未認証の場合は `gh auth login` を実行してください。

---

## ステップ 1: パッケージのインストール

配布された `.tgz` ファイルをプロジェクトルートに配置して、`npm install` で開発依存に追加します。

```bash
cd /path/to/your-project
npm install --save-dev ./trimix-ai-team-0.5.1.tgz
```

インストール完了時に `bin/postinstall.js` が自動実行され、7 つのスキルファイルが `.claude/commands/` に展開されます。

```
✅ @trimix/ai-team: 7 件のSkillファイルを .claude/commands/ に展開しました
   Claude Code で /ai-team-setup を実行してセットアップを完了してください
```

展開されるファイルの詳細は [インストール](installation.html) を参照してください。

---

## ステップ 2: AI チームのセットアップ

Claude Code を起動し、以下のスラッシュコマンドを実行します。

```
/ai-team-setup
```

ウィザードが対話形式で次の項目を確認します。

1. **導入するチーム**: backend / frontend / content / infra（複数選択可）
2. **運用モード**: `multi-user`（担当者ごとに `/ai-team-run` 起動）または `solo`（`/ai-team-watch` で自動監視）
3. **GitHub ラベルの作成**: 選択したチームに対応するラベルを `gh label create` で一括作成するかどうか

セットアップが完了すると、プロジェクトルートに次のディレクトリが配置されます。

```
.claude/
├── CLAUDE.md                # プロジェクト用 AIチーム設定
├── ai-team-config.yml       # 運用モード・solo設定
├── escalation-rules.yml     # エスカレーション条件
├── agents/                  # 共通エージェント（contributor / dispatcher / human-escalator）
├── teams/<team_id>/         # 選択したチームのワークフロー・エージェント・DOD
├── dod/                     # 共通DODテンプレート（incident.md など）
├── incidents/               # インシデントレポート（初期状態は空）
├── docs/workflow-guide.md   # ワークフロー運用ガイド
└── commands/                # postinstall で展開された 7 個のスキル
```

詳細は [ai-team-setup スキル](skills/setup.html) を参照してください。

---

## ステップ 3: 最初のタスクの実行

### 方法 A: マルチユーザーモード（個別実行）

GitHub Issue を作成し、適切なリーダーラベル（例: `backend:tech-lead`）を付けます。担当者は Claude Code で以下を実行します。

```
/ai-team-run 42
```

または Issue の URL を直接渡します。

```
/ai-team-run https://github.com/your-org/your-repo/issues/42
```

エージェントは次の順序で動作します（バックエンドチームの例）。

```
tech-lead → implementer → tech-lead（レビュー方式判断）
        → reviewer（または reviewer-a + reviewer-b → cross-review）
        → tech-writer → pr-creator → 人間承認 → contributor → close
```

### 方法 B: ソロモード（自動監視）

`/ai-team-setup` でソロモードを選択した場合は、次のコマンドで自動監視を起動します。

```
/ai-team-watch
```

`.claude/ai-team-config.yml` の `solo.poll_interval_minutes`（デフォルト 5 分）ごとに新規 Issue を検出し、自動でワークフローを起動します。停止するまで監視ループが動作するため、停止には Ctrl+C を使用します。

詳細は [ai-team-watch スキル](skills/watch.html) を参照してください。

---

## ステップ 4: 人間の判断が必要になった場合

AI エージェントが法的判断・予算承認・PR マージ・仕様の曖昧さに遭遇すると、`human-escalator` が起動して `escalated:human` ラベルを付与し処理を停止します。Issue には以下のような案内が投稿されます。

```
🚨 エスカレーション: 人間の判断が必要です

## エスカレーション理由
種別: ambiguous_spec
理由: （具体的に何が判断できないか）

## 対応完了後の手順
1. このIssueに判断内容をコメントしてください
2. escalated:human ラベルを外してください
3. 以下のコマンドでワークフローを再開してください：
   /ai-team-resume
```

人間がコメント・ラベル除去を行ったら、以下で続きから再開します。

```
/ai-team-resume
```

引数なしで実行すると、再開対象 Issue を自動検出します。詳細は [ai-team-resume スキル](skills/resume.html) を参照してください。

---

## 次に読むべきページ

- インストール手順とディレクトリ構成の詳細 → [インストール](installation.html)
- すべてのスキル（スラッシュコマンド）の仕様 → [スキル一覧](skills/overview.html)
- チームごとのワークフロー（フロー図あり） → [チーム概要](teams/overview.html)
- ワークフロー YAML の文法 → [ワークフロー定義](reference/workflow.html)
- DOD（Definition of Done）の運用 → [DOD テンプレート](reference/dod.html)
