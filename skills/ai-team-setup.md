---
name: ai-team-setup
description: AIチームをプロジェクトにセットアップするウィザード。.claude/ディレクトリにエージェント定義・ワークフロー・設定ファイルを配置し、GitHub Issuesのラベルを作成します。
---

# /ai-team setup — AIチーム セットアップウィザード

あなたはセットアップウィザードです。以下の手順でAIチームをプロジェクトに導入してください。

## ステップ1: 現状確認

まず以下を確認してください：

1. 現在の作業ディレクトリを確認する（`pwd`）
2. `.claude/` ディレクトリが存在するか確認する
3. 既存の `.claude/teams/` があれば、すでにセットアップ済みのチームを確認する

## ステップ2: 導入チームと運用モードの選択

ユーザーに以下を確認してください（`AskUserQuestion` ツールを使用）：

**質問1**: 導入するチームを選択してください（複数選択可）
- バックエンドチーム（コード実装・レビュー・PR作成）
- フロントエンドチーム（UI実装・コンポーネント開発・アクセシビリティ）
- コンテンツチーム（記事・ドキュメント作成）
- インフラチーム（クラウド構成・ネットワーク・セキュリティ）
- SNS運用チーム（X・Instagram の投稿戦略・執筆・公開指示）

**質問2**: 運用モードを選択してください（`AskUserQuestion` ツールを使用）
- **マルチユーザーモード**: 担当者が `/ai-team run <Issue>` を実行して処理を開始します。複数人チームに適しています
- **ソロモード**: `/ai-team watch` を起動すると新しいIssueを自動検出して処理します。1人での運用に適しています

**質問3**: バージョン管理の方法を選択してください（`AskUserQuestion` ツールを使用）
- **自動インクリメント（auto）**: Reviewer 合格後に conventional commit に基づき `package.json` のバージョンを自動更新します。ソロ運用・小規模チームに適しています
- **手動管理（manual）**: バージョンアップはワークフロー外で人間が管理します。チーム開発・独自リリースフロー・monorepo に適しています

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
# 運用モード設定（選択したモードを記録）
→ .claude/ai-team-config.yml（内容は下記）
```

ステップ2で選択した運用モードに応じて、以下の内容で `.claude/ai-team-config.yml` を生成してください：

```yaml
# @trimix/ai-team 運用設定
mode: multi-user  # または solo

# バージョン管理設定
# auto:   Reviewer合格後にconventional commitに基づきpackage.jsonを自動インクリメント（ソロ・小規模チーム向け）
# manual: バージョンアップはワークフロー外で人間が管理（チーム開発・独自リリースフロー向け）
version_management: auto  # または manual

# solo モードの設定（mode: solo の場合のみ有効）
solo:
  poll_interval_minutes: 5      # Issue監視の間隔（分）
  target_labels:                # 処理対象とするラベル（いずれか1つでも付いていれば対象）
    - dispatcher
    - backend:tech-lead
    - frontend:frontend-lead
    - content:editor-in-chief
    - infra:infra-lead
    - sns:strategist
  skip_labels:                  # このラベルが付いていれば処理済みとしてスキップ
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

### ソロモード（選択時）

```
templates/skills/ai-team-watch.md → .claude/commands/ai-team-watch.md
```

### バックエンドチーム（選択時）

```
templates/teams/backend/agents/*.md       → .claude/teams/backend/agents/
templates/teams/backend/workflow.yml      → .claude/teams/backend/workflow.yml
templates/teams/backend/review-config.yml → .claude/teams/backend/review-config.yml
templates/teams/backend/dod/*.md          → .claude/teams/backend/dod/
```

### フロントエンドチーム（選択時）

```
templates/teams/frontend/agents/*.md          → .claude/teams/frontend/agents/
templates/teams/frontend/workflow.yml         → .claude/teams/frontend/workflow.yml
templates/teams/frontend/review-config.yml    → .claude/teams/frontend/review-config.yml
templates/teams/frontend/dod/*.md             → .claude/teams/frontend/dod/
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

### SNS運用チーム（選択時）

```
templates/teams/sns/agents/*.md  → .claude/teams/sns/agents/
templates/teams/sns/workflow.yml → .claude/teams/sns/workflow.yml
templates/teams/sns/dod/*.md     → .claude/teams/sns/dod/
```

### GitHub Issueテンプレート（常に配置）

```
templates/.github/ISSUE_TEMPLATE/*.yml → .github/ISSUE_TEMPLATE/
```

## ステップ4: GitHub Issuesラベルの作成

### 4-1: リポジトリの確認

まず現在のディレクトリにGitHubリポジトリが設定されているか確認してください：

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

**リポジトリが見つからない場合（エラーが出た場合）:**

以下のメッセージをユーザーに表示して、ラベル作成をスキップしてください：

```
⚠️  GitHubリポジトリが設定されていません

ラベルの作成をスキップします。
リポジトリを用意した後、以下のいずれかの方法でラベルを作成してください：

  A) 既存リポジトリを紐付ける場合:
     git remote add origin https://github.com/<org>/<repo>.git
     その後、/ai-team setup を再実行してください

  B) 新しいリポジトリを作成する場合:
     gh repo create <repo-name> --public  （または --private）
     その後、/ai-team setup を再実行してください
```

ラベル作成をスキップしてステップ5に進んでください。

**リポジトリが見つかった場合:** 4-2 に進みます。

### 4-2: 認証状態の確認

```bash
gh auth status
```

認証されていない場合はユーザーに `gh auth login` の実行を案内し、完了後に続けてください。

### 4-3: ラベル作成の確認

`AskUserQuestion` ツールを使い、以下を確認してください：

**質問**: GitHub Issuesにラベルを作成しますか？
- はい、今すぐ作成する（選択したチームに対応するラベルを一括作成）
- いいえ、スキップする（後で手動作成するか、/ai-team setup を再実行して作成できます）

「いいえ」を選択した場合はステップ5に進んでください。

### 4-4: ラベルの作成

### 共通ラベル（常に作成）

```bash
gh label create "contributor:ready"   --color "0075ca" --description "Contributorが完了確認中"          --force
gh label create "escalated:human"     --color "d93f0b" --description "人間の判断が必要"                 --force
gh label create "epic"                --color "7057ff" --description "複数チームにまたがる大規模タスク"  --force
gh label create "dispatcher"          --color "7057ff" --description "Dispatcherが自動分解中"           --force
gh label create "incident"            --color "b60205" --description "インシデント報告"                 --force
gh label create "ai-team:in-progress" --color "fbca04" --description "AIエージェントが処理中（二重実行防止）" --force
```

### バックエンドチーム（選択時）

```bash
gh label create "backend:tech-lead"   --color "1d76db" --description "Tech-Leadが要件分析・設計中"    --force
gh label create "backend:implementer" --color "1d76db" --description "Implementerが実装中"            --force
gh label create "backend:reviewer"    --color "1d76db" --description "Reviewerがレビュー中"            --force
gh label create "backend:reviewer-a"  --color "1d76db" --description "Reviewer-Aがレビュー中"         --force
gh label create "backend:reviewer-b"  --color "1d76db" --description "Reviewer-Bがレビュー中"         --force
gh label create "backend:pr-creator"  --color "1d76db" --description "PR-CreatorがPR作成中"           --force
```

### フロントエンドチーム（選択時）

```bash
gh label create "frontend:designer"      --color "f9a825" --description "Designerがデザイン仕様策定中" --force
gh label create "frontend:frontend-lead" --color "f9a825" --description "Frontend-Leadが設計中"       --force
gh label create "frontend:developer"     --color "f9a825" --description "Developerが実装中"           --force
gh label create "frontend:reviewer"      --color "f9a825" --description "Reviewerがレビュー中"         --force
gh label create "frontend:reviewer-a"    --color "f9a825" --description "Reviewer-Aがレビュー中"      --force
gh label create "frontend:reviewer-b"    --color "f9a825" --description "Reviewer-Bがレビュー中"      --force
gh label create "frontend:pr-creator"    --color "f9a825" --description "PR-CreatorがPR作成中"        --force
```

### コンテンツチーム（選択時）

```bash
gh label create "content:editor-in-chief" --color "e4e669" --description "Editor-in-Chiefが方針決定中" --force
gh label create "content:researcher"      --color "e4e669" --description "Researcherが調査中"           --force
gh label create "content:writer"          --color "e4e669" --description "Writerが執筆中"               --force
gh label create "content:compliance"      --color "e4e669" --description "Complianceがチェック中"       --force
```

### インフラチーム（選択時）

```bash
gh label create "infra:infra-lead"        --color "0e8a16" --description "Infra-Leadが設計中"            --force
gh label create "infra:network-engineer"  --color "0e8a16" --description "Network-Engineerが実装中"      --force
gh label create "infra:infra-specialist"  --color "0e8a16" --description "Infra-Specialistが実装中"      --force
gh label create "infra:security-engineer" --color "0e8a16" --description "Security-Engineerがレビュー中" --force
gh label create "infra:architect"         --color "5319e7" --description "Architectが助言中（依頼時のみ）" --force
```

### SNS運用チーム（選択時）

```bash
gh label create "sns:strategist" --color "e91e63" --description "Strategistが戦略策定中"          --force
gh label create "sns:researcher" --color "e91e63" --description "Researcherが調査中"              --force
gh label create "sns:writer"     --color "e91e63" --description "Writerが投稿文執筆中"            --force
gh label create "sns:operator"   --color "e91e63" --description "Operatorがガイドライン確認中"    --force
```

`--force` オプションにより既存ラベルは上書き更新されます。

## ステップ5: CLAUDE.md への追記

`.claude/CLAUDE.md` が存在しない場合は作成し、既存の場合は末尾に追記してください：

```markdown
## AIチーム設定

このプロジェクトは `@trimix/ai-team` でセットアップされたAIチームで運用されます。
チケット管理には GitHub Issues を使用します。

### 有効なチーム
<!-- セットアップしたチームを列挙 -->

### ワークフローの起動
チケットを担当したら `/ai-team run <IssueのURL または Issue番号>` を実行してください。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`
```

## ステップ6: 完了報告

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- 作成ラベル数: [件数]件
- 配置ファイル数: [件数]件

## 次のステップ
1. `.claude/CLAUDE.md` を確認・カスタマイズしてください
2. チームメンバーに `npm install --save-dev ./trimix-ai-team-x.x.x.tgz` を実行してもらいます
3. Issueを作成し、担当者をアサインしたら `/ai-team run <IssueのURL>` でワークフローを開始します

## カスタマイズ
- エージェント定義: `.claude/teams/<チーム>/agents/` 内の .md ファイルを編集
- ワークフロー: `.claude/teams/<チーム>/workflow.yml` を編集
- DOD: `.claude/teams/<チーム>/dod/` 内のテンプレートを編集

## 運用モードについて
- **マルチユーザーモード**: Issueを作成し、担当者をアサインしたら `/ai-team run <IssueのURL>` でワークフローを開始します
- **ソロモード**: `/ai-team watch` を実行すると新しいIssueの自動監視が始まります。停止するまでバックグラウンドで動作します
```
