---
name: ai-team-setup
description: AIチームをプロジェクトにセットアップするウィザード。.claude/ディレクトリにエージェント定義・ワークフロー・設定ファイルを配置し、GitHub Issuesのラベルを作成します。
model: opus
effort: high
model_role: leader
---

# /ai-team-setup — AIチーム セットアップウィザード

あなたはセットアップウィザードです。以下の手順でAIチームをプロジェクトに導入してください。

## ステップ1: 現状確認

まず以下を確認してください：

1. 現在の作業ディレクトリを確認する（`pwd`）
2. `.claude/` ディレクトリが存在するか確認する
3. 既存の `.claude/teams/` があれば、すでにセットアップ済みのチームを確認する

## ステップ2: 導入チームと運用モードの選択

ユーザーに以下を確認してください（`AskUserQuestion` ツールを使用）：

**質問1**: 導入するチームを選択してください（複数選択可）

> ⚠️ `AskUserQuestion` の選択肢は最大4つです。6チームを2回に分けて確認します。

**質問1a**（`AskUserQuestion` / multiSelect: true）: エンジニアリング・コンテンツ系チームを選択してください（複数選択可）
- バックエンドチーム（コード実装・レビュー・PR作成）
- フロントエンドチーム（UI実装・コンポーネント開発・アクセシビリティ）
- インフラチーム（クラウド構成・ネットワーク・セキュリティ）
- コンテンツチーム（記事・ドキュメント作成）

**質問1b**（`AskUserQuestion` / multiSelect: true）: マーケティング・メディア系チームを選択してください（複数選択可）
- SNS運用チーム（X・Instagram の投稿戦略・執筆・公開指示）
- YouTube動画制作チーム（企画・台本・生成・公開・収益最大化。QA層・複数チャンネル対応）
- 追加しない

両質問の回答をまとめて「導入するチーム一覧」として扱います。

**質問2**: 運用モードを選択してください（`AskUserQuestion` ツールを使用）
- **マルチユーザーモード**: 担当者が `/ai-team-run <Issue>` を実行して処理を開始します。複数人チームに適しています
- **ソロモード**: `/ai-team-watch` を起動すると新しいIssueを自動検出して処理します。1人での運用に適しています

**質問3**: バージョン管理の方法を選択してください（`AskUserQuestion` ツールを使用）
- **自動インクリメント（auto）**: Reviewer 合格後に conventional commit に基づき `package.json` のバージョンを自動更新します。ソロ運用・小規模チームに適しています
- **手動管理（manual）**: バージョンアップはワークフロー外で人間が管理します。Version-Bumper ステップは残り、スキップ報告だけを行います。チーム開発・独自リリースフロー・monorepo に適しています
- **使わない（none）**: バージョン管理をワークフローから完全に外します。version-bumper ステップ自体を削除するため、Reviewer 合格後は直接 Tech-Writer に引き継がれます。バージョン概念のないリポジトリ（アプリ運用・ドキュメント等）に適しています

**質問4**: チケット管理方式を選択してください（`AskUserQuestion` ツールを使用）

- **GitHub Issues（既定・エンジニア向け）**: 既存どおり `gh` 経由。協業・PR 連携向き
- **ローカル Markdown（Obsidian 推奨・非エンジニア向け）**: プロジェクト内 `tickets/*.md` で完結。プライベート GitHub 不要。人間は Obsidian で `tickets/` を vault として開く運用を推奨（エージェントはファイル + CLI のみ）

**質問4b**: Issue / チケット強制チェックの方法を選択してください（`AskUserQuestion` ツールを使用）

ファイル変更を伴う指示はチケットを起点にすることで、インシデント記録・ラベル管理・作業履歴が機能します。チェック方法を選択してください。

- **CLAUDE.md のみ（推奨）**: タスク受付ルールを CLAUDE.md に記載します。Claude が内容を判断してチケット経由を促します
- **hooks で強制**: `UserPromptSubmit` フックを設定します（GitHub Issue 番号 / ローカル番号の検出。local 時は数字 ID も可）

**質問5**: モデル性能プロファイルを選択してください（`AskUserQuestion` ツールを使用）

各エージェント・スキルの frontmatter（`model`）に、役割（指揮者 / 作業者 / 単純作業）ごとのモデルを一括反映します。

- **バランス（推奨・デフォルト）**: 指揮者 `opus`、作業者 `sonnet`、単純作業 `haiku`
- **ハイパフォーマンス**: 指揮者 `fable`、作業者 `opus`、単純作業 `sonnet`（高品質優先）
- **低コスト**: 指揮者 `sonnet`、作業者 `sonnet`、単純作業 `haiku`（コスト優先）

**質問6**: effort（推論の深さ）を選択してください（`AskUserQuestion` ツールを使用）

各エージェント・スキルの frontmatter（`effort`）に、選択した深さを一括反映します。

- **普通（推奨・デフォルト）**: 全て `high`
- **深く**: 全て `xhigh`（難しい設計・大規模タスク向け）
- **軽く**: 全て `medium`（高速・低コスト向け。high 未満）

> **細かい設定は md ファイルの直接編集で可能です。** setup 後に個別エージェントだけモデルを変えたい場合は、`.claude/teams/<team>/agents/*.md` や `.claude/commands/*.md` の `model` / `effort` を編集してください（バージョン固定のモデル ID は禁止。エイリアス `fable` / `opus` / `sonnet` / `haiku` のみ）。

### 質問5・6 の選択肢マッピング（決定表）

| ユーザー選択 | 内部 ID（config に記録） | 反映内容 |
|-------------|--------------------------|----------|
| バランス | `model_performance: balance` | leader=opus, worker=sonnet, simple=haiku |
| ハイパフォーマンス | `model_performance: high-performance` | leader=fable, worker=opus, simple=sonnet |
| 低コスト | `model_performance: low-cost` | leader=sonnet, worker=sonnet, simple=haiku |
| 普通 | `effort_depth: normal` | 全ファイル `effort: high` |
| 深く | `effort_depth: deep` | 全ファイル `effort: xhigh` |
| 軽く | `effort_depth: light` | 全ファイル `effort: medium` |

## ステップ3: ファイルの配置

選択されたチームに基づいて、このパッケージの `templates/` から以下をコピーしてください。

**コピー手順（各行共通）:** 配置先ディレクトリを `mkdir -p` で作成してから `cp` を実行します。コピー元はパッケージのルート（ソースリポジトリならカレント、npm 経由なら `node_modules/@trimix/ai-team/`）を基準にします。

```bash
# 例: 単一ファイルの行
mkdir -p .claude/agents
cp <パッケージルート>/templates/_shared/agents/contributor.md .claude/agents/contributor.md

# 例: ワイルドカード（*.md）の行
mkdir -p .claude/teams/backend/agents
cp <パッケージルート>/templates/teams/backend/agents/*.md .claude/teams/backend/agents/
```

### 必須（全チーム共通）

```
templates/_shared/agents/contributor.md     → .claude/agents/contributor.md
templates/_shared/agents/dispatcher.md      → .claude/agents/dispatcher.md
templates/_shared/agents/human-escalator.md → .claude/agents/human-escalator.md
templates/_shared/escalation-rules.yml      → .claude/escalation-rules.yml
templates/_shared/model-profiles.yml        → .claude/model-profiles.yml
templates/_shared/dod/incident.md           → .claude/dod/incident.md
templates/_shared/dod/README.md             → .claude/dod/README.md
templates/incidents/index.yml               → .claude/incidents/index.yml
templates/incidents/TEMPLATE.md             → .claude/incidents/TEMPLATE.md
templates/incidents/README.md               → .claude/incidents/README.md
templates/docs/workflow-guide.md            → .claude/docs/workflow-guide.md
templates/docs/agent-writing-guide.md      → .claude/docs/agent-writing-guide.md
templates/docs/domain-workflow-guide.md    → .claude/docs/domain-workflow-guide.md
templates/docs/quickstart-by-domain.md    → .claude/docs/quickstart-by-domain.md
templates/docs/local-tickets.md            → .claude/docs/local-tickets.md
# 運用モード設定（選択したモードを記録）
→ .claude/ai-team-config.yml（内容は下記）
```

### ローカルチケット（質問4で local を選んだ場合）

```
templates/tickets/README.md              → tickets/README.md
templates/tickets/_templates/ticket.md   → tickets/_templates/ticket.md
templates/tickets/open/.gitkeep          → tickets/open/.gitkeep
templates/tickets/closed/.gitkeep        → tickets/closed/.gitkeep
```

`ticket_backend: local` のときはステップ4（GitHub ラベル作成）をスキップしてよい旨をユーザーに伝えます。

ステップ2で選択した運用モード・モデル設定に応じて、以下の内容で `.claude/ai-team-config.yml` を生成してください：

```yaml
# @trimix/ai-team 運用設定
mode: multi-user  # または solo

# バージョン管理設定
# auto:   Reviewer合格後にconventional commitに基づきpackage.jsonを自動インクリメント（ソロ・小規模チーム向け）
# manual: バージョンアップはワークフロー外で人間が管理（チーム開発・独自リリースフロー向け）
# none:   バージョン管理を使わない（セットアップ時に version-bumper ステップをワークフローから削除）
version_management: auto  # または manual / none

# モデル性能プロファイル（質問5）
# high-performance: leader=fable, worker=opus, simple=sonnet
# balance:          leader=opus,  worker=sonnet, simple=haiku（デフォルト）
# low-cost:         leader=sonnet, worker=sonnet, simple=haiku
model_performance: balance  # または high-performance / low-cost

# effort 深度（質問6）
# deep:   全て xhigh
# normal: 全て high（デフォルト）
# light:  全て medium
effort_depth: normal  # または deep / light

# チケット管理方式（質問4）
# github: GitHub Issues（既定）
# local:  リポジトリ内 Markdown（tickets/）。Obsidian 推奨 UI
ticket_backend: github  # または local

# local 時のみ有効
local_tickets:
  dir: tickets
  id_prefix: ""

# solo モードの設定（mode: solo の場合のみ有効）
solo:
  poll_interval_minutes: 5      # Issue監視の間隔（分）
  target_labels:                # 処理対象とするラベル（いずれか1つでも付いていれば対象）
    - dispatcher
    - backend:tech-lead
    - frontend:designer
    - content:editor-in-chief
    - infra:infra-lead
    - sns:strategist
    - youtube:director
  skip_labels:                  # このラベルが付いていれば処理済みとしてスキップ
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

### モデル・effort の一括反映（質問5・6 の後、ファイル配置直後に必ず実行）

テンプレートをコピーしただけでは、テンプレート既定（balance / normal）の `model` / `effort` が残ります。選択したプロファイルを **配置済みの `.claude/` と `.claude/commands/`** に反映してください。

**方法A（推奨）: パッケージ同梱スクリプト**

```bash
# <パッケージルート> は npm なら node_modules/@trimix/ai-team、ソースならリポジトリルート
# <performance> = balance | high-performance | low-cost
# <effort>      = normal | deep | light

node <パッケージルート>/bin/lib/apply-model-profile.js \
  --profile <performance> \
  --effort <effort> \
  --dir .claude

# スキル（commands）にも同様に反映
node <パッケージルート>/bin/lib/apply-model-profile.js \
  --profile <performance> \
  --effort <effort> \
  --dir .claude/commands \
  --skills-only
```

**方法B: スクリプトが使えない場合**

`.claude/model-profiles.yml` と `bin/lib/model-profiles.js` の role 対応に従い、各エージェント / スキル md の frontmatter に `model` と `effort` を手書きで upsert する。

**反映後の検証（必須）:**

```bash
# leader の1体（例: tech-lead）と simple の1体（例: pr-creator）を spot チェック
head -8 .claude/teams/backend/agents/tech-lead.md
head -8 .claude/teams/backend/agents/pr-creator.md
head -8 .claude/commands/ai-team-run.md
```

| 選択 | tech-lead の model | pr-creator の model | effort |
|------|-------------------|---------------------|--------|
| balance + normal | opus | haiku | high |
| high-performance + deep | fable | sonnet | xhigh |
| low-cost + light | sonnet | haiku | medium |

> **再設定**: プロファイルを後から変える場合も、同じスクリプトを `.claude` に対して再実行できます。個別 md の手動調整は再実行で上書きされる点に注意してください。

### ソロモード（選択時）

```
skills/ai-team-watch.md → .claude/commands/ai-team-watch.md
```

### Issue 強制チェック（hooks を選択した場合）

#### フックスクリプトの配置

```
templates/_shared/hooks/ensure-issue.sh → .claude/hooks/ensure-issue.sh
```

配置後、実行権限を付与してください：

```bash
chmod +x .claude/hooks/ensure-issue.sh
```

#### `.claude/settings.json` へのフック登録

`.claude/settings.json` が存在する場合は `hooks` キーをマージし、存在しない場合は新規作成してください：

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/ensure-issue.sh"
          }
        ]
      }
    ]
  }
}
```

**マージ規則（既存の `settings.json` がある場合）:**

- `hooks.UserPromptSubmit` 配列が既にある場合は、その配列に上記の要素を**追加**する（配列ごと置き換えない）
- 同一の `command`（`bash .claude/hooks/ensure-issue.sh`）を持つ要素が既にある場合は追加をスキップする
- `hooks` 以外の既存キー（`permissions` 等）は一切変更しない

> **注意**: `.claude/settings.json` はプロジェクト設定です。個人設定を `.claude/settings.local.json` に分けている場合はそちらへの記載も検討してください。

### バックエンドチーム（選択時）

```
templates/teams/backend/agents/*.md       → .claude/teams/backend/agents/
templates/teams/backend/workflow.yml      → .claude/teams/backend/workflow.yml
templates/teams/backend/review-config.yml → .claude/teams/backend/review-config.yml
templates/teams/backend/dod/*.md          → .claude/teams/backend/dod/
# tech-writer.md・documentation.md は上記ワイルドカードに含まれます
```

#### バージョン管理「使わない（none）」選択時の追加編集（バックエンドチーム配置後に実施）

質問3で **使わない（none）** を選択した場合は、配置したファイルに以下の編集を加えて、ワークフローからバージョンアップを外してください。

1. **`.claude/teams/backend/workflow.yml` から version-bumper ステップを削除する**
   - `- id: version-bumper` のステップブロック全体（直前の説明コメント4行を含む）を削除する
   - `reviewer` と `cross-review` の `on_complete` にある `next: version-bumper` を `next: tech-writer` に付け替える

   ```yaml
   # 編集前（reviewer / cross-review の2箇所。condition 行は変更しない）
   on_complete:
     condition: 合格
     next: version-bumper

   # 編集後（next のみ付け替える）
   on_complete:
     condition: 合格
     next: tech-writer
   ```

   - `labels.examples` の `"backend:version-bumper"` の行を削除する
   - 編集後に `grep -c "version-bumper" .claude/teams/backend/workflow.yml` を実行し、出力が `0` であることを確認する

2. **`.claude/teams/backend/agents/version-bumper.md` を削除する**（ワークフローから参照されなくなるため）

3. **reviewer 系エージェント定義の引き継ぎ先ラベルを置換する**
   - 対象: `.claude/teams/backend/agents/reviewer.md`・`reviewer-a.md`・`reviewer-b.md`
   - `backend:version-bumper` をすべて `backend:tech-writer` に置換する

4. **DOD のバージョン管理セクション**（`.claude/teams/backend/dod/feature.md`・`bugfix.md`）
   - 「✅ バージョン管理」セクションを削除する（none ではチェック対象外）

> ⚠️ auto / manual を選択した場合はこの編集は不要です（manual はステップが残り、Version-Bumper がスキップ報告します）。

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

### YouTube動画制作チーム（選択時）

```
templates/teams/youtube/agents/*.md         → .claude/teams/youtube/agents/
templates/teams/youtube/workflow.yml        → .claude/teams/youtube/workflow.yml
templates/teams/youtube/dod/*.md            → .claude/teams/youtube/dod/
templates/teams/youtube/PRODUCTION-GUIDE.md → .claude/teams/youtube/PRODUCTION-GUIDE.md
```

### GitHub Issueテンプレート（常に配置）

```
templates/.github/ISSUE_TEMPLATE/*.yml → .github/ISSUE_TEMPLATE/
```

### .gitignore への追記（常に実行）

AIチームの設定ファイルは各自の環境で `/ai-team-setup` を実行してセットアップするため、Git 管理から除外します。**追記前に `grep` で追記済みかを確認**し、未追記の場合のみ以下を実行してください（再実行しても重複しません）：

```bash
# 追記済み判定（この見出し行があれば追記しない）→ 未追記なら追記を実行
grep -qF "# @trimix/ai-team - AIチーム設定" .gitignore 2>/dev/null || cat >> .gitignore << 'EOF'

# @trimix/ai-team - AIチーム設定（各自の環境で /ai-team-setup を実行してください）
.claude/teams/
.claude/agents/
.claude/dod/
.claude/docs/
.claude/commands/
.claude/hooks/
.claude/ai-team-config.yml
.claude/escalation-rules.yml
.claude/model-profiles.yml

# @trimix/ai-team - GitHub Issue テンプレート
.github/ISSUE_TEMPLATE/
EOF
```

> **マルチユーザーモードで設定を共有する場合:**
>
> チーム全員が同じエージェント定義・ワークフローを使う場合は、`.gitignore` 追記後に `git add -f` で強制追加してください：
>
> ```bash
> git add -f .claude/teams/ .claude/agents/ .claude/dod/ .claude/docs/ \
>            .claude/ai-team-config.yml .claude/escalation-rules.yml \
>            .github/ISSUE_TEMPLATE/
> git commit -m "chore: AIチーム設定を追加"
> ```
>
> 以降は通常通り `git add` / `git commit` で変更を管理できます。
> 個人環境でのみ使う設定（`hooks/` など）は引き続き `.gitignore` で除外してください。

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
     その後、/ai-team-setup を再実行してください

  B) 新しいリポジトリを作成する場合:
     gh repo create <repo-name> --public  （または --private）
     その後、/ai-team-setup を再実行してください
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
- いいえ、スキップする（後で手動作成するか、/ai-team-setup を再実行して作成できます）

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

> ⚠️ 質問3で **使わない（none）** を選択した場合は、`backend:version-bumper` の行をスキップしてください（ワークフローにステップが存在しないため）。

```bash
gh label create "backend:tech-lead"      --color "1d76db" --description "Tech-Leadが要件分析・設計中"        --force
gh label create "backend:implementer"    --color "1d76db" --description "Implementerが実装中"                --force
gh label create "backend:reviewer"       --color "1d76db" --description "Reviewerがレビュー中"                --force
gh label create "backend:reviewer-a"     --color "1d76db" --description "Reviewer-Aがレビュー中"             --force
gh label create "backend:reviewer-b"     --color "1d76db" --description "Reviewer-Bがレビュー中"             --force
gh label create "backend:cross-review"   --color "1d76db" --description "クロスレビューで合意形成中"          --force
gh label create "backend:version-bumper" --color "1d76db" --description "Version-Bumperがバージョン更新中"   --force
gh label create "backend:tech-writer"    --color "1d76db" --description "Tech-Writerがドキュメント更新中"     --force
gh label create "backend:pr-creator"     --color "1d76db" --description "PR-CreatorがPR作成中"               --force
```

### フロントエンドチーム（選択時）

```bash
gh label create "frontend:designer"      --color "f9a825" --description "Designerがデザイン仕様策定中" --force
gh label create "frontend:frontend-lead" --color "f9a825" --description "Frontend-Leadが設計中"       --force
gh label create "frontend:developer"     --color "f9a825" --description "Developerが実装中"           --force
gh label create "frontend:reviewer"      --color "f9a825" --description "Reviewerがレビュー中"         --force
gh label create "frontend:reviewer-a"    --color "f9a825" --description "Reviewer-Aがレビュー中"      --force
gh label create "frontend:reviewer-b"    --color "f9a825" --description "Reviewer-Bがレビュー中"      --force
gh label create "frontend:cross-review"  --color "f9a825" --description "クロスレビューで合意形成中"   --force
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

### YouTube動画制作チーム（選択時）

```bash
gh label create "youtube:director"             --color "c4302b" --description "Directorが統括・タスク判定中"          --force
gh label create "youtube:market-analyst"       --color "c4302b" --description "Market-Analystが市場・ジャンル戦略を分析中" --force
gh label create "youtube:channel-producer"     --color "c4302b" --description "Channel-Producerがチャンネル設計・編成中"   --force
gh label create "youtube:scriptwriter"         --color "c4302b" --description "Scriptwriterが台本を執筆中"             --force
gh label create "youtube:editor"               --color "c4302b" --description "Editorがレンダ（動画生成）を実行中"      --force
gh label create "youtube:growth-strategist"    --color "c4302b" --description "Growth-Strategistがパッケージング設計中" --force
gh label create "youtube:affiliate"            --color "c4302b" --description "Affiliateがアフィリ収益設計中"          --force
gh label create "youtube:publisher"            --color "c4302b" --description "Publisherが公開・字幕登録中"            --force
gh label create "youtube:sns-distributor"      --color "c4302b" --description "SNS-DistributorがSNS拡散を設計中"       --force
gh label create "youtube:monetizer"            --color "c4302b" --description "Monetizerが収益最大化施策を提案中"       --force
gh label create "youtube:script-qa"            --color "c4302b" --description "Script-QAが台本成果物をQA中"            --force
gh label create "youtube:render-reviewer"      --color "c4302b" --description "Render-Reviewerがレンダ成果物をQA中"     --force
gh label create "youtube:growth-qa"            --color "c4302b" --description "Growth-QAがパッケージング成果物をQA中"   --force
gh label create "youtube:affiliate-qa"         --color "c4302b" --description "Affiliate-QAがアフィリ成果物をQA中"      --force
gh label create "youtube:publish-qa"           --color "c4302b" --description "Publish-QAが公開成果物をQA中"           --force
gh label create "youtube:sns-qa"               --color "c4302b" --description "SNS-QAがSNS拡散成果物をQA中"            --force
gh label create "youtube:monetizer-qa"         --color "c4302b" --description "Monetizer-QAが収益施策成果物をQA中"      --force
gh label create "youtube:channel-producer-qa"  --color "c4302b" --description "Channel-Producer-QAが企画/編成成果物をQA中" --force
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
チケットを担当したら `/ai-team-run <IssueのURL または Issue番号>` を実行してください。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`

---

## タスク受付ルール（重要）

### ファイル変更を伴う指示は必ず Issue 経由で処理する

ソースコード・設定・ドキュメントなど**ファイルへの書き込みが発生する作業**を依頼された場合、
Issue 番号や URL が指定されていなくても、作業を開始する前に必ず以下を行ってください：

1. `gh issue list --state open --search "<キーワード>"` で関連する既存 Issue を探す
2. 該当 Issue があればそれを使う（ユーザーに確認して選択させる）
3. なければ `gh issue create` で内容に即した Issue を作成する
4. Issue 番号が確定したら `/ai-team-run <番号>` でワークフローを起動する

**Issue 経由が必須な理由**: インシデント記録・ラベルによる状態管理・作業履歴の追跡が Issue ベースで機能するため（詳細は `/ai-team-run` パターンB冒頭の説明を参照）。

### Issue 不要な指示（直接回答してよい）

以下はファイルを変更しないため Issue は不要です：

- コードの説明・解説・質問への回答
- 現状調査・ログ確認・原因分析（実装を伴わないもの）
- レビューや提案の読み上げ・要約

**判断基準**: 「この作業でファイルを Edit / Write / 削除するか？」→ Yes なら Issue 必須、No なら不要。
```

## コマンド失敗時のフォールバック

`gh` コマンドやファイル操作（`cp` / `mkdir` 等）が失敗した場合は、失敗を無視して先に進んではいけません。

1. **1回だけリトライする**（一時的な失敗の可能性があるため）
2. リトライでも失敗した場合は、**実行すべきコマンドをそのままユーザーに提示して停止**する

## 報告前チェック

完了報告の前に以下を確認してください。

- [ ] 配置したファイルが実在する（`ls .claude/agents/ .claude/teams/<選択チーム>/` で確認）
- [ ] `.claude/ai-team-config.yml` に選択した `mode` / `version_management` / `model_performance` / `effort_depth` が記録されている
- [ ] モデル・effort プロファイルを配置済み md に反映済み（tech-lead / pr-creator / ai-team-run の frontmatter を spot チェック）
- [ ] `.claude/model-profiles.yml` が配置されている
- [ ] `.gitignore` に追記済みである（`grep -F "@trimix/ai-team" .gitignore`）
- [ ] ラベルを作成した場合、実行した `gh label create` がすべて成功した
- [ ] 質問3で none を選択した場合、`grep -c "version-bumper" .claude/teams/backend/workflow.yml` の出力が `0` である

## ステップ6: 完了報告

**[件数] の数え方:**
- 作成ラベル数 = 実行に成功した `gh label create` コマンドの本数
- 配置ファイル数 = ステップ3でコピー・生成したファイルパスの数（ワイルドカード行は展開後の実ファイル数を数える）

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- 作成ラベル数: [件数]件
- 配置ファイル数: [件数]件
- モデル性能: [balance / high-performance / low-cost]
- effort 深度: [normal / deep / light]

## 次のステップ
1. `.claude/CLAUDE.md` を確認・カスタマイズしてください
2. チームメンバーに `npm install --save-dev ./trimix-ai-team-x.x.x.tgz` を実行してもらいます
3. Issueを作成し、担当者をアサインしたら `/ai-team-run <IssueのURL>` でワークフローを開始します

## カスタマイズ
- エージェント定義: `.claude/teams/<チーム>/agents/` 内の .md ファイルを編集
- ワークフロー: `.claude/teams/<チーム>/workflow.yml` を編集
- DOD: `.claude/teams/<チーム>/dod/` 内のテンプレートを編集
- **モデル / effort の個別調整**: 各 md の frontmatter（`model` / `effort`）を直接編集（エイリアスのみ。詳細は `.claude/model-profiles.yml` と `.claude/docs/agent-writing-guide.md`）
- **プロファイルの一括変更**: `node <パッケージルート>/bin/lib/apply-model-profile.js --profile <id> --effort <id> --dir .claude`

## 運用モードについて
- **マルチユーザーモード**: Issueを作成し、担当者をアサインしたら `/ai-team-run <IssueのURL>` でワークフローを開始します
- **ソロモード**: `/ai-team-watch` を実行すると新しいIssueの自動監視が始まります。停止するまでバックグラウンドで動作します
```
