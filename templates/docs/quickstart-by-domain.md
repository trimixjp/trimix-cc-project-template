# 業務ドメイン別クイックスタートガイド

このガイドは、様々な業種・企業形態でこのテンプレートを初めて導入するチームが、自分たちのドメインに合わせてすばやくセットアップできるよう設計されています。

> **詳細な設計理論・なぜそのワークフローにするかについては [domain-workflow-guide.md](./domain-workflow-guide.md) を参照してください。** このガイドは「手を動かすためのHow-To」に特化しています。

---

## このガイドの使い方

1. 下の一覧から自分のドメインを選ぶ
2. 該当セクションのクイックスタート手順に従う
3. `workflow.yml` の調整ポイントを確認し、必要箇所だけ編集する
4. エスカレーションルールを設定する

複数ドメインの特徴を持つ場合（例: 「受託でECを開発している」）は [複数ドメインの組み合わせ](#複数ドメインの組み合わせ) を参照してください。

---

## 対応ドメイン一覧

| # | ドメイン | 主な特徴 | 使用チーム |
|---|---------|---------|----------|
| 1 | [B2B SaaS スタートアップ](#1-b2b-saas-スタートアップ) | セキュリティ・SLA重視 | backend / infra 中心 |
| 2 | [ECサイト / コマース](#2-ecサイト--コマース) | 決済・個人情報処理 | backend + frontend |
| 3 | [コンテンツメディア / ブログ](#3-コンテンツメディア--ブログ) | 大量コンテンツ生産 | content 中心 |
| 4 | [受託開発会社](#4-受託開発会社) | クライアント承認フロー | backend + frontend |
| 5 | [社内ツール開発チーム](#5-社内ツール開発チーム) | 少人数・スピード重視 | backend / frontend 軽量 |

---

## 1. B2B SaaS スタートアップ

### ドメインの特徴

- 認証・認可・マルチテナント設計が中心的な技術課題
- セキュリティインシデントがビジネス継続性に直結する
- SLA（稼働率保証）の遵守が求められ、インフラ変更に慎重な管理が必要
- 外部APIとの連携が多く、破壊的変更の影響範囲が広い

### 推奨チーム構成

```
backend チーム:  中心（API・認証・マルチテナント）
infra チーム:    重要（高可用性・セキュリティ設定）
frontend チーム: 補助（管理画面・ダッシュボード）
```

### クイックスタート手順

```bash
# 1. セットアップ（まだの場合）
/ai-team-setup
# → チーム選択: backend, infra, frontend を有効化

# 2. GitHub Labels の確認
gh label list
# → backend:tech-lead, infra:infra-lead 等が存在するか確認

# 3. 最初のタスクを作成
gh issue create \
  --title "[Backend] 認証システムの実装" \
  --label "backend:tech-lead" \
  --body "JWTベースの認証APIを実装する..."

# 4. ワークフローを起動
/ai-team-run <チケット番号>
```

### workflow.yml 調整ポイント

**`.claude/teams/backend/workflow.yml`** — ダブルレビュー基準を厳格化する

```yaml
- id: tech-lead-review-decision
  on_complete:
    conditions:
      - id: double-review
        description: B2B SaaSでは以下の変更にダブルレビューを適用
        criteria:
          - 変更ファイル数が3以上（デフォルトの5から引き下げ）
          - 認証・認可・マルチテナント処理に関わる変更
          - 外部API連携の変更
          - SLA影響のある処理の変更
        next: [reviewer-a, reviewer-b]

      - id: single-review
        description: 上記に非該当の軽微な変更
        next: reviewer
```

**`.claude/teams/infra/workflow.yml`** — インフラ変更に人間の最終承認を追加する

```yaml
- id: security-engineer
  on_complete:
    condition: 合格
    next: change-approval   # 追加ステップ

- id: change-approval
  agent: human-escalator
  label: "escalated:human"
  description: |
    インフラ変更の最終承認（変更管理プロセス）。
    SLAに影響する変更は必ず人間が承認してから適用する。
  on_complete:
    condition: 人間が承認
    next: contributor-close
```

### エスカレーションルール設定例

**`.claude/escalation-rules.yml`** に以下を追記する

```yaml
escalation_triggers:
  - keyword: "SLA"
    reason: "SLA影響の変更は変更管理プロセスを経ること"
    action: change_approval

  - keyword: "マルチテナント"
    reason: "テナント分離に影響する変更は必ずダブルレビュー"
    action: double_review

  - keyword: "外部API"
    reason: "外部システム連携の破壊的変更は事前通知が必要"
    action: human_review
```

### よくある落とし穴

- **認証系ファイルへの変更を過小評価しない**: `auth/` `session/` `token/` を含むファイルの変更は必ずダブルレビューを適用する
- **インフラ変更のロールバック計画**: インフラ変更前に必ずロールバック手順をチケットに記載しておく
- **テナント間のデータ漏洩**: マルチテナント処理の変更は「他テナントのデータが見えないか」の観点でレビューする

---

## 2. ECサイト / コマース

### ドメインの特徴

- 決済処理・個人情報（PII）の取り扱いが最重要
- 法規制（特商法・個人情報保護法・PCI DSS）への対応が必要
- 在庫管理・注文処理の一貫性（トランザクション）確保が技術的課題
- フロントエンドのUX（カート・チェックアウト）がコンバージョンに直結

### 推奨チーム構成

```
backend チーム:  中心（決済・在庫・注文管理API）
frontend チーム: 重要（商品ページ・カート・チェックアウト）
content チーム:  補助（商品説明・キャンペーン・特商法表記）
infra チーム:    補助（決済インフラ・セキュリティ設定）
```

### クイックスタート手順

```bash
# 1. セットアップ
/ai-team-setup
# → チーム選択: backend, frontend, content を有効化

# 2. ECコマース向けコンプライアンスルールを追加
mkdir -p .claude/teams/content/compliance-rules
# → ec-commerce.md, personal-information.md, payment.md を作成（後述のテンプレートを使用）

# 3. 特商法表記のチケットを作成
gh issue create \
  --title "[Content] 特商法ページの作成" \
  --label "content:editor-in-chief" \
  --body "特定商取引法に基づく表記ページを作成する..."

# 4. 決済APIのチケットを作成
gh issue create \
  --title "[Backend] 決済API実装" \
  --label "backend:tech-lead" \
  --body "Stripeを使った決済APIを実装する..."
```

### workflow.yml 調整ポイント

**`.claude/teams/backend/workflow.yml`** — 決済・個人情報変更にコンプライアンスゲートを追加する

```yaml
- id: reviewer
  on_complete:
    condition: 合格
    next: legal-compliance   # 追加ステップ

- id: legal-compliance
  agent: compliance
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

### コンプライアンスルールテンプレート

**`.claude/teams/content/compliance-rules/ec-commerce.md`** を作成する

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
- [ ] 実際に提供できない商品・サービスの宣伝をしていない

## 禁止表現
- [ ] 誇大広告（効果・性能を実証なく表示）がない
- [ ] 消費者を誤認させる比較広告がない
```

### エスカレーションルール設定例

```yaml
escalation_triggers:
  - keyword: "決済"
    reason: "決済処理の変更は法務確認が必要"
    action: legal_review

  - keyword: "個人情報"
    reason: "個人情報取り扱い変更はプライバシーポリシーの更新が必要"
    action: human_review

  - keyword: "PCI"
    reason: "PCI DSS関連の変更はセキュリティ専門家のレビューが必要"
    action: security_review
```

### よくある落とし穴

- **特商法表記の更新漏れ**: 事業者情報が変わったら必ずcontentチームにチケットを作成する
- **在庫処理のレースコンディション**: 在庫変更APIの変更は必ずトランザクションの整合性レビューを実施する
- **カート情報のセッション管理**: セッションや認証の変更がカート状態に影響しないか確認する

---

## 3. コンテンツメディア / ブログ

### ドメインの特徴

- 記事・動画・画像等のコンテンツ生産量が多い（月100本以上のケースも）
- 著作権・引用・ファクトチェックの管理が重要
- SEO対策・アクセシビリティへの対応が収益に直結
- 広告掲載・スポンサーコンテンツの表記義務がある

### 推奨チーム構成

```
content チーム:  中心（記事・動画スクリプト・SNS投稿）
frontend チーム: 重要（記事ページテンプレート・メディアプレーヤー）
backend チーム:  補助（CMS API・配信システム・全文検索）
```

### クイックスタート手順

```bash
# 1. セットアップ
/ai-team-setup
# → チーム選択: content, frontend を有効化（必要に応じて backend も）

# 2. コンテンツメディア向けコンプライアンスルールを追加
mkdir -p .claude/teams/content/compliance-rules
# → sponsored-content.md, copyright.md, fact-check.md を作成（後述のテンプレートを使用）

# 3. 記事作成のチケットを作成
gh issue create \
  --title "[Content] 〇〇に関する解説記事の作成" \
  --label "content:editor-in-chief" \
  --body "ターゲット: 初心者向け / 文字数: 3,000字程度 / SEOキーワード: ..."
```

### workflow.yml 調整ポイント

**`.claude/teams/content/workflow.yml`** — SEOアナリストステップを追加する（任意）

```yaml
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
        next: writer   # SEOブリーフをEditor-in-Chiefが直接Writerへ指示する場合

      - id: no-research-needed
        description: 内部情報・ガイドライン等の既知情報
        next: writer
```

### コンプライアンスルールテンプレート

**`.claude/teams/content/compliance-rules/sponsored-content.md`** を作成する

```markdown
# 広告・スポンサーコンテンツのコンプライアンスルール

## 必須表記
- [ ] 広告・PR・スポンサードの明示（記事の冒頭または目立つ位置に表示）
- [ ] アフィリエイトリンクの場合「#PR」「#広告」の記載

## 禁止事項
- [ ] スポンサーコンテンツを通常記事と誤認させる構成
- [ ] 読者に利益相反を開示せず推薦する表現
```

**`.claude/teams/content/compliance-rules/copyright.md`** を作成する

```markdown
# 著作権・引用ルール

## 引用の要件
- [ ] 引用箇所が明確に区別されている（blockquote等）
- [ ] 出典（著者名・タイトル・URL・取得日）が明記されている
- [ ] 引用の量が本文より少ない（「主従関係」の確認）

## 禁止事項
- [ ] 他者のコンテンツを許可なく全文転載している
- [ ] 画像・動画を権利確認なく使用している
- [ ] CCライセンスの条件を無視した使用
```

### 大量コンテンツ処理の設定

月100本以上の記事を処理する場合は `.claude/ai-team-config.yml` を調整する。

```yaml
mode: solo
solo:
  poll_interval_minutes: 2   # デフォルト5分 → 2分に短縮
  max_concurrent_issues: 3   # 同時処理チケット数（将来の機能拡張用）
```

### エスカレーションルール設定例

```yaml
escalation_triggers:
  - keyword: "スポンサー"
    reason: "広告・スポンサードコンテンツは表記義務の確認が必要"
    action: compliance_review

  - keyword: "著作権"
    reason: "著作権関連の判断は法務確認が必要"
    action: legal_review

  - keyword: "引用"
    reason: "引用範囲・出典の適切性を確認"
    action: compliance_review
```

### よくある落とし穴

- **大量記事での品質低下**: チケットを細分化しすぎず、1記事1チケットを基本にする
- **ファクトチェックの省略**: Researcherステップを「不要」と判断する前に、統計・数値の出典を必ず確認する
- **画像の著作権確認**: 本文は問題なくても画像に著作権問題が発生するケースが多い

---

## 4. 受託開発会社

### ドメインの特徴

- クライアントごとに要件・基準・承認フローが異なる
- 納品物の品質基準とコードレビューが厳密
- 変更管理・議事録・設計書等のドキュメント管理が重要
- クライアントへの進捗報告・承認取得が必要

### 推奨チーム構成

```
backend チーム:  中心（仕様に沿った実装）
frontend チーム: 重要（UIの仕様準拠）
content チーム:  補助（納品ドキュメント・マニュアル作成）
```

### クイックスタート手順

```bash
# 1. セットアップ
/ai-team-setup
# → チーム選択: backend, frontend, content を有効化

# 2. クライアント情報を設定
# .claude/ai-team-config.yml を編集して client セクションを追加（後述）

# 3. プロジェクト固有のラベルを追加
gh label create "client:review" --color "FBCA04" --description "クライアントレビュー待ち"
gh label create "client:approved" --color "0E8A16" --description "クライアント承認済み"

# 4. 実装チケットを作成
gh issue create \
  --title "[Backend] ユーザー管理API実装（仕様書v1.2準拠）" \
  --label "backend:tech-lead" \
  --body "参照仕様書: docs/spec/user-management-v1.2.pdf ..."
```

### workflow.yml 調整ポイント

**`.claude/teams/backend/workflow.yml`** — クライアントレビューステップを追加する

```yaml
- id: pr-creator
  on_complete:
    next: client-review   # 追加ステップ

- id: client-review
  agent: human-escalator
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

### クライアント設定ファイル

**`.claude/ai-team-config.yml`** に追記する

```yaml
client:
  name: "クライアント名"
  sla:
    bug_response_hours: 24
    critical_response_hours: 2
  review_required: true
  escalation_contact: "pm@yourcompany.com"
```

### ドキュメント管理の強化

**`.claude/teams/backend/dod/`** 配下のDODに以下を追記する

```markdown
## 納品物管理

- [ ] 変更管理票（変更ID・変更理由・影響範囲・承認者）が作成されている
- [ ] 顧客向け変更説明書が `docs/client-reports/` に保存されている
- [ ] 設計書（`docs/design/`）が最新の実装と整合している
```

### エスカレーションルール設定例

```yaml
escalation_triggers:
  - keyword: "仕様変更"
    reason: "仕様変更はクライアントの書面承認が必要"
    action: client_approval

  - keyword: "スコープ外"
    reason: "スコープ外の作業は追加見積もりが必要"
    action: pm_escalation

  - keyword: "納期"
    reason: "納期に影響する変更はPMへの即時報告が必要"
    action: pm_escalation
```

### よくある落とし穴

- **仕様書バージョンの取り違え**: チケットに参照する仕様書のバージョンとパスを必ず明記する
- **口頭指示の未記録**: クライアントからの口頭・チャット指示は必ずチケットに起こしてから作業する
- **納品前の動作確認省略**: PRマージ前にクライアント環境での動作確認ステップを設ける

---

## 5. 社内ツール開発チーム

### ドメインの特徴

- 少人数チーム（2〜5名程度）でスピード重視の開発
- 社内ユーザー向けのため外部公開のリスクは低い
- 厳密なSLAより「使えること」の優先度が高い
- リリースサイクルが短く、フィードバックを素早く反映する

### 推奨チーム構成

```
backend チーム:  中心（軽量な設定で運用）
frontend チーム: 補助（必要に応じて有効化）
```

> 少人数チームでは `infra` `content` チームを無効化し、`backend` チームに集中するのが推奨です。

### クイックスタート手順

```bash
# 1. セットアップ（軽量構成）
/ai-team-setup
# → チーム選択: backend のみ有効化（または backend + frontend）

# 2. ダブルレビュー基準を緩和する（後述）

# 3. 素早いイテレーション用のチケット作成
gh issue create \
  --title "[Backend] 勤怠入力フォームのバリデーション修正" \
  --label "backend:tech-lead" \
  --body "現状: 空文字でも送信できる / 修正: 必須項目チェックを追加"
```

### workflow.yml 調整ポイント

**`.claude/teams/backend/workflow.yml`** — ダブルレビューを省略してシングルレビューに固定する

```yaml
- id: tech-lead-review-decision
  on_complete:
    conditions:
      - id: single-review-always
        description: 社内ツールはシングルレビューで統一する
        criteria:
          - すべての変更（security-sensitive も含む）
        next: reviewer
```

**PRマージの自動化（任意）** — 社内ツールではレビュー後の自動マージも許容できる場合がある

```yaml
- id: reviewer
  on_complete:
    condition: 合格
    next: contributor-close   # human-merge-approval をスキップ
```

> **注意**: 自動マージを設定する場合、本番データへのアクセスがある機能は除外することを推奨します。

### ai-team-config.yml の軽量化設定

```yaml
mode: solo
solo:
  poll_interval_minutes: 5
  labels:
    skip_double_review: true      # ダブルレビューをデフォルトでスキップ
    auto_merge_approved_prs: true # レビュー合格後の自動マージを有効化
```

### エスカレーションルール設定例

```yaml
escalation_triggers:
  - keyword: "本番データ"
    reason: "本番データへのアクセスを伴う変更は担当者の確認が必要"
    action: human_review

  - keyword: "権限"
    reason: "権限設定の変更はセキュリティ確認が必要"
    action: security_review
```

### よくある落とし穴

- **「社内だから」でセキュリティを軽視しない**: 個人情報や機密情報を扱う機能は外部公開ツールと同様の基準で実装する
- **テストの省略**: スピード重視でもユニットテストの最低限のカバレッジは維持する
- **ドキュメント更新の後回し**: 「あとで書く」ドキュメントは永遠に書かれない。チケットのDODにドキュメント更新を含める

---

## 共通パターン集

どのドメインでも活用できる設定パターンをまとめます。

### パターンA: コンプライアンスゲート（ECサイト・コンテンツメディア向け）

法的リスクのある変更にコンプライアンスチェックを追加する。

```yaml
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

### パターンB: 人間承認ゲート（B2B SaaS・受託開発向け）

レビュー合格後に人間の追加承認を挟む。

```yaml
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

### パターンC: 段階的リリース（全ドメイン）

重要な変更を段階的にリリースする。

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

## 複数ドメインの組み合わせ

### 「受託でECを開発している」場合

**適用するパターン**:
- ECサイトのコンプライアンスルール（特商法・PCI DSS）
- 受託開発のクライアント承認フロー

**設定方針**:
1. `backend/workflow.yml` に「ECコンプライアンスゲート」→「クライアントレビュー」の順でステップを追加する
2. `content/compliance-rules/` に EC 向けルールファイルを追加する
3. クライアント設定（`ai-team-config.yml`）を追記する

### 「B2B SaaSのコンテンツマーケティングもやっている」場合

**適用するパターン**:
- B2B SaaSのセキュリティ強化（backendチーム）
- コンテンツメディアのコンプライアンスルール（contentチーム）

**設定方針**:
1. `backend/workflow.yml` はB2B SaaS設定を適用する
2. `content/compliance-rules/` に広告・著作権ルールを追加する
3. 両チームが別々のチケットを処理するため、ラベル命名規則が衝突しないように注意する

### 「社内ツールだが個人情報も扱う」場合

**適用するパターン**:
- 社内ツールの軽量設定（ベース）
- 個人情報に関わる変更にだけコンプライアンスゲートを追加する

**設定方針**:
1. デフォルトはシングルレビューで運用する
2. `privacy` `個人情報` `PII` キーワードをエスカレーショントリガーに設定する
3. 個人情報関連チケットには `security-sensitive` ラベルを手動付与するルールを設ける

---

## 定期見直しのタイミング

ワークフローは導入後も定期的に見直すことを推奨します。

| タイミング | 見直し内容 |
|-----------|-----------|
| 月次 | インシデント発生傾向・エスカレーション頻度の確認 |
| 四半期 | ラベル命名規則・エージェント役割の整合性確認 |
| 大きな機能追加時 | ワークフローのステップ漏れ・DODの更新 |
| 法改正・業界動向変化時 | コンプライアンスルールの更新 |

---

## 参照ドキュメント

- **設計理論・ワークフロー設計の背景**: [domain-workflow-guide.md](./domain-workflow-guide.md)
- **ワークフロー定義の構文**: [workflow-guide.md](./workflow-guide.md)
- **エージェント定義の書き方**: [agent-writing-guide.md](./agent-writing-guide.md)
- **エスカレーションルール**: `.claude/escalation-rules.yml`
- **DODテンプレート**: `.claude/dod/README.md`
