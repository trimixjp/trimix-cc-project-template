# ワークフローの起動

## ソロモード（自動監視）

`/ai-team watch` を使うと、GitHub Issues を定期的にポーリングして新しいタスクを自動検出します。

```bash
/ai-team watch
```

設定ファイル (`.claude/ai-team-config.yml`) でポーリング間隔とターゲットラベルを設定できます。

```yaml
mode: solo
solo:
  poll_interval_minutes: 5
  target_labels:
    - backend:tech-lead
    - frontend:frontend-lead
```

## 手動起動

特定の Issue を指定して実行します。

```bash
/ai-team run <Issue番号>
```

## バックエンドワークフローの流れ

```
GitHub Issue 作成
    ↓
Tech-Lead: 要件分析・設計方針決定
    ↓
Implementer: 実装・テスト
    ↓
Tech-Lead: レビュー方式の自動判断
    ↓
[シングル] Reviewer: コードレビュー
[ダブル]   Reviewer-A + Reviewer-B → クロスレビュー
    ↓
Tech-Writer: ドキュメント更新・ビルド
    ↓
PR-Creator: プルリクエスト作成
    ↓
人間: PR承認・マージ
    ↓
Contributor: Issue クローズ
```
