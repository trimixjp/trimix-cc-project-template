# DOD テンプレート 選択ガイド

Contributor は Issue のタスクタイプに応じて以下のDODテンプレートを適用してください。

---

## テンプレート一覧

### エンジニアチーム

| タスクタイプ | テンプレート | 適用条件 |
|------------|-----------|--------|
| 新機能実装 | `teams/backend/dod/feature.md` | 新しい機能・API・UI の追加 |
| バグ修正 | `teams/backend/dod/bugfix.md` | 既存の不具合修正 |
| コードレビュー | `teams/backend/dod/review.md` | レビュー依頼・監査 |
| リファクタリング | `teams/backend/dod/refactor.md` | 機能変更なしの品質改善 |

### コンテンツチーム

| タスクタイプ | テンプレート | 適用条件 |
|------------|-----------|--------|
| 記事作成 | `teams/content/dod/article.md` | 新規記事・ブログ投稿 |
| ドキュメント | `teams/content/dod/document.md` | 仕様書・マニュアル・README 等 |
| 修正・更新 | `teams/content/dod/revision.md` | 既存コンテンツの修正・加筆 |

### インフラチーム

| タスクタイプ | テンプレート | 適用条件 |
|------------|-----------|--------|
| インフラ変更 | `teams/infra/dod/infrastructure-change.md` | Terraform・K8s・CI/CD 等 |
| ネットワーク変更 | `teams/infra/dod/network-change.md` | VPC・DNS・LB・FW 等 |
| セキュリティレビュー | `teams/infra/dod/security-review.md` | 監査・脆弱性対応・権限設計 |

### 共通（チーム横断）

| タスクタイプ | テンプレート | 適用条件 |
|------------|-----------|--------|
| インシデント対応 | `_shared/dod/incident.md` | 本番障害・セキュリティインシデント |

---

## 適用ルール

1. **Issue 作成時** に担当チームのリーダーAIが適切なテンプレートを Issue 本文に貼り付けます
2. **Contributor がクローズ前に** 全チェックリストが ✅ であることを確認します
3. **未完了の項目がある場合** は Contributor が該当エージェントに差し戻します
4. **複数タイプにまたがる場合**（例: バグ修正 + セキュリティ対応）は両方のテンプレートを適用します

---

## DOD のカスタマイズ

プロジェクト固有のチェック項目は各テンプレートファイルに直接追記してください。
共通の追加ルールは `_shared/dod/` に新規ファイルとして作成し、このREADMEに追記してください。
