# 設定ファイル

`@trimix/ai-team` で使用する 4 つの主要設定ファイルの仕様です。

| ファイル | 用途 |
|---------|------|
| `.claude/ai-team-config.yml` | 運用モード（multi-user / solo）と solo 設定 |
| `.claude/escalation-rules.yml` | エスカレーション条件の定義 |
| `docs-src/config.json` | ドキュメントサイトのナビゲーションとバージョン情報 |
| `.claude/teams/<team_id>/review-config.yml` | レビュー方式の自動判断基準（backend / frontend のみ） |

---

## `.claude/ai-team-config.yml`

`/ai-team-setup` で生成されます。運用モードに応じて構造が変わります。

### 全フィールド

```yaml
# 運用モード（必須）
mode: multi-user  # または solo

# solo モードの設定（mode: solo の場合のみ有効）
solo:
  poll_interval_minutes: 5      # Issue 監視の間隔（分）
  target_labels:                # 処理対象ラベル（OR 条件）
    - dispatcher
    - backend:tech-lead
    - frontend:frontend-lead
    - content:editor-in-chief
    - infra:infra-lead
  skip_labels:                  # スキップ条件（いずれか付いていればスキップ）
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

### フィールド詳細

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `mode` | string | ○ | `multi-user` または `solo` |
| `solo.poll_interval_minutes` | integer | △ | `mode: solo` の場合に必須。監視間隔（分） |
| `solo.target_labels` | array | △ | `mode: solo` の場合に必須。処理対象とするラベル（OR 条件） |
| `solo.skip_labels` | array | △ | `mode: solo` の場合に必須。スキップ条件 |

### 運用モードの違い

| 観点 | multi-user | solo |
|------|-----------|------|
| 起動方法 | 担当者が `/ai-team-run` 実行 | `/ai-team-watch` で監視ループ |
| 新規 Issue の検出 | 手動 | ポーリングで自動 |
| 二重実行防止 | 担当者の運用に依存 | `ai-team:in-progress` ラベル |
| solo セクション | 不要 | 必須 |

---

## `.claude/escalation-rules.yml`

エスカレーション条件と透明性ルールを定義します。

### 全フィールド

```yaml
escalation_triggers:
  - type: legal
    description: 法的判断、契約、コンプライアンスに関わる内容

  - type: budget
    description: 予算承認、費用の発生を伴う判断

  - type: merge_approval
    description: プルリクエストの承認とマージは常に人間が行う

  - type: ambiguous_spec
    description: |
      以下を全て検索して記述が見つからず、どちらを採用しても優劣がつかない場合:
        - .claude/rules/ 配下の .md ファイル
        - CLAUDE.md
        - docs/ 配下の仕様書

transparency_rules:
  - 全ての判断には根拠を記録する
  - 参照したファイル・仕様書・ルールを明示する
  - 懸念点は「未解決」として明示する
  - 判断できなかった場合は理由を記録してエスカレーション
```

### フィールド詳細

| フィールド | 型 | 説明 |
|-----------|---|------|
| `escalation_triggers` | array | エスカレーション条件のリスト |
| `escalation_triggers[].type` | string | 識別子。`legal` / `budget` / `merge_approval` / `ambiguous_spec` |
| `escalation_triggers[].description` | string | この条件の説明 |
| `transparency_rules` | array | エージェントが守るべき透明性ルール |

### `type` の値と用途

| type | 用途 | 典型例 |
|------|------|--------|
| `legal` | 法的判断・契約・コンプライアンス | 著作権・利用規約・個人情報 |
| `budget` | 費用発生・予算承認 | 有料サービス契約・サーバー増強 |
| `merge_approval` | PR 承認・マージ | 全てのコードマージ |
| `ambiguous_spec` | 仕様書に記述がなく判断不能 | 設計方針が複数あり優劣がつかない場合 |

詳細は [エスカレーションルール](escalation.html) を参照してください。

---

## `docs-src/config.json`

ドキュメントサイトのナビゲーション・バージョン情報を定義します。`docs-src/build.js` がこれを読み込んで HTML を生成します。

### 全フィールド

```json
{
  "title": "@trimix/ai-team ドキュメント",
  "versions": ["v0.5.1"],
  "latest": "v0.5.1",
  "nav": {
    "v0.5.1": [
      {
        "title": "はじめに",
        "items": [
          { "title": "概要", "file": "index" },
          { "title": "クイックスタート", "file": "getting-started" }
        ]
      }
    ]
  }
}
```

### フィールド詳細

| フィールド | 型 | 説明 |
|-----------|---|------|
| `title` | string | サイト全体のタイトル（HTML `<title>` とサイドバーロゴに使用） |
| `versions` | string[] | サイトに含めるバージョンのリスト |
| `latest` | string | 最新バージョン（`/` アクセスがこのバージョンにリダイレクトされる） |
| `nav` | object | バージョンごとのナビゲーション定義 |
| `nav.<version>` | array | セクションのリスト |
| `nav.<version>[].title` | string | サイドバーに表示するセクション名 |
| `nav.<version>[].items` | array | セクション内のページリスト |
| `nav.<version>[].items[].title` | string | リンクテキスト |
| `nav.<version>[].items[].file` | string | `versions/<version>/<file>.md` への参照（拡張子なし） |

### バージョン追加時の更新

新バージョン（例: v0.5.2）リリース時：

```json
{
  "versions": ["v0.5.0", "v0.5.1", "v0.5.2"],
  "latest": "v0.5.2",
  "nav": {
    "v0.5.1": [...],
    "v0.5.2": [...]
  }
}
```

詳細は [Tech-Writer](../agents/tech-writer.html) を参照してください。

---

## `.claude/teams/backend/review-config.yml`

バックエンドチームのレビュー方式（シングル / ダブル）の自動判定基準です。

### 全フィールド

```yaml
review:
  mode: auto  # AI が以下の基準に従って自動判断します

  # ダブルレビュー基準（いずれか 1 つでも該当）
  double_review_criteria:
    file_count_threshold: 5
    sensitive_areas:
      - 認証・認可（auth / login / session / token / JWT）
      - 決済・課金（payment / billing / stripe / invoice）
      - 個人情報・機密データ（user / password / email / PII）
      - データベーススキーマ・マイグレーション（migration / schema）
      - 公開API（破壊的変更・エンドポイントの追加・削除）
      - セキュリティ設定（cors / csrf / rate-limit / firewall）
    cross_layer_changes: true
    labels:
      - "complexity:high"
      - "security-sensitive"
      - "breaking-change"

  # シングルレビュー基準
  single_review_criteria:
    - 単一ファイルの変更
    - ドキュメント・コメントのみの変更
    - テストの追加（実装ロジックの変更なし）
    - 設定値・定数の変更（アルゴリズムの変更なし）
    - スタイル・フォーマットの修正

# レビュー完了後のフロー
post_review:
  create_pr: true
  pr_agent: pr-creator
```

### フィールド詳細

| フィールド | 型 | 説明 |
|-----------|---|------|
| `review.mode` | string | 判定方式。現在は `auto` のみサポート |
| `review.double_review_criteria.file_count_threshold` | integer | この値以上のファイル変更でダブルレビュー |
| `review.double_review_criteria.sensitive_areas` | array | これらの領域を含む変更でダブルレビュー |
| `review.double_review_criteria.cross_layer_changes` | boolean | 複数レイヤーをまたぐ変更でダブルレビュー |
| `review.double_review_criteria.labels` | array | これらのラベルが付与されている場合にダブルレビュー |
| `review.single_review_criteria` | array | シングルレビューとなる典型ケース（参考情報） |
| `post_review.create_pr` | boolean | レビュー後に PR を作成するか |
| `post_review.pr_agent` | string | PR 作成を担当するエージェント名 |

---

## `.claude/teams/frontend/review-config.yml`

フロントエンドチームのレビュー方式判定基準。`sensitive_areas` の内容がフロントエンド向けになっている以外、構造はバックエンドと同じです。

### `sensitive_areas`

| 領域 | キーワード |
|------|----------|
| 認証 UI | login / auth / session |
| 決済 UI | payment / checkout / billing |
| 個人情報フォーム | user / profile / password |
| デザインシステム破壊的変更 | 共通コンポーネント・スタイル変数・テーマの変更 |
| 公開 API インターフェース変更 | リクエスト・レスポンスの型変更・エンドポイント変更 |

`cross_layer_changes` フィールドはフロントエンド版にはありません。

---

## 関連ドキュメント

- [ワークフロー定義](workflow.html) — `workflow.yml` の仕様
- [エスカレーションルール](escalation.html) — `escalation-rules.yml` の運用
- [Tech-Writer](../agents/tech-writer.html) — `docs-src/config.json` の更新
