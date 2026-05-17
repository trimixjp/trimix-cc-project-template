# ワークフロー定義リファレンス

ワークフローは `.claude/teams/{チーム}/workflow.yml` で定義します。

## 基本構造

```yaml
name: ワークフロー名
description: 説明

labels:
  prefix: "チーム名"

steps:
  - id: ステップID
    agent: エージェント名
    label: "チーム名:ラベル名"
    description: ステップの説明
    on_complete:
      next: 次のステップID
    on_escalation:
      next: human-escalator
```

## ステップのオプション

| フィールド | 説明 |
|----------|------|
| `id` | ステップの一意識別子 |
| `agent` | 使用するエージェント名（agents/配下のファイル名） |
| `label` | GitHub Issues に付与するラベル |
| `description` | ステップの説明 |
| `on_complete.next` | 完了時の次ステップ |
| `on_rework` | 差し戻し時の設定 |
| `on_escalation.next` | エスカレーション先 |
| `parallel_with` | 並列実行するステップID |
| `requires` | 実行前に完了が必要なステップIDのリスト |
| `conditions` | 条件分岐の定義 |

## バックエンドワークフロー

```
tech-lead-analysis
  → implementer
    → tech-lead-review-decision
      → [single] reviewer → tech-writer → pr-creator
      → [double] reviewer-a + reviewer-b → cross-review → tech-writer → pr-creator
        → human-merge-approval → contributor-close
```
