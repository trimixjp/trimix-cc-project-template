# スキル一覧

`@trimix/ai-team` は **9 つ**のスキル（スラッシュコマンド）を提供します。`npx @trimix/ai-team install` により `.claude/commands/` 配下に自動展開されるため、起動後すぐに利用できます。

---

## スキル一覧

| スキル | 用途 | 引数 |
|--------|------|------|
| [`/ai-team-setup`](setup.html) | AIチームをプロジェクトにセットアップするウィザード | なし |
| [`/ai-team-ticket`](ticket.html) | チケット操作（作成はタイトル・本文入力、他は番号入力） | create / list / view / … |
| [`/ai-team-run`](run.html) | チケットを読み込みワークフローを起動 | チケットURL または ID |
| [`/ai-team-watch`](watch.html) | ソロモード用。チケットを定期監視 | なし |
| [`/ai-team-configure`](configure.html) | チームの `workflow.yml` を会話形式で生成・編集 | チームID |
| [`/ai-team-create`](create.html) | カスタムチームをゼロから作成するウィザード | チームID（省略可） |
| [`/ai-team-install`](install.html) | ワークフロープラグインをインストール | チームID |
| [`/ai-team-gallery`](gallery.html) | 利用可能なプラグイン一覧を表示 | なし |
| [`/ai-team-resume`](resume.html) | エスカレーション対応済みチケットの続きを再開 | なし（または チケット番号/URL） |

各スキルの定義ファイルはパッケージ内 `skills/*.md` にあり、`npx @trimix/ai-team install` で `.claude/commands/` にコピーされます。

---

## スキルの使い方

Claude Code を起動した状態で、メッセージ入力欄に `/` を入力するとスキル候補が表示されます。

```
/ai-team-setup
/ai-team-ticket create          ← タイトル・本文を対話入力
/ai-team-run 1
/ai-team-watch
/ai-team-configure backend
```

引数は半角スペースで区切ります。引数が必須のスキル（`run` / `configure` / `install`）で引数が省略された場合、Claude Code が対話的に補完を促します。

---

## 典型的な使用フロー

### 初回セットアップ時

```
1. npm install --save-dev ./trimix-ai-team-x.x.x.tgz
2. /ai-team-setup            ← チーム選択・チケット方式・runtime
3. /ai-team-ticket create    ← タイトル・本文を対話入力
4. /ai-team-run 1            ← ワークフロー起動
```

### ソロ運用（自動監視）

```
1. /ai-team-setup            ← 運用モードで「solo」を選択
2. /ai-team-watch            ← 監視ループ開始
3. /ai-team-ticket create ... ← 新規チケット作成（自動検出）
4. エスカレーション発生 → 人間が対応 → 自動再開
```

### マルチユーザー運用

```
1. /ai-team-setup            ← 運用モードで「multi-user」を選択
2. 各メンバーが /ai-team-run <チケット番号> を実行
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

### カスタムチームの新規作成

```
1. /ai-team-create           ← 対話ウィザード開始
2. チームID・エージェント構成・ワークフローを入力
3. ファイル生成 → .claude/teams/<team_id>/ に展開される
4. /ai-team-run <チケット番号>  ← カスタムチームで処理開始
```

---

## スキルファイルの構造

各スキルファイルは Markdown 形式で、YAML フロントマターと本文（手順）から構成されます。例として `skills/ai-team-run.md` の冒頭を示します。

```markdown
---
name: ai-team-run
description: チケット（GitHub / ローカル md / Jira等）を読み込み、AIチームのワークフローを起動します。引数にチケットのURLまたはIDを指定してください。
model: opus
effort: high
model_role: leader
---

# /ai-team-run — ワークフロー起動

あなたはAIチームのオーケストレーターです。担当チケットを読み込み、適切なワークフローを起動してください。
...
```

| frontmatter | 必須 | 意味 |
|-------------|------|------|
| `name` | はい | スキル名（スラッシュなし）。Claude Code / Grok がスキル一覧で識別する |
| `description` | はい | ユーザー向けの一行説明（スキル候補に表示される） |
| `model` | はい | 実行モデルのエイリアス（runtime 依存。例: `opus` / `sonnet` / `haiku` / `fable`、Grok 時は `grok-4.5` 等） |
| `effort` | はい | 推論深度（`low` / `medium` / `high` / `xhigh` / `max`。runtime・モデルにより利用可範囲が異なる） |
| `model_role` | はい | プロファイル適用時の役割ヒント（`leader` / `worker` / `simple`） |

`name` と `description` はスキル一覧表示に使われます。`model` / `effort` / `model_role` はエージェント定義と同じく、`/ai-team-setup` の runtime・性能プロファイル・effort 深度で一括反映されます（個別編集も可）。詳細は [エージェント定義](../guide/agents.html) の「モデル・effort 指定」を参照してください。

本文には実行すべき手順がステップごとに記述されています。
