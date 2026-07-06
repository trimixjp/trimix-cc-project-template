# /ai-team-setup — セットアップウィザード

AIチームをプロジェクトに導入するための対話型ウィザードです。`.claude/` ディレクトリにエージェント定義・ワークフロー・設定ファイルを配置し、GitHub Issues のラベルを作成します。

> **スキル定義**: `skills/ai-team-setup.md`
> **配置先**: `.claude/commands/ai-team-setup.md`

---

## 使い方

```
/ai-team-setup
```

引数はありません。ウィザードが対話的に必要な情報を確認します。

---

## ステップ 1: 現状確認

ウィザードは次を確認します。

1. 現在の作業ディレクトリ（`pwd`）
2. `.claude/` ディレクトリの有無
3. 既存の `.claude/teams/` がある場合、セットアップ済みのチーム

既にセットアップ済みの場合、追加導入・ラベル再作成のために再実行することも可能です。

---

## ステップ 2: 導入チーム・運用モード・バージョン管理の選択

`AskUserQuestion` ツールで以下の質問が行われます。

### 質問 1: 導入するチーム（複数選択可）

`AskUserQuestion` の選択肢は最大 4 つのため、6 チームを 2 回に分けて確認します。

**質問 1a（エンジニアリング・コンテンツ系）**

- バックエンドチーム（コード実装・レビュー・PR 作成）
- フロントエンドチーム（UI 実装・コンポーネント開発・アクセシビリティ）
- インフラチーム（クラウド構成・ネットワーク・セキュリティ）
- コンテンツチーム（記事・ドキュメント作成）

**質問 1b（マーケティング・メディア系）**

- SNS運用チーム（X・Instagram の投稿戦略・執筆・公開指示）
- YouTube動画制作チーム（企画・台本・生成・公開・収益最大化。QA 層・複数チャンネル対応）
- 追加しない

### 質問 2: 運用モード

| モード | 説明 | 適性 |
|--------|------|------|
| `multi-user` | 担当者が `/ai-team-run <Issue>` を実行して処理を開始 | 複数人チーム |
| `solo` | `/ai-team-watch` で新規 Issue を自動検出して処理 | 1人運用 |

選択した運用モードは `.claude/ai-team-config.yml` に記録されます。

### 質問 3: バージョン管理の方法

| 選択肢 | 動作 | 適性 |
|--------|------|------|
| 自動インクリメント（`auto`） | Reviewer 合格後に conventional commit に基づき `package.json` を自動更新 | ソロ運用・小規模チーム |
| 手動管理（`manual`） | バージョンアップはワークフロー外で人間が管理。Version-Bumper ステップは残り、スキップ報告のみ行う | チーム開発・独自リリースフロー・monorepo |
| 使わない（`none`）※v0.23.0 で追加 | バージョン管理をワークフローから完全に外す。version-bumper ステップ自体を削除し、Reviewer 合格後は直接 Tech-Writer へ | バージョン概念のないリポジトリ（アプリ運用・ドキュメント等） |

### 質問 4: Issue 強制チェックの方法

ファイル変更を伴う指示を GitHub Issue 起点に強制する方法を選択します。

- **CLAUDE.md のみ（推奨）**: タスク受付ルールを CLAUDE.md に記載し、Claude が内容を判断して Issue 経由を促す
- **hooks で強制**: `UserPromptSubmit` フックで、変更系キーワードを含む指示に Issue 番号がない場合に自動ブロックして案内する

---

## ステップ 3: ファイルの配置

選択された内容に応じて、パッケージ内 `templates/` から以下がコピーされます。

### 全チーム共通（必須）

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

### 運用モード設定

`.claude/ai-team-config.yml` が以下の内容で生成されます（`solo` モードを選択した場合の例）。

```yaml
# @trimix/ai-team 運用設定
mode: solo

solo:
  poll_interval_minutes: 5      # Issue監視の間隔（分）
  target_labels:                # 処理対象とするラベル
    - dispatcher
    - backend:tech-lead
    - frontend:designer
    - content:editor-in-chief
    - infra:infra-lead
  skip_labels:                  # このラベルが付いていれば処理済みとしてスキップ
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

### チーム別ファイル

選択したチームごとに `templates/teams/<team_id>/` 配下が `.claude/teams/<team_id>/` にコピーされます。

| チーム | コピー対象 |
|--------|-----------|
| backend | `agents/*.md` / `workflow.yml` / `review-config.yml` / `dod/*.md` |
| frontend | `agents/*.md` / `workflow.yml` / `review-config.yml` / `dod/*.md` |
| content | `agents/*.md` / `workflow.yml` / `dod/*.md` / `compliance-rules/*.md` |
| infra | `agents/*.md` / `workflow.yml` / `dod/*.md` |

### GitHub Issue テンプレート

`templates/.github/ISSUE_TEMPLATE/*.yml` が `.github/ISSUE_TEMPLATE/` にコピーされます。バックエンドなら `backend-feature.yml` / `backend-bugfix.yml` などが対象です。

---

## ステップ 4: GitHub Issues ラベルの作成

### 4-1: リポジトリの確認

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

リポジトリが設定されていない場合、ラベル作成はスキップされ、次の案内が表示されます。

```
⚠️  GitHubリポジトリが設定されていません

ラベルの作成をスキップします。
リポジトリを用意した後、以下のいずれかの方法でラベルを作成してください：
  A) 既存リポジトリを紐付ける場合: git remote add origin ...
  B) 新しいリポジトリを作成する場合: gh repo create ...
```

### 4-2: GitHub CLI 認証の確認

```bash
gh auth status
```

未認証の場合は `gh auth login` を案内して中断します。

### 4-3: ラベル作成の確認

`AskUserQuestion` で「はい、今すぐ作成する」「いいえ、スキップする」を確認します。

### 4-4: ラベルの作成

選択されたチームに応じて `gh label create --force` を実行します。

#### 共通ラベル（常に作成）

| ラベル | 色 | 説明 |
|--------|---|------|
| `contributor:ready` | `0075ca` | Contributorが完了確認中 |
| `escalated:human` | `d93f0b` | 人間の判断が必要 |
| `epic` | `7057ff` | 複数チームにまたがる大規模タスク |
| `dispatcher` | `7057ff` | Dispatcherが自動分解中 |
| `incident` | `b60205` | インシデント報告 |
| `ai-team:in-progress` | `fbca04` | AIエージェントが処理中（二重実行防止） |

#### チーム別ラベル

バックエンドチームを選択した場合の例：

```bash
gh label create "backend:tech-lead"   --color "1d76db" --force
gh label create "backend:implementer" --color "1d76db" --force
gh label create "backend:reviewer"    --color "1d76db" --force
gh label create "backend:reviewer-a"  --color "1d76db" --force
gh label create "backend:reviewer-b"  --color "1d76db" --force
gh label create "backend:pr-creator"  --color "1d76db" --force
```

各チームのカラーは：backend=`1d76db`（青）、frontend=`f9a825`（黄）、content=`e4e669`（薄黄）、infra=`0e8a16`（緑）、architect=`5319e7`（紫）、youtube=`c4302b`（赤）。

`--force` オプションにより既存ラベルは上書き更新されます。

---

## ステップ 5: CLAUDE.md への追記

`.claude/CLAUDE.md` が存在しない場合は新規作成し、既存の場合は末尾に AI チーム設定セクションを追記します。

```markdown
## AIチーム設定

このプロジェクトは `@trimix/ai-team` でセットアップされたAIチームで運用されます。
チケット管理には GitHub Issues を使用します。

### 有効なチーム
- バックエンドチーム: コード実装・レビュー・PR作成
- インフラチーム: クラウド構成・ネットワーク・セキュリティ

### ワークフローの起動
チケットを担当したら `/ai-team-run <IssueのURL または Issue番号>` を実行してください。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`
```

---

## ステップ 6: 完了報告

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- 作成ラベル数: [件数]件
- 配置ファイル数: [件数]件

## 次のステップ
1. `.claude/CLAUDE.md` を確認・カスタマイズしてください
2. チームメンバーに npm install --save-dev ./trimix-ai-team-x.x.x.tgz を実行してもらいます
3. Issueを作成し、担当者をアサインしたら /ai-team-run <IssueのURL> でワークフローを開始します
```

---

## 再実行時の挙動

`/ai-team-setup` は再実行可能です。

- 追加チームを導入する場合：再実行して新しいチームを追加選択
- ラベルを作り直したい場合：再実行してラベル作成の質問で「はい」を選ぶ
- 既存ファイルは上書きされますが、`.claude/teams/<team_id>/` 配下のカスタマイズは自分でバックアップしてから実行することを推奨します

---

## 関連ドキュメント

- [インストール](../installation.html) — postinstall の挙動とディレクトリ構成
- [ai-team-install](install.html) — チーム単体の追加インストール
- [設定ファイル](../reference/config.html) — `ai-team-config.yml` の全フィールド
