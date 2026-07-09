# 業務ドメイン別ワークフローバリエーション設計ガイド

このドキュメントは、様々な業種・企業形態でこのテンプレートを活用する際の
ワークフロー調整ポイントをまとめたものです。

---

## 概要

`workflow.yml` はデフォルト設定のままでも動作しますが、業務ドメインによっては
レビュー基準・チーム構成・承認フローのカスタマイズが推奨されます。

以下の4つのドメインについて設計例と調整ポイントを説明します。

| ドメイン | 特徴 | 主な調整点 |
|---------|------|----------|
| B2B SaaS | セキュリティ・SLA重視 | ダブルレビュー頻度増・インフラ強化 |
| ECサイト | 決済・個人情報処理 | コンプライアンス強化・compliance ステップ追加 |
| コンテンツメディア | コンテンツ量が多い | content チーム中心・compliance ルール多数 |
| 受託開発 | 納品物管理・クライアント承認 | PR承認フローにクライアントレビューを追加 |

---

## ドメイン1: B2B SaaS

### 特徴

- 認証・認可・マルチテナント設計が中心的な技術課題
- セキュリティインシデントがビジネス継続性に直結する
- SLA（稼働率）の遵守が求められるためインフラ変更の慎重な管理が必要
- APIは外部システムと連携するため破壊的変更が影響大

### 推奨するチーム構成

```
backend チーム: 中心（API・認証・マルチテナント）
infra チーム: 重要（高可用性構成・セキュリティ設定）
frontend チーム: 補助（管理画面・ダッシュボード）
```

### workflow.yml の調整ポイント

#### backend/workflow.yml

```yaml
# ダブルレビュー基準を厳格化する例
- id: tech-lead-review-decision
  on_complete:
    conditions:
      - id: double-review
        description: B2B SaaSでは以下の基準でダブルレビューを適用
        criteria:
          - 変更ファイル数が3以上（通常の5から引き下げ）
          - 認証・認可・マルチテナント処理に関わる変更
          - 外部API（顧客システムとの連携）の変更
          - SLA影響のある処理（バッチ・ジョブ・キュー）の変更
          - "complexity:high / security-sensitive / breaking-change ラベルあり"
        next: [reviewer-a, reviewer-b]

      - id: single-review
        description: 上記に非該当の軽微な変更
        next: reviewer
```

#### review-config.yml の追加設定

```yaml
# B2B SaaS向けに sensitive_areas を追加
double_review_criteria:
  file_count_threshold: 3  # 5 → 3 に引き下げ
  sensitive_areas:
    - 認証・認可（auth / login / session / token / JWT）
    - マルチテナント処理（tenant / organization / workspace）
    - 外部API連携（webhook / integration / oauth）
    - SLA関連処理（queue / batch / scheduler / cron）
    - 決済・課金（payment / billing / stripe / invoice）
    - 個人情報・機密データ（user / password / email / PII）
    - データベーススキーマ・マイグレーション
    - 公開API（破壊的変更・エンドポイントの追加・削除）
    - セキュリティ設定（cors / csrf / rate-limit / firewall）
```

#### infra/workflow.yml

```yaml
# セキュリティエンジニアの後に変更管理承認ステップを追加する例
- id: security-engineer
  on_complete:
    condition: 合格
    next: change-approval  # 追加ステップ

- id: change-approval
  agent: human-escalator  # 人間が変更管理を承認
  label: "escalated:human"
  description: |
    インフラ変更の最終承認（変更管理プロセス）。
    SLAに影響する変更は必ず人間が承認してから適用する。
  on_complete:
    condition: 人間が承認
    next: contributor-close
```

### インシデント管理の強化

B2B SaaSでは本番障害時のインシデント管理が重要です。

```
.claude/incidents/ への記録ルール（推奨）:
- P1（サービス停止・データ消失）: 必ずインシデントレポート作成
- P2（主要機能の障害）: 原則としてインシデントレポート作成
- P3（軽微な不具合）: Contributorが判断して記録
```

---

## ドメイン2: ECサイト

### 特徴

- 決済処理・個人情報（PII）の取り扱いが最重要
- 法規制（特商法・個人情報保護法・PCI DSS）への対応が必要
- 在庫管理・注文処理の一貫性確保が技術的課題
- フロントエンドのUX（カート・チェックアウト）がコンバージョンに直結

### 推奨するチーム構成

```
backend チーム: 中心（決済・在庫・注文管理API）
frontend チーム: 重要（商品ページ・カート・チェックアウト）
content チーム: 補助（商品説明・キャンペーン・特商法表記）
infra チーム: 補助（決済インフラ・セキュリティ設定）
```

### workflow.yml の調整ポイント

#### backend/workflow.yml にコンプライアンスステップを追加

```yaml
# reviewerとversion-bumperの間にcomplianceステップを挿入する例
- id: reviewer
  on_complete:
    condition: 合格
    next: legal-compliance  # 追加ステップ（決済・個人情報関連変更のみ適用）

- id: legal-compliance
  agent: compliance-checker  # 別途エージェント定義が必要
  label: "backend:compliance"
  description: |
    決済・個人情報処理に関わる変更のコンプライアンスチェック。
    PCI DSS・個人情報保護法・特商法への適合を確認する。
    変更が決済・個人情報に関わらない場合はスキップして version-bumper へ。
  on_complete:
    condition: 合格
    next: version-bumper
  on_rework:
    condition: 不合格
    next: implementer
  on_escalation:
    condition: 法的判断が必要
    next: human-escalator
```

#### content/workflow.yml のコンプライアンスルール追加

EC特有のコンプライアンスルールファイルを追加します。

```
.claude/teams/content/compliance-rules/
  ├── ec-commerce.md          # 特商法・景品表示法
  ├── personal-information.md # 個人情報取り扱い表記
  └── payment.md              # 決済関連の表記ルール
```

`ec-commerce.md` の例:

```markdown
# ECサイト コンプライアンスチェックルール

## 特定商取引法（特商法）
- [ ] 販売事業者名・住所・電話番号が明記されている
- [ ] 販売価格（消費税を含む総額）が明示されている
- [ ] 送料・手数料が明示されている
- [ ] 支払方法・支払時期が明示されている
- [ ] 返品・キャンセルポリシーが明記されている

## 景品表示法
- [ ] 「最安値」「業界No.1」等の優良誤認表示がない
- [ ] セール・割引表示の根拠が正確である
- [ ] 在庫がないのに「在庫あり」と表示していない

## 禁止表現
- [ ] 誇大広告（効果・性能を実証なく表示）がない
- [ ] 消費者を誤認させる比較広告がない
```

---

## ドメイン3: コンテンツメディア

### 特徴

- 記事・動画・画像等のコンテンツ生産量が多い
- 著作権・引用・ファクトチェックの管理が重要
- SEO対策・アクセシビリティへの対応が必要
- 広告掲載・スポンサーコンテンツの表記義務がある

### 推奨するチーム構成

```
content チーム: 中心（記事・動画スクリプト・SNS投稿）
frontend チーム: 重要（記事ページテンプレート・メディアプレーヤー）
backend チーム: 補助（CMS API・配信システム・検索）
```

### workflow.yml の調整ポイント

#### content/workflow.yml の拡張

```yaml
# Editor-in-Chief の方針決定を細分化する例
- id: editor-in-chief-planning
  on_complete:
    conditions:
      - id: needs-research
        description: 統計・専門知識が必要なコンテンツ
        next: researcher

      - id: needs-seo-brief
        description: SEO対策が重要なキーワード記事
        criteria:
          - キーワード狙いの記事である
          - 検索流入を目的としたコンテンツ
        next: seo-analyst  # 追加エージェント（別途定義）

      - id: no-research-needed
        description: 内部情報・ガイドライン等の既知情報
        next: writer
```

#### compliance-rules の充実

```
.claude/teams/content/compliance-rules/
  ├── health-pharma.md         # 健康・医薬品（既存）
  ├── financial.md             # 金融・投資情報
  ├── legal-info.md            # 法律情報の免責事項
  ├── sponsored-content.md     # 広告・スポンサーコンテンツの表記
  ├── copyright.md             # 著作権・引用ルール
  └── fact-check.md            # ファクトチェック基準
```

`sponsored-content.md` の例:

```markdown
# 広告・スポンサーコンテンツのコンプライアンスルール

## 必須表記
- [ ] 広告・PR・スポンサードの明示（記事の冒頭または目立つ位置に表示）
- [ ] アフィリエイトリンクの場合「#PR」「#広告」の記載

## 禁止事項
- [ ] スポンサーコンテンツを通常記事と誤認させる構成
- [ ] 読者に利益相反を開示せず推薦する表現
```

### 大量コンテンツ処理のためのバッチ対応

月に100本以上の記事を処理する場合は、複数のチケットを並列で処理できるよう
`ai-team-config.yml` の設定を調整します。

```yaml
# 複数エージェントの同時実行を許可する設定例（ai-team-config.yml）
mode: solo
solo:
  poll_interval_minutes: 2  # より頻繁に監視
  max_concurrent_issues: 3  # 同時処理チケット数（将来の機能拡張用）
```

---

## ドメイン4: 受託開発

### 特徴

- クライアントごとに要件・基準・承認フローが異なる
- 納品物の品質基準とコードレビューが厳密
- 変更管理・議事録・設計書等のドキュメント管理が重要
- クライアントへの進捗報告・承認取得が必要

### 推奨するチーム構成

```
backend チーム: 中心（仕様に沿った実装）
frontend チーム: 重要（UIの仕様準拠）
content チーム: 補助（納品ドキュメント・マニュアル作成）
```

### workflow.yml の調整ポイント

#### クライアントレビューステップの追加

```yaml
# backend/workflow.yml に human-merge-approval の前にクライアントレビューを追加
- id: pr-creator
  on_complete:
    next: client-review  # 追加ステップ

- id: client-review
  agent: human-escalator  # クライアントが人間のため human-escalator を流用
  label: "escalated:human"
  description: |
    クライアントへのPRレビュー依頼。
    クライアントが確認・承認してからマージする。
    承認後は human-merge-approval へ進む。
  on_complete:
    condition: クライアントが承認
    next: human-merge-approval
  on_rework:
    condition: クライアントが修正依頼
    next: implementer
```

#### ドキュメント管理の強化

受託開発では設計書・変更履歴の納品が求められる場合があります。

```yaml
# tech-writer の DOD を拡張する例（teams/backend/dod/documentation.md に追記）
# 追加チェック項目:
# - [ ] 変更管理票（変更ID・変更理由・影響範囲・承認者）が作成されている
# - [ ] 顧客向け変更説明書が `docs/client-reports/` に保存されている
# - [ ] 設計書（`docs/design/`）が最新の実装と整合している
```

#### プロジェクト固有のインシデント基準

```yaml
# .claude/ai-team-config.yml に追加する例
client:
  name: "クライアント株式会社"
  sla:
    bug_response_hours: 24
    critical_response_hours: 2
  escalation_contact: "pm@yourcompany.com"
```

---

## ドメイン横断の共通パターン

### パターンA: コンプライアンス強化（ECサイト・コンテンツメディア向け）

```yaml
# 全ワークフローにコンプライアンスゲートを追加
- id: compliance-gate
  agent: compliance
  label: "<チーム名>:compliance"
  description: |
    法的・業界規制チェックを実施する。
    compliance-rules/ 配下のドメイン別ルールを適用する。
  on_complete:
    condition: 合格
    next: <次のステップ>
  on_rework:
    condition: 不合格
    next: <修正担当のステップ>
  on_escalation:
    condition: 法的判断が必要
    next: human-escalator
```

### パターンB: 承認フロー強化（B2B SaaS・受託開発向け）

```yaml
# レビュー合格後に人間の追加承認を挟む
- id: change-approval
  agent: human-escalator
  label: "escalated:human"
  description: |
    変更管理承認。リリース前に責任者が最終確認する。
  on_complete:
    condition: 承認完了
    next: <次のステップ>
  on_rework:
    condition: 差し戻し
    next: implementer
```

### パターンC: 段階的リリース管理（全ドメイン）

重要な変更を段階的にリリースする場合のステップ例:

```yaml
- id: staged-release
  agent: human-escalator
  label: "escalated:human"
  description: |
    段階的リリース（カナリアリリース等）の承認・監視。
    一定時間の監視後に全量リリースへ移行する。
  on_complete:
    condition: 段階的リリース完了・問題なし
    next: contributor-close
  on_escalation:
    condition: 問題発生・ロールバックが必要
    next: human-escalator
```

---

## ワークフローのカスタマイズ手順

1. **ドメインを選択する**
   - 上記4ドメインから最も近いものを選ぶ
   - 複数ドメインの特徴を持つ場合は組み合わせる

2. **調整ポイントを確認する**
   - 各ドメインのセクションから変更箇所を特定する

3. **workflow.yml を編集する**
   - 既存ステップの修正または新規ステップの追加
   - `workflow-guide.md` の構文に従うこと

4. **エージェント定義を作成する**（新規ステップを追加した場合）
   - `teams/<チーム名>/agents/<エージェント名>.md` を作成する

5. **DODを更新する**
   - `teams/<チーム名>/dod/` 配下のチェックリストに項目を追加する

6. **compliance-rules を追加する**（コンプライアンスステップを追加した場合）
   - `teams/<チーム名>/compliance-rules/<ルール名>.md` を作成する

---

## 定期見直しの推奨事項

ワークフローは以下のタイミングで見直すことを推奨します。

| タイミング | 見直し内容 |
|-----------|-----------|
| 月次 | インシデント発生傾向・エスカレーション頻度の確認 |
| 四半期 | ラベル命名規則・エージェント役割の整合性確認 |
| 大きな機能追加時 | ワークフローのステップ漏れ・DODの更新 |
| 法改正・業界動向 | コンプライアンスルールの更新 |

定期見直しチケットテンプレートは `.github/ISSUE_TEMPLATE/workflow-review.yml` を参照してください。
