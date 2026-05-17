# 設定ファイルリファレンス

## ai-team-config.yml

AIチームの動作モードと監視設定を定義します。

```yaml
mode: solo

solo:
  poll_interval_minutes: 5
  target_labels:
    - dispatcher
    - backend:tech-lead
    - frontend:frontend-lead
    - content:editor-in-chief
    - infra:infra-lead
  skip_labels:
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

| フィールド | 説明 |
|----------|------|
| `mode` | 動作モード。`solo` のみ対応 |
| `solo.poll_interval_minutes` | ポーリング間隔（分） |
| `solo.target_labels` | 処理対象のIssueラベル |
| `solo.skip_labels` | スキップするIssueラベル |

## escalation-rules.yml

エスカレーションの条件を定義します。

```yaml
escalation_triggers:
  - type: legal
  - type: budget
  - type: merge_approval
  - type: ambiguous_spec
```

## docs-src/config.json

ドキュメントのバージョンとナビゲーション構成を定義します。

```json
{
  "title": "プロジェクト名 ドキュメント",
  "versions": ["v0.5.1"],
  "latest": "v0.5.1",
  "nav": {
    "v0.5.1": [
      {
        "title": "セクション名",
        "items": [
          { "title": "ページタイトル", "file": "ファイル名（拡張子なし）" }
        ]
      }
    ]
  }
}
```
