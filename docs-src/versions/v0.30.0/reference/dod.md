# DOD テンプレート

DOD（Definition of Done）は「タスクの完了条件」を定義するチェックリストです。Contributor エージェントが チケットクローズ前に該当する DOD を確認し、全項目を満たしていることを確認してからクローズします。

> **配置場所**:
> - 共通 DOD: `.claude/dod/`
> - チーム別 DOD: `.claude/teams/<team_id>/dod/`
> - 選択ガイド: `.claude/dod/README.md`

---

## DOD の概念

| 役割 | 担当 |
|------|------|
| DOD テンプレートの選択 | チケット作成時に担当チームのリーダー AI が貼り付け |
| 全項目チェックの確認 | Contributor がクローズ前に確認 |
| 未充足時の差し戻し | Contributor → 担当エージェント |

---

## 全 DOD テンプレート一覧

### バックエンドチーム

| テンプレート | ファイル | 用途 |
|------------|---------|------|
| 新機能実装 | `.claude/teams/backend/dod/feature.md` | 新しい機能・API・UI の追加 |
| バグ修正 | `.claude/teams/backend/dod/bugfix.md` | 既存の不具合修正 |
| リファクタリング | `.claude/teams/backend/dod/refactor.md` | 機能変更なしの品質改善 |
| コードレビュー | `.claude/teams/backend/dod/review.md` | レビュー依頼・監査 |
| ドキュメント更新 | `.claude/teams/backend/dod/documentation.md` | Tech-Writer 用 |

### フロントエンドチーム

| テンプレート | ファイル | 用途 |
|------------|---------|------|
| 新機能実装 | `.claude/teams/frontend/dod/feature.md` | 新規 UI 機能の追加 |
| 新規コンポーネント | `.claude/teams/frontend/dod/component.md` | 新規 UI コンポーネントの作成 |
| バグ修正 | `.claude/teams/frontend/dod/bugfix.md` | 既存 UI の不具合修正 |

### インフラチーム

| テンプレート | ファイル | 用途 |
|------------|---------|------|
| インフラ変更 | `.claude/teams/infra/dod/infrastructure-change.md` | Terraform・K8s・CI/CD 等 |
| ネットワーク変更 | `.claude/teams/infra/dod/network-change.md` | VPC・DNS・LB・FW 等 |
| セキュリティレビュー | `.claude/teams/infra/dod/security-review.md` | 監査・脆弱性対応・権限設計 |

### コンテンツチーム

| テンプレート | ファイル | 用途 |
|------------|---------|------|
| 記事作成 | `.claude/teams/content/dod/article.md` | 新規記事・ブログ投稿 |
| ドキュメント | `.claude/teams/content/dod/document.md` | 仕様書・マニュアル・README 等 |
| 修正・更新 | `.claude/teams/content/dod/revision.md` | 既存コンテンツの修正・加筆 |

### 共通（チーム横断）

| テンプレート | ファイル | 用途 |
|------------|---------|------|
| インシデント対応 | `.claude/dod/incident.md` | 本番障害・セキュリティインシデント |

---

## バックエンド `feature.md` の例

```markdown
# DOD（Definition of Done）— 新機能実装

## ✅ 設計・要件
- [ ] チケットに要件・機能要件・非機能要件が明記されている
- [ ] Tech-Lead の設計方針コメントが存在する
- [ ] 影響範囲が明確にされている
- [ ] 技術的制約・リスクがコメントに記録されている

## ✅ 実装
- [ ] Tech-Lead の設計方針に従い実装されている
- [ ] 変更ファイル一覧が Implementer のコメントに列挙されている
- [ ] 公開APIの変更がある場合、後方互換性または移行手順が説明されている
- [ ] セキュリティ要件を満たしている
- [ ] ハードコードされた秘密情報・認証情報がない

## ✅ テスト
- [ ] ユニットテストが実装されている
- [ ] ハッピーパスのテストが通過している
- [ ] エッジケース・エラーケースのテストが網羅されている
- [ ] 既存テストがすべて通過している
- [ ] カバレッジが最低基準（80%以上）を満たしている（**カバレッジ計測手段がないプロジェクトは対象外。対象外とする場合はその根拠を チケットコメントに記録する**）

## ✅ コードレビュー
- [ ] Reviewer によるレビューが完了し「合格」判定がある
- [ ] 指摘された CRITICAL / HIGH 件数が0件
- [ ] 差し戻しがあった場合、全件対応済みのコメントがある

## ✅ PR・マージ
- [ ] PR が作成されている
- [ ] PR 本文に設計方針・変更内容・テスト結果が含まれている
- [ ] 人間が PR を承認・マージ済み

## ✅ ドキュメント
- [ ] 新しいAPIや関数の説明が適切にコメントされている
- [ ] README や仕様書の更新が必要な場合は更新されている
- [ ] 破壊的変更がある場合は CHANGELOG または チケットに明記されている
```

---

## DOD の適用ルール

`.claude/dod/README.md` で定義されているルールです。

1. **チケット作成時**に担当チームのリーダー AI が適切なテンプレートを チケット本文に貼り付ける
2. **Contributor がクローズ前に**全チェックリストが ✅ であることを確認
3. **未完了の項目がある場合**は Contributor が該当エージェントに差し戻し
4. **複数タイプにまたがる場合**（例: バグ修正 + セキュリティ対応）は両方のテンプレートを適用

---

## 各 DOD の特徴的なチェック項目

### バックエンド feature.md
- カバレッジ 80% 以上（v0.15.0 改善: **カバレッジ計測手段がないプロジェクトは対象外**。対象外とする場合はその根拠を チケットコメントに記録する）
- 公開 API の後方互換性または移行手順

### バックエンド bugfix.md
- 根本原因（root cause）の明記
- リグレッションテストの追加
- 一時的回避策（workaround）ではなく恒久修正
- 同種バグが他箇所にないことの確認
- 本番影響の場合インシデントレポート作成

### バックエンド refactor.md
- 機能変更を含まない（外部インターフェース不変）
- カバレッジ維持

### バックエンド documentation.md（Tech-Writer 用）
- 全 git diff 変更箇所のドキュメント反映
- `docs-src/versions/v{バージョン}/` 存在確認
- `node docs-src/build.js` 成功確認
- `docs-src/` と `ai-team-manual/`（ルート `index.html` を含む）を同一コミット

### フロントエンド feature.md
- WCAG 2.1 AA 準拠
- レスポンシブ（モバイル・タブレット・デスクトップ）
- Core Web Vitals 基準（LCP 2.5s / INP 200ms / CLS 0.1）
- PR にスクリーンショット添付

### フロントエンド component.md
- 単一責務原則
- Props インターフェース定義
- 再利用性
- Storybook 等のドキュメント

### インフラ infrastructure-change.md
- 公式ドキュメント参照元の明記
- IaC（Terraform 等）の更新
- ステージング環境での検証
- ロールバック手順の明記

### インフラ network-change.md
- ネットワーク影響分析
- 疎通確認
- 最小公開原則

### インフラ security-review.md
- 5 カテゴリ（認証・暗号化・ネットワーク・シークレット・ログ）のレビュー
- 重大度別の発見事項整理
- 次回レビュー推奨時期

### コンテンツ article.md
- Editor-in-Chief 方針コメント
- Researcher 要否判断とレポート
- Compliance 合格
- 分野別カスタムチェック（health-pharma 等）

### 共通 incident.md
- 初動対応（暫定対応完了）
- 根本原因特定
- 恒久対応とリグレッションテスト
- インシデントファイル作成（`.claude/incidents/YYYYMMDD-<概要>.md`）
- `incidents/index.yml` への追記
- ポストモーテム

---

## DOD のカスタマイズ

プロジェクト固有のチェック項目を追加できます。

### 既存テンプレートの編集

`.claude/teams/<team_id>/dod/<template>.md` を直接編集します。チェックリスト項目を追加・削除・変更できます。

### 新規テンプレートの追加

新しい用途用のテンプレートを追加する場合：

1. `.claude/teams/<team_id>/dod/<新テンプレート>.md` を作成
2. `.claude/dod/README.md` のテンプレート一覧表に追記
3. 該当チームのリーダーエージェント定義（`agents/<lead>.md`）にも適用条件を追記

### 共通テンプレートの追加

複数チームで共通利用するテンプレートは `.claude/dod/` に配置し、`.claude/dod/README.md` の「共通（チーム横断）」セクションに追記します。

---

## Contributor による DOD チェックの流れ

```
1. Contributor 起動（contributor:ready ラベル付与時）
2. チケットの本文・タスクタイプから該当 DOD を特定
3. .claude/teams/<team_id>/dod/<template>.md を読み込む
4. 全項目について チケットコメント履歴で充足を確認
5. 未充足 → 該当エージェントに差し戻し
   全項目充足 → ステップ 3（PR・マージ確認）へ
6. PR が必要な場合は人間にエスカレーション
7. ✅ Contributor 確認完了 コメント投稿 → チケットクローズ
8. インシデント候補があれば .claude/incidents/ に記録
```

詳細は `.claude/agents/contributor.md` の動作フローを参照してください。

---

## 関連ドキュメント

- [チーム概要](../teams/overview.html) — チーム別の DOD 一覧
- [エスカレーションルール](escalation.html) — Contributor によるエスカレーション条件
- [設定ファイル](config.html) — escalation-rules.yml の運用
