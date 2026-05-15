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
templates/_shared/agents/contributor.md     → .claude/agents/contributor.md
templates/_shared/agents/dispatcher.md      → .claude/agents/dispatcher.md
templates/_shared/agents/human-escalator.md → .claude/agents/human-escalator.md
templates/_shared/escalation-rules.yml      → .claude/escalation-rules.yml
templates/_shared/dod/incident.md           → .claude/dod/incident.md
templates/_shared/dod/README.md             → .claude/dod/README.md
templates/incidents/index.yml               → .claude/incidents/index.yml
templates/incidents/TEMPLATE.md             → .claude/incidents/TEMPLATE.md
templates/incidents/README.md               → .claude/incidents/README.md
templates/docs/workflow-guide.md            → .claude/docs/workflow-guide.md
```

### エンジニアチーム（選択時）

```
templates/teams/engineer/agents/*.md       → .claude/teams/engineer/agents/
templates/teams/engineer/workflow.yml      → .claude/teams/engineer/workflow.yml
templates/teams/engineer/review-config.yml → .claude/teams/engineer/review-config.yml
templates/teams/engineer/dod/*.md          → .claude/teams/engineer/dod/
```

### コンテンツチーム（選択時）

```
templates/teams/content/agents/*.md           → .claude/teams/content/agents/
templates/teams/content/workflow.yml          → .claude/teams/content/workflow.yml
templates/teams/content/dod/*.md              → .claude/teams/content/dod/
templates/teams/content/compliance-rules/*.md → .claude/teams/content/compliance-rules/
```

### インフラチーム（選択時）

```
templates/teams/infra/agents/*.md  → .claude/teams/infra/agents/
templates/teams/infra/workflow.yml → .claude/teams/infra/workflow.yml
templates/teams/infra/dod/*.md     → .claude/teams/infra/dod/
```

### GitHub Issueテンプレート（選択時）

```
templates/.github/ISSUE_TEMPLATE/*.yml → .github/ISSUE_TEMPLATE/
```

## ステップ4: GitHub Issues ラベルの作成（GitHub Issues選択時のみ）

チケット管理に GitHub Issues を選択した場合、選択されたチームに応じてラベルを作成してください。

まず `gh` コマンドが使用可能か確認します：

```bash
gh auth status
```

認証されていない場合はユーザーに `gh auth login` の実行を案内して、完了後に続けてください。

リポジトリを特定します（カレントディレクトリのgitリモートから自動取得）：

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

### 共通ラベル（常に作成）

```bash
gh label create "contributor:ready"  --color "0075ca" --description "Contributorが完了確認中"         --force
gh label create "escalated:human"    --color "d93f0b" --description "人間の判断が必要"                --force
gh label create "epic"               --color "7057ff" --description "複数チームにまたがる大規模タスク" --force
gh label create "dispatcher"         --color "7057ff" --description "Dispatcherが自動分解中"          --force
gh label create "incident"           --color "b60205" --description "インシデント報告"                --force
```

### エンジニアチーム（選択時）

```bash
gh label create "engineer:tech-lead"   --color "1d76db" --description "Tech-Leadが要件分析・設計中"   --force
gh label create "engineer:implementer" --color "1d76db" --description "Implementerが実装中"           --force
gh label create "engineer:reviewer"    --color "1d76db" --description "Reviewerがレビュー中"           --force
gh label create "engineer:reviewer-a"  --color "1d76db" --description "Reviewer-Aがレビュー中"        --force
gh label create "engineer:reviewer-b"  --color "1d76db" --description "Reviewer-Bがレビュー中"        --force
gh label create "engineer:pr-creator"  --color "1d76db" --description "PR-CreatorがPR作成中"          --force
```

### コンテンツチーム（選択時）

```bash
gh label create "content:editor-in-chief" --color "e4e669" --description "Editor-in-Chiefが方針決定中" --force
gh label create "content:researcher"      --color "e4e669" --description "Researcherが調査中"          --force
gh label create "content:writer"          --color "e4e669" --description "Writerが執筆中"              --force
gh label create "content:compliance"      --color "e4e669" --description "Complianceがチェック中"      --force
```

### インフラチーム（選択時）

```bash
gh label create "infra:infra-lead"        --color "0e8a16" --description "Infra-Leadが設計中"         --force
gh label create "infra:network-engineer"  --color "0e8a16" --description "Network-Engineerが実装中"   --force
gh label create "infra:infra-specialist"  --color "0e8a16" --description "Infra-Specialistが実装中"   --force
gh label create "infra:security-engineer" --color "0e8a16" --description "Security-Engineerがレビュー中" --force
gh label create "infra:architect"         --color "5319e7" --description "Architectが助言中（依頼時のみ）" --force
```

`--force` オプションにより、既存ラベルは上書き更新されます。エラーが出た場合はリポジトリ名を `--repo <owner>/<repo>` で明示して再実行してください。

## ステップ5: CLAUDE.md への追記

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

## ステップ6: 完了報告

セットアップ完了後、以下を報告してください：

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- チケット管理: [システム名]
- 配置ファイル数: [件数]
- 作成ラベル数: [件数]（GitHub Issues の場合）

## 次のステップ
1. `.claude/CLAUDE.md` を確認・カスタマイズしてください
2. チームメンバーにリポジトリをクローンしてもらい、`@trimix/ai-team` をインストールします
3. チケットが発行されたら `/ai-team run <チケットURL>` でワークフローを開始します

## カスタマイズ
- エージェント定義: `.claude/teams/<チーム>/agents/` 内の .md ファイルを編集
- ワークフロー: `.claude/teams/<チーム>/workflow.yml` を編集
- DOD: `.claude/teams/<チーム>/dod/` 内のテンプレートを編集
```
