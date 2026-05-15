---
name: ai-team-setup
description: AIチームをプロジェクトにセットアップするウィザード。.claude/ディレクトリにエージェント定義・ワークフロー・設定ファイルを配置します。
---

# /ai-team setup — AIチーム セットアップウィザード

あなたはセットアップウィザードです。以下の手順でAIチームをプロジェクトに導入してください。

## ステップ1: 現状確認

まず以下を確認してください：

1. 現在の作業ディレクトリを確認する（`pwd`）
2. `.claude/` ディレクトリが存在するか確認する
3. 既存の `.claude/teams/` があれば、すでにセットアップ済みのチームを確認する

## ステップ2: セットアップ内容の確認

ユーザーに以下を確認してください（`AskUserQuestion` ツールを使用）：

**質問1**: 導入するチームを選択してください（複数選択可）
- エンジニアチーム（コード実装・レビュー・PR作成）
- コンテンツチーム（記事・ドキュメント作成）
- インフラチーム（クラウド構成・ネットワーク・セキュリティ）

**質問2**: チケット管理システムはどれを使用しますか？
- GitHub Issues
- Jira
- Linear
- その他（テキスト入力）

**質問3**: GitHub Issueテンプレートをセットアップしますか？（GitHub Issues選択時のみ）

## ステップ3: ファイルの配置

選択されたチームに基づいて、このパッケージの `templates/` から以下をコピーしてください。

### 必須（全チーム共通）

```
templates/_shared/agents/contributor.md   → .claude/agents/contributor.md
templates/_shared/agents/dispatcher.md    → .claude/agents/dispatcher.md
templates/_shared/agents/human-escalator.md → .claude/agents/human-escalator.md
templates/_shared/escalation-rules.yml    → .claude/escalation-rules.yml
templates/_shared/dod/incident.md         → .claude/dod/incident.md
templates/_shared/dod/README.md           → .claude/dod/README.md
templates/incidents/index.yml             → .claude/incidents/index.yml
templates/incidents/TEMPLATE.md           → .claude/incidents/TEMPLATE.md
templates/incidents/README.md             → .claude/incidents/README.md
templates/docs/workflow-guide.md          → .claude/docs/workflow-guide.md
```

### エンジニアチーム（選択時）

```
templates/teams/engineer/agents/*.md      → .claude/teams/engineer/agents/
templates/teams/engineer/workflow.yml     → .claude/teams/engineer/workflow.yml
templates/teams/engineer/review-config.yml → .claude/teams/engineer/review-config.yml
templates/teams/engineer/dod/*.md         → .claude/teams/engineer/dod/
```

### コンテンツチーム（選択時）

```
templates/teams/content/agents/*.md            → .claude/teams/content/agents/
templates/teams/content/workflow.yml           → .claude/teams/content/workflow.yml
templates/teams/content/dod/*.md               → .claude/teams/content/dod/
templates/teams/content/compliance-rules/*.md  → .claude/teams/content/compliance-rules/
```

### インフラチーム（選択時）

```
templates/teams/infra/agents/*.md         → .claude/teams/infra/agents/
templates/teams/infra/workflow.yml        → .claude/teams/infra/workflow.yml
templates/teams/infra/dod/*.md            → .claude/teams/infra/dod/
```

### GitHub Issueテンプレート（選択時）

```
templates/.github/ISSUE_TEMPLATE/*.yml    → .github/ISSUE_TEMPLATE/
```

## ステップ4: CLAUDE.md への追記

`.claude/CLAUDE.md` が存在しない場合は作成し、既存の場合は末尾に追記してください：

```markdown
## AIチーム設定

このプロジェクトは `@trimix/ai-team` でセットアップされたAIチームで運用されます。

### 有効なチーム
<!-- セットアップしたチームを列挙 -->
- エンジニアチーム: `.claude/teams/engineer/`
- コンテンツチーム: `.claude/teams/content/`
- インフラチーム: `.claude/teams/infra/`

### チケット管理
- システム: <!-- GitHub Issues / Jira / Linear / その他 -->

### ワークフローの起動
チケットを担当したら `/ai-team run <チケットURL>` を実行してください。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`
```

## ステップ5: 完了報告

セットアップ完了後、以下を報告してください：

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- チケット管理: [システム名]
- 配置ファイル数: [件数]

## 次のステップ
1. `.claude/CLAUDE.md` を確認・カスタマイズしてください
2. チームメンバーにリポジトリをクローンしてもらい、`@trimix/ai-team` をインストールします
3. チケットが発行されたら `/ai-team run <チケットURL>` でワークフローを開始します

## カスタマイズ
- エージェント定義: `.claude/teams/<チーム>/agents/` 内の .md ファイルを編集
- ワークフロー: `.claude/teams/<チーム>/workflow.yml` を編集
- DOD: `.claude/teams/<チーム>/dod/` 内のテンプレートを編集
```
