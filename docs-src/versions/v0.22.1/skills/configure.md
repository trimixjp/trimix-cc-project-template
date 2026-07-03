# /ai-team-configure — ワークフロー設定ウィザード

会話形式の質問に答えながら `.claude/teams/<team_id>/workflow.yml` を生成・編集するウィザードです。手で YAML を書かなくてもワークフローをカスタマイズできます。

> **スキル定義**: `skills/ai-team-configure.md`

---

## 使い方

```
/ai-team-configure <team_id>
```

`team_id` は `backend` / `frontend` / `content` / `infra` のいずれかを指定します。引数を省略した場合、対話的にチームを選択します。

> **v0.11.0 の変更**: ウィザードが生成する workflow.yml の雛形は新規約（`rework_limit: 2`・`on_rework.limit_exceeded_next` による差し戻し上限）に対応しています。

### 実行例

```
/ai-team-configure backend
/ai-team-configure content
/ai-team-configure          ← チームを対話的に選択
```

---

## ウィザードの流れ

### ステップ 0: チーム ID の確認と現状表示

1. 引数または対話で `team_id` を確定
2. `.claude/teams/<team_id>/` が存在することを確認（なければエラーで終了）
3. 既存の `workflow.yml` を読み込んで表示

```
📄 現在の workflow.yml:
──────────────────────────────────
<workflow.yml の内容>
──────────────────────────────────
```

4. **新規作成 / 編集** を選択

| 選択肢 | 動作 |
|--------|------|
| [1] 既存をベースに編集 | ステップ追加・変更・削除・順序変更を繰り返す |
| [2] 新規作成 | 現在のファイルを置き換える |

ファイルが存在しない場合は自動的に「新規作成」になります。

---

### ステップ 1: エージェント一覧の取得

```bash
ls .claude/teams/<team_id>/agents/*.md | xargs -I{} basename {} .md
```

取得したエージェント名がステップ選択の候補になります。

---

### ステップ 2: ステップの構成決定

#### 新規作成の場合

利用可能なエージェント一覧から、ワークフローに含めるものを実行順に選択します。**ステップ ID はエージェント名と同じ**に自動設定されます（例: `editor-in-chief`）。

#### 既存編集の場合

操作メニューが表示されます。

```
📋 現在のステップ一覧:
  [1] tech-lead (agent: tech-lead)
  [2] implementer (agent: implementer)
  ...

何をしますか？
[1] ステップを追加する
[2] ステップを変更する
[3] ステップを削除する
[4] ステップの順序を変更する
[5] 完了（設定内容の確認へ進む）
```

「5: 完了」を選ぶまで操作を繰り返します。

---

### ステップ 3: 各ステップの詳細設定

新規作成または「変更」を選んだステップに対して、詳細設定が問われます。

#### 3-1: label と description

```
ステップ tech-lead（agent: tech-lead）の基本設定

1. label（デフォルト: backend:tech-lead）
2. description（省略可）

スラッシュ区切りで入力してください：
例: content:editor-in-chief / 方針決定とResearcher要否の判断
```

#### 3-2: 完了後の動作

```
tech-lead が完了したら次に何をしますか？

[1] 次のステップへ進む
[2] 条件によって分岐する
[3] ここで終了（Issueをクローズする）
```

##### 選択肢 1: 次のステップへ

候補ステップを番号付きで表示し、選択させます。生成 YAML：

```yaml
on_complete:
  next: implementer
```

##### 選択肢 2: 条件分岐

条件を 1 つずつ追加します。各条件で以下を入力します。

- 条件名（例: `single-review` / `double-review`）
- 説明
- 判定基準（スラッシュ区切りで複数）
- この条件の次ステップ（カンマ区切りで並列実行）

生成 YAML：

```yaml
conditions:
  - id: single-review
    description: ダブルレビュー基準に非該当
    criteria:
      - 変更ファイル数が5未満
      - 認証・決済に非該当
    next: reviewer

  - id: double-review
    description: いずれかに該当する場合
    criteria:
      - 変更ファイル数が5以上
    next: [reviewer-a, reviewer-b]   # 並列実行
```

##### 選択肢 3: Issue をクローズ

```yaml
on_complete:
  action: close_issue
```

#### 3-3: 差し戻し・エスカレーション・並列設定

任意で以下を追加できます（複数選択可）。

| 設定 | 用途 | 生成される YAML |
|------|------|---------------|
| 差し戻し | レビュー不合格時に前のステップに戻す | `on_rework: { trigger, next }` |
| エスカレーション | 判断できない時に人間へ | `on_escalation: { next: human-escalator }` |
| 並列実行 | 別ステップと同時進行 | `parallel_with: <step_id>` |
| 完了待ち | 複数ステップの完了を待つ | `requires: [<a>, <b>]` |

---

### ステップ 4: YAML 生成・プレビュー・保存

収集した情報から YAML を生成し、プレビュー表示してから保存確認します。

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📄 生成される workflow.yml のプレビュー
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

<生成された YAML>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  保存すると .claude/teams/<team_id>/workflow.yml が上書きされます。

この内容で保存しますか？
[1] 保存する
[2] キャンセル
```

「保存する」を選ぶと `Write` ツールで `.claude/teams/<team_id>/workflow.yml` に書き込まれます。

---

## YAML 出力フォーマットのルール

ウィザードが守るルールは次のとおりです。

| ルール | 詳細 |
|--------|------|
| `description` が空 | フィールド自体を省略 |
| `on_rework` / `on_escalation` / `parallel_with` / `requires` が未設定 | フィールド自体を省略 |
| `conditions` がある | `on_complete` を省略（排他関係） |
| `next` が単一 | 文字列で出力（例: `next: reviewer`） |
| `next` が複数 | 配列で出力（例: `next: [reviewer-a, reviewer-b]`） |

---

## 生成 YAML の例（バックエンドの典型例）

```yaml
name: backend-workflow
description: コード実装・API・テスト等バックエンドリングタスクのワークフロー

labels:
  prefix: "backend"

steps:

  - id: tech-lead
    agent: tech-lead
    label: "backend:tech-lead"
    description: 要件分析・設計方針の決定
    on_complete:
      next: implementer
    on_escalation:
      next: human-escalator

  - id: implementer
    agent: implementer
    label: "backend:implementer"
    on_complete:
      next: tech-lead-review-decision
    on_rework:
      trigger: "差し戻し"
      next: implementer

  - id: tech-lead-review-decision
    agent: tech-lead
    label: "backend:tech-lead"
    conditions:
      - id: single-review
        description: ダブルレビュー基準に非該当
        criteria:
          - 変更ファイル数が5未満
        next: reviewer

      - id: double-review
        description: いずれかに該当する場合
        criteria:
          - 変更ファイル数が5以上
        next: [reviewer-a, reviewer-b]
```

---

## 関連ドキュメント

- [ワークフロー定義](../reference/workflow.html) — YAML フィールドの全仕様
- [チーム概要](../teams/overview.html) — 既存ワークフローの実例
