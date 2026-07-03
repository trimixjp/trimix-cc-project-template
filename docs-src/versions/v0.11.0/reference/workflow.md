# ワークフロー定義

`.claude/teams/<team_id>/workflow.yml` は AI チームの実行手順を定義する YAML ファイルです。エージェントの呼び出し順序・条件分岐・並列実行・差し戻し・エスカレーションを宣言的に記述します。

> 編集する際は `/ai-team-configure <team_id>` のウィザードを使うと、対話形式で安全に編集できます。

---

## トップレベル構造

```yaml
name: <ワークフロー名>
description: <説明>

# 同一Issueでの差し戻し上限（v0.11.0 で追加。全チーム共通で 2）
rework_limit: 2

labels:
  prefix: "<チームID>"
  examples:
    - "<ラベル例 1>"
    - "<ラベル例 2>"

steps:
  - id: <step_id>
    agent: <エージェント名>
    label: "<ラベル名>"
    description: <ステップの説明>
    on_complete: { ... }
    on_rework: { ... }
    on_escalation: { ... }
    parallel_with: <step_id>
    requires: [<step_id>, ...]
    requires_all_of: [<step_id>, ...]
    conditions: [ ... ]
```

---

## トップレベルフィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `name` | string | ○ | ワークフローの識別名（例: `backend-workflow`） |
| `description` | string | ○ | ワークフローの説明 |
| `rework_limit` | integer | △ | 同一 Issue での差し戻し上限（v0.11.0 で追加）。超過時（3 回目の不合格）は差し戻さず `escalated:human` へ |
| `labels.prefix` | string | ○ | ラベルのプレフィックス（例: `backend`） |
| `labels.examples` | array | △ | 参考用のラベル例 |
| `steps` | array | ○ | ステップ定義の配列 |

---

## ステップフィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `id` | string | ○ | ステップの識別子（一意） |
| `agent` | string | ○ | 動作するエージェント名（`.claude/teams/<team_id>/agents/<agent>.md` または `.claude/agents/<agent>.md`） |
| `label` | string | △ | このステップ中に Issue に付与されるラベル |
| `description` | string | △ | ステップの説明 |
| `on_complete` | object | △ | 正常完了時の次ステップ定義 |
| `on_rework` | object | △ | 差し戻し時の動作 |
| `on_escalation` | object | △ | エスカレーション時の動作 |
| `parallel_with` | string | △ | 並列実行する相手のステップ ID |
| `requires` | array | △ | 開始前に完了している必要があるステップ ID リスト |
| `requires_all_of` | array | △ | `requires` の別名（インフラチームで使用） |
| `conditions` | array | △ | 条件分岐定義（`on_complete` と排他） |

---

## `on_complete`: 正常完了時の動作

### パターン 1: 次のステップへ進む

```yaml
on_complete:
  next: implementer
```

### パターン 2: 条件付き完了

```yaml
on_complete:
  condition: 合格
  next: tech-writer
```

`condition` はラベル更新の判定に使われる文字列です。

### パターン 3: Issue クローズ（終端ステップ）

```yaml
on_complete:
  action: close_issue
```

### パターン 4: 条件分岐（インライン）

```yaml
on_complete:
  conditions:
    - id: needs-research
      description: 事実確認・データ収集が必要と判断
      criteria:
        - 統計・数値データが必要
      next: researcher
    - id: no-research-needed
      description: 既存情報で執筆可能
      criteria:
        - 既知の事実のみで構成される記事
      next: writer
```

---

## `on_rework`: 差し戻し時の動作

```yaml
on_rework:
  trigger: "差し戻し"    # コメント本文にこの文字列が含まれると発動
  next: implementer
```

または `condition` で表現することも可能です。

```yaml
on_rework:
  condition: 不合格
  next: implementer
  # rework_limit（2回）超過時 = 同一Issueで3回目の不合格は差し戻さず human-escalator へ
  limit_exceeded_next: human-escalator
```

### 差し戻し上限と決定論的カウント（v0.11.0）

トップレベルの `rework_limit` と `on_rework.limit_exceeded_next` を組み合わせることで、レビューの差し戻しが無限ループすることを防ぎます。

- 差し戻し（不合格の最終判定）コメントの**先頭行**は必ず `❌ <エージェント名>: 差し戻し（差し戻し回数: n/2）` 形式
- レビュー役エージェントは `gh api` でコメント先頭行のみを正規表現照合してカウントするため、本文中の引用による偽陽性がない（決定論的カウント）
- **n < 2**: 差し戻し可。**n ≥ 2**: 差し戻さず `limit_exceeded_next`（`escalated:human`）へエスカレーション

この仕組みは全 5 チーム（backend / frontend / content / infra / sns）に導入されています。

---

## `on_escalation`: エスカレーション時の動作

```yaml
on_escalation:
  next: human-escalator
```

意見の不一致など特殊な条件を `condition` で記述することも可能です。

```yaml
on_escalation:
  condition: 意見が割れて判断できない
  next: human-escalator
```

---

## `conditions`: 条件分岐（トップレベル）

`on_complete` の代わりにステップ直下に書く形式もあります（バックエンドの `tech-lead-review-decision` で使用）。

```yaml
- id: tech-lead-review-decision
  agent: tech-lead
  label: "backend:tech-lead"
  conditions:
    - id: single-review
      description: ダブルレビュー基準に非該当
      criteria:
        - 変更ファイル数が5未満
        - 認証・決済に非該当
      next: reviewer

    - id: double-review
      description: 以下のいずれかに1つでも該当する場合
      criteria:
        - 変更ファイル数が5以上
      next: [reviewer-a, reviewer-b]   # 並列起動
```

### 条件フィールド

| フィールド | 型 | 説明 |
|-----------|---|------|
| `id` | string | 条件の識別子 |
| `description` | string | 条件の説明 |
| `criteria` | array | 判定基準（人間が読む参考情報） |
| `next` | string または array | 次ステップ。配列の場合は並列実行 |

---

## 並列実行

### パターン 1: 条件分岐で複数の `next`

```yaml
conditions:
  - id: double-review
    next: [reviewer-a, reviewer-b]   # 両方が並列起動
```

### パターン 2: `parallel_with` 宣言

```yaml
- id: reviewer-a
  agent: reviewer-a
  parallel_with: reviewer-b
  on_complete:
    next: cross-review

- id: reviewer-b
  agent: reviewer-b
  parallel_with: reviewer-a
  on_complete:
    next: cross-review
```

### パターン 3: 並列実行の合流

```yaml
- id: cross-review
  agent: reviewer-a
  requires: [reviewer-a, reviewer-b]   # 両方の完了を待つ
  on_complete:
    next: tech-writer
```

または `requires_all_of`（同等の意味、インフラで使用）：

```yaml
- id: infra-lead-check
  agent: infra-lead
  requires_all_of:
    - network-engineer
    - infra-specialist
```

### AND 待機のアトミック遷移（v0.11.0）

`requires_all_of` の合流判定では、並列ステップのラベルの有無が完了状態の指標になります。両者同時完了時の判定すれ違い（レースコンディション）を防ぐため、エージェントは以下の手順でラベルを遷移します。

1. **遷移直前**に `gh issue view <番号> --json labels` で最新のラベルを再取得する（古い取得結果を使い回さない）
2. ラベルの除去と付与は**単一の** `gh issue edit` コマンドで実行する（中間状態を作らない）
3. **待機パス側の再確認（競合解消）**: 相手の完了を待つと判断して自分のラベルのみ除去した側も、除去後にもう一度ラベルを再取得し、「`requires_all_of` の全ラベルが除去済み かつ 次のステップのラベルが未付与」なら次のステップのラベルを付与する（ラベル付与は冪等であり、両者が重複して付与しても無害）
4. 遷移後にもう一度ラベルを取得し、期待した状態になっているか検証する

**不整合検知時のリカバリ**: 並列ステップのラベルがすべて除去済みなのに次のステップのラベルが付与されていない場合（遷移の中断）、エージェントは次のステップのラベルを付与してリカバリした旨をコメントします。ただし**誤発動ガード**として、ワークフロー上の後続ステップのラベルがいずれも付与されていないことを確認してから実行します（すでに先へ進んでいる Issue に過去のステップのラベルを再付与してはいけません）。

---

## 特殊なステップ ID

| 特殊 ID | 用途 |
|---------|------|
| `human-escalator` | エスカレーション処理ステップ。全チームに 1 個ずつ存在 |
| `human-merge-approval` | PR マージを人間に依頼するステップ（backend / frontend） |
| `contributor-close` | DOD 確認・Issue クローズの終端ステップ |
| `return_to_previous` | エスカレーション解除後、元のステップに戻る指示（`on_complete.next` の特殊値）。v0.11.0 から human-escalator がエスカレーションコメントに記録する「エスカレーション元ステップ」フィールド（workflow.yml のステップ ID）を `/ai-team-resume` が機械的に読み取って復帰先を決定する |

---

## バックエンド `workflow.yml` の実例

```yaml
name: backend-workflow
description: コード実装・API・テスト等バックエンドリングタスクのワークフロー

# 同一Issueでの差し戻し上限。3回目の不合格（差し戻し）は escalated:human へ
rework_limit: 2

labels:
  prefix: "backend"
  examples:
    - "backend:tech-lead"
    - "backend:implementer"
    - "backend:reviewer"
    - "backend:version-bumper"
    - "backend:tech-writer"
    - "backend:pr-creator"
    - "contributor:ready"
    - "escalated:human"

steps:

  - id: tech-lead-analysis
    agent: tech-lead
    label: "backend:tech-lead"
    description: 要件分析・設計方針の決定・インシデント確認
    on_complete:
      next: implementer
    on_escalation:
      next: human-escalator

  - id: implementer
    agent: implementer
    label: "backend:implementer"
    description: Tech-Leadの設計方針に従い実装・テスト実施
    on_complete:
      next: tech-lead-review-decision
    on_escalation:
      next: human-escalator
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

  - id: reviewer
    agent: reviewer
    label: "backend:reviewer"
    on_complete:
      condition: 合格
      next: version-bumper
    on_rework:
      condition: 不合格
      next: implementer
      # rework_limit（2回）超過時は implementer へ差し戻さず human-escalator へ
      limit_exceeded_next: human-escalator
    on_escalation:
      next: human-escalator

  - id: reviewer-a
    agent: reviewer-a
    label: "backend:reviewer-a"
    parallel_with: reviewer-b
    on_complete:
      condition: 独立レビュー完了
      next: cross-review

  - id: reviewer-b
    agent: reviewer-b
    label: "backend:reviewer-b"
    parallel_with: reviewer-a
    on_complete:
      condition: 独立レビュー完了
      next: cross-review

  - id: cross-review
    agent: reviewer-a
    requires_all_of: [reviewer-a, reviewer-b]
    on_complete:
      condition: 合格（両者合意）
      next: version-bumper
    on_rework:
      condition: 不合格
      next: implementer
      limit_exceeded_next: human-escalator
    on_escalation:
      condition: 意見が割れて判断できない
      next: human-escalator

  - id: version-bumper
    agent: version-bumper
    label: "backend:version-bumper"
    on_complete:
      next: tech-writer
    on_escalation:
      next: human-escalator

  - id: tech-writer
    agent: tech-writer
    label: "backend:tech-writer"
    on_complete:
      next: pr-creator

  - id: pr-creator
    agent: pr-creator
    label: "backend:pr-creator"
    on_complete:
      next: human-merge-approval

  - id: human-merge-approval
    agent: human-escalator
    label: "escalated:human"
    on_complete:
      condition: 人間がマージ完了
      next: contributor-close

  - id: human-escalator
    agent: human-escalator
    label: "escalated:human"
    on_complete:
      condition: 人間が判断・返答
      next: return_to_previous

  - id: contributor-close
    agent: contributor
    label: "contributor:ready"
    on_complete:
      action: close_issue
```

---

## ベストプラクティス

1. **`id` はエージェント名と一致させる**（`/ai-team-configure` がそうするように）。複数回登場する場合は `tech-lead-review-decision` のように説明的な接尾辞を付ける
2. **条件分岐は `conditions` で表現**し、`description` と `criteria` に人間向けの説明を含める
3. **並列実行には `parallel_with` と `requires` をペアで使う**（並列起動と合流の両方を宣言）
4. **差し戻しには `trigger` 文字列を使う**（コメント検索による発動）
5. **エスカレーション先は通常 `human-escalator`**。複雑なエスカレーション分岐が必要な場合のみ別ステップを追加
6. **`rework_limit` と `limit_exceeded_next` をペアで定義する**（差し戻し無限ループの防止。v0.11.0 以降の標準）

---

## 関連ドキュメント

- [設定ファイル](config.html) — `review-config.yml` の判定基準
- [エスカレーションルール](escalation.html) — `human-escalator` の動作
- [/ai-team-configure](../skills/configure.html) — ウィザードによる編集
- [バックエンドチーム](../teams/backend.html) — 実例のフロー図
