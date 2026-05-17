## AIチーム設定

このプロジェクトは `@trimix/ai-team` でセットアップされたAIチームで運用されます。
チケット管理には GitHub Issues を使用します。

### 有効なチーム
- バックエンドチーム: コード実装・レビュー・PR作成
- フロントエンドチーム: UI実装・コンポーネント開発
- インフラチーム: クラウド構成・ネットワーク・セキュリティ
- コンテンツチーム: ドキュメント・READMEの更新

### ワークフローの起動（ソロモード）
`/ai-team watch` を起動すると新しいIssueを自動監視します。
または `/ai-team run <Issue番号>` で手動起動もできます。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`
