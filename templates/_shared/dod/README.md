# DOD テンプレート 選択ガイド

Contributor は Issue のタスクタイプに応じて以下のDODテンプレートを適用してください。

---

## Contributor 用クイックリファレンス

### Step 1: ラベルから担当チームを特定

| Issue のラベル | DOD ディレクトリ |
|--------------|----------------|
| `backend:*` | `.claude/teams/backend/dod/` |
| `frontend:*` | `.claude/teams/frontend/dod/` |
| `content:*` | `.claude/teams/content/dod/` |
| `infra:*` | `.claude/teams/infra/dod/` |
| `incident` | `.claude/dod/incident.md`（共通・直接参照） |
| `epic` | 全 Sub Issue のラベルから各チームを特定して全 DOD を確認 |

### Step 2: タイトル・本文からDODファイルを特定

| タスクタイプの判定基準 | DOD ファイル |
|----------------------|-------------|
| 「新機能」「実装」「追加」「feature」を含む | `feature.md` |
| 「不具合」「バグ」「修正」「bug」「fix」を含む | `bugfix.md` |
| 「ドキュメント」「README」「仕様書」「docs」を含む | `documentation.md`（存在する場合） |
| 「リファクタリング」「refactor」「整理」を含む | `refactor.md` |
| 「レビュー」「review」「監査」を含む | `review.md` |
| 上記いずれにも該当しない | `feature.md` をデフォルト適用 |

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

> **補足**: 各エージェントは作業完了コメントの `## 完了条件チェック` に、自身の完了条件（exit criteria）の充足状況を記録します。この記録はエージェント個別の完了条件であり、本 DOD チェックリストを置き換えるものではありません。Contributor は両方を確認してからクローズします。

---

## DOD のカスタマイズ

プロジェクト固有のチェック項目は各テンプレートファイルに直接追記してください。
共通の追加ルールは `_shared/dod/` に新規ファイルとして作成し、このREADMEに追記してください。
