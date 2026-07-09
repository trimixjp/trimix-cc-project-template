# クイックスタート

`@trimix/ai-team` を使い始めるまでの手順を、最短ルートで説明します。各ステップの詳細は対応するページへのリンクから参照できます。

---

## 前提条件

### 必須（どのチケット方式でも）

| 項目 | 要件 | 確認コマンド |
|------|------|-------------|
| Node.js | 18.0.0 以上（`package.json` の `engines.node`） | `node --version` |
| Claude Code または Grok Build | インストール済み・サインイン済み | `claude --version` または `grok --version` |
| Git リポジトリ | プロジェクトが Git で管理されている | `git status` |

### 任意（ticket_backend: github のときだけ必要）

setup でチケット管理に **GitHub Issues** を選ぶ場合のみ、次が必要です。**ローカル Markdown（`ticket_backend: local`）を選ぶ場合は不要です。**

| 項目 | 要件 | 確認コマンド |
|------|------|-------------|
| GitHub CLI | インストール済み・認証済み（ラベル作成・チケット操作） | `gh auth status` |
| GitHub リポジトリ | リモートが存在し、Issues が有効 | `gh repo view` |

github 運用で未認証の場合は `gh auth login` を実行してください。

### Node.js のインストール（未導入の場合）

本パッケージは **Node.js 18 以上**が必要です（推奨: 公式の **LTS**）。未導入の場合は、OS ごとに次のいずれかの方法で入れてください。

導入後の確認:

```bash
node --version   # v18.0.0 以上であること
npm --version
```

#### macOS

**方法 A: 公式インストーラ（手早く入れる）**

1. [Node.js 公式ダウンロード](https://nodejs.org/ja/download) を開く
2. **LTS** を選び、macOS 用（Apple Silicon は arm64、Intel は x64）のインストーラ（`.pkg`）を取得する
3. インストーラを開き、画面の指示に従ってインストールする
4. ターミナルを開き直し、上記の確認コマンドを実行する

**方法 B: Homebrew**

```bash
# Homebrew が無い場合のみ
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install node
node --version
npm --version
```

**方法 C: nvm（バージョン切替がしやすい）**

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# ターミナルを開き直すか、表示された source の指示に従う
nvm install --lts
nvm use --lts
node --version
```

#### Windows

**方法 A: 公式インストーラ（手早く入れる・推奨）**

1. [Node.js 公式ダウンロード](https://nodejs.org/ja/download) を開く
2. **LTS** を選び、Windows 用インストーラ（`.msi`、通常は x64）を取得する
3. インストーラを実行する  
   - 「**Automatically install the necessary tools**」等が出た場合は、そのまま進めてよい  
   - インストール先や「Add to PATH」は既定のままで問題ない
4. **新しい** PowerShell または コマンドプロンプトを開き、確認する:

```powershell
node --version
npm --version
```

**方法 B: winget（Windows パッケージマネージャ）**

```powershell
winget install OpenJS.NodeJS.LTS
# インストール後、ターミナルを開き直す
node --version
npm --version
```

**方法 C: Chocolatey**

```powershell
# 管理者 PowerShell で Chocolatey 導入済みであること
choco install nodejs-lts -y
node --version
npm --version
```

> **注意（Windows）**: インストール直後に `node` が見つからない場合は、ターミナルを開き直すか、PC を一度サインアウト／再起動して PATH を反映してください。

---

## ステップ 1: パッケージのインストール

配布された `.tgz` ファイルをプロジェクトルートに配置して、`npm install` で開発依存に追加します。

```bash
cd /path/to/your-project
npm install --save-dev ./trimix-ai-team-0.7.0.tgz
```

完了すると以下のメッセージが表示されます。

```
✅ @trimix/ai-team: 8 件のSkillファイルを .claude/commands/ に展開しました
   Claude Code で /ai-team-setup を実行してセットアップを完了してください
```

> **この時点ではまだ使えません。** スキルファイルが展開されただけで、チーム・ワークフロー・ラベルはまだ作成されていません。**必ずステップ 2 に進んでください。**

---

## ステップ 2: セットアップウィザードを実行する（必須）

Claude Code を起動し、以下のスラッシュコマンドを実行します。

```
/ai-team-setup
```

ウィザードが対話形式で次の項目を確認します。

1. **実行基盤（runtime）**: Claude Code / Grok Build
2. **導入するチーム**: backend / frontend / content / infra / sns 等（複数選択可）
3. **運用モード**: `multi-user`（担当者ごとに `/ai-team-run` 起動）または `solo`（`/ai-team-watch` で自動監視）
4. **バージョン管理**: `auto` / `manual` / `none`
5. **チケット管理方式**: **GitHub Issues** または **ローカル Markdown**（後者は GitHub 不要）
6. **チケット強制チェック**: 指示書のみ / hooks で強制
7. **モデル性能・effort**: バランス / ハイパフォーマンス / 低コスト など
8. **ラベルの作成**（**github のときのみ**）: `gh label create` で一括作成するか。local 運用ならスキップ可

セットアップが完了すると、プロジェクトルートに次のディレクトリが配置されます。

```
.claude/
├── CLAUDE.md                # プロジェクト用 AIチーム設定（タスク受付ルールを含む）
├── ai-team-config.yml       # 運用モード・solo設定・バージョン管理設定
├── escalation-rules.yml     # エスカレーション条件
├── agents/                  # 共通エージェント（contributor / dispatcher / human-escalator）
├── teams/<team_id>/         # 選択したチームのワークフロー・エージェント・DOD
├── dod/                     # 共通DODテンプレート（incident.md など）
├── incidents/               # インシデントレポート（初期状態は空）
├── docs/workflow-guide.md   # ワークフロー運用ガイド
├── hooks/                   # UserPromptSubmit フック（hooks を選択した場合のみ）
│   └── ensure-issue.sh      # ファイル変更系の指示に チケット番号がなければブロック
└── commands/                # postinstall で展開された 7 個のスキル
```

詳細は [ai-team-setup スキル](skills/setup.html) を参照してください。

---

## ステップ 3: 最初のタスクの実行

### 方法 A: マルチユーザーモード（個別実行）

チケットを作成し、適切なリーダーラベル（例: `backend:tech-lead`）を付けます。担当者は Claude Code で以下を実行します。

```
/ai-team-run 42
```

または チケットの URL を直接渡します。

```
/ai-team-run https://github.com/.*/issues/42
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

`.claude/ai-team-config.yml` の `solo.poll_interval_minutes`（デフォルト 5 分）ごとに新規チケットを検出し、自動でワークフローを起動します。停止するまで監視ループが動作するため、停止には Ctrl+C を使用します。

詳細は [ai-team-watch スキル](skills/watch.html) を参照してください。

---

## ステップ 4: 人間の判断が必要になった場合

AI エージェントが法的判断・予算承認・PR マージ・仕様の曖昧さに遭遇すると、`human-escalator` が起動して `escalated:human` ラベルを付与し処理を停止します。チケットには以下のような案内が投稿されます。

```
🚨 エスカレーション: 人間の判断が必要です

## エスカレーション理由
種別: ambiguous_spec
理由: （具体的に何が判断できないか）

## 対応完了後の手順
1. このチケットに判断内容をコメントしてください
2. escalated:human ラベルを外してください
3. 以下のコマンドでワークフローを再開してください：
   /ai-team-resume
```

人間がコメント・ラベル除去を行ったら、以下で続きから再開します。

```
/ai-team-resume
```

引数なしで実行すると、再開対象チケットを自動検出します。詳細は [ai-team-resume スキル](skills/resume.html) を参照してください。

---

## 次に読むべきページ

- インストール手順とディレクトリ構成の詳細 → [インストール](installation.html)
- すべてのスキル（スラッシュコマンド）の仕様 → [スキル一覧](skills/overview.html)
- チームごとのワークフロー（フロー図あり） → [チーム概要](teams/overview.html)
- ワークフロー YAML の文法 → [ワークフロー定義](reference/workflow.html)
- DOD（Definition of Done）の運用 → [DOD テンプレート](reference/dod.html)
- よくある質問 → [FAQ](faq.html)
- 問題が発生した場合 → [トラブルシューティング](guide/troubleshooting.html)
