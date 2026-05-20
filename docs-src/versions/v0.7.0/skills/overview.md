# スキル一覧

`@trimix/ai-team` は 7 つの Claude Code スキル（スラッシュコマンド）を提供します。`bin/postinstall.js` により `.claude/commands/` 配下に自動展開されるため、Claude Code 起動後すぐに利用できます。

---

## スキル一覧

| スキル | 用途 | 引数 |
|--------|------|------|
| [`/ai-team-setup`](setup.html) | AIチームをプロジェクトにセットアップするウィザード | なし |
| [`/ai-team-run`](run.html) | チケット（GitHub Issue 等）を読み込みワークフローを起動 | チケットURL または ID |
| [`/ai-team-watch`](watch.html) | ソロモード用。GitHub Issues を定期監視 | なし |
| [`/ai-team-configure`](configure.html) | チームの `workflow.yml` を会話形式で生成・編集 | チームID（backend/frontend/content/infra） |
| [`/ai-team-install`](install.html) | ワークフロープラグインをインストール | チームID |
| [`/ai-team-gallery`](gallery.html) | 利用可能なプラグイン一覧を表示 | なし |
| [`/ai-team-resume`](resume.html) | エスカレーション対応済みIssueの続きを再開 | なし（または Issue番号/URL） |

各スキルの定義ファイルはパッケージ内 `skills/*.md` にあり、postinstall で `.claude/commands/` にコピーされます。

---

## スキルの使い方

Claude Code を起動した状態で、メッセージ入力欄に `/` を入力するとスキル候補が表示されます。

```
/ai-team-setup
/ai-team-run 42
/ai-team-watch
/ai-team-configure backend
```

引数は半角スペースで区切ります。引数が必須のスキル（`run` / `configure` / `install`）で引数が省略された場合、Claude Code が対話的に補完を促します。

---

## 典型的な使用フロー

### 初回セットアップ時

```
1. npm install --save-dev ./trimix-ai-team-0.5.1.tgz
2. /ai-team-setup            ← チーム選択・ラベル作成
3. /ai-team-run <Issue番号>  ← 最初のタスクを実行
```

### ソロ運用（自動監視）

```
1. /ai-team-setup            ← 運用モードで「solo」を選択
2. /ai-team-watch            ← 監視ループ開始
3. （新規 Issue を作成 → 自動処理される）
4. エスカレーション発生 → 人間が対応 → 自動再開
```

### マルチユーザー運用

```
1. /ai-team-setup            ← 運用モードで「multi-user」を選択
2. 各メンバーが /ai-team-run <Issue番号> を実行
3. エスカレーション発生 → 人間対応 → /ai-team-resume で再開
```

### ワークフローのカスタマイズ

```
1. /ai-team-configure backend   ← ステップ追加・並列実行・条件分岐などを設定
2. 生成された workflow.yml を確認
3. /ai-team-run でテスト実行
```

### 追加チームの導入

```
1. /ai-team-gallery          ← 利用可能なプラグインを確認
2. /ai-team-install frontend ← フロントエンドチームを追加
3. /ai-team-setup            ← ラベル作成と CLAUDE.md 更新
```

---

## スキルファイルの構造

各スキルファイルは Markdown 形式で、YAML フロントマターと本文（手順）から構成されます。例として `skills/ai-team-run.md` の冒頭を示します。

```markdown
---
name: ai-team-run
description: チケット（GitHub Issue・Jira等）を読み込み、AIチームのワークフローを起動します。引数にチケットのURLまたはIDを指定してください。
---

# /ai-team run — ワークフロー起動

あなたはAIチームのオーケストレーターです。担当チケットを読み込み、適切なワークフローを起動してください。
...
```

`name` と `description` は Claude Code がスキル一覧を表示する際に使用します。本文には Claude Code が実行すべき手順がステップごとに記述されています。
