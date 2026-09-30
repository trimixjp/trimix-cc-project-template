# 設定ファイル

`@trimix/ai-team` で使用する 4 つの主要設定ファイルの仕様です。

| ファイル | 用途 |
|---------|------|
| `.claude/ai-team-config.yml` | 運用モード・バージョン管理・**runtime**・model/effort プロファイル・チケット方式 |
| `.claude/escalation-rules.yml` | エスカレーション条件の定義 |
| `.claude/model-profiles.yml` | モデル・effort・runtime マップの説明（人間可読。実装 SSOT は `bin/lib/model-profiles.js`） |
| `docs-src/config.json` | ドキュメントサイトのナビゲーションとバージョン情報 |
| `.claude/teams/<team_id>/review-config.yml` | レビュー方式の自動判断基準（backend / frontend のみ） |

---

## `.claude/ai-team-config.yml`

`/ai-team-setup` で生成されます。運用モードに応じて構造が変わります。

### 全フィールド

```yaml
# 運用モード（必須）
mode: multi-user  # または solo

# バージョン管理（auto / manual / none）
version_management: auto

# 作業空間の方式（setup 質問4c で選択。チケットの workspace:* ラベルで個別に上書き可能）
# branch:   基準ブランチから feature branch を切って、リポジトリ本体で作業する（既定）
# worktree: git worktree で作業ディレクトリを分離する（並列作業・作業汚染の回避に有効）
workspace:
  strategy: branch          # または worktree
  worktree_dir: .claude/worktrees

# 実行基盤（setup で選択。再 setup で切替可）
# claude-code | grok
runtime: claude-code

# モデル性能プロファイル（setup で選択）
# high-performance | balance | low-cost
# 実際の model 割当は runtime ごとに異なる（下記参照）
model_performance: balance

# effort 深度（setup で選択）
# deep | normal | light
# Claude: deep=xhigh / normal=high / light=medium
# Grok:   deep=high  / normal=high / light=medium
effort_depth: normal

# チケット管理（github | local）
ticket_backend: github
local_tickets:
  dir: tickets
  id_prefix: ""

# solo モードの設定（mode: solo の場合のみ有効）
solo:
  poll_interval_minutes: 5      # チケット監視の間隔（分）
  target_labels:                # 処理対象ラベル（OR 条件）
    - dispatcher
    - backend:tech-lead
    - frontend:designer
    - content:editor-in-chief
    - infra:infra-lead
  skip_labels:                  # スキップ条件（いずれか付いていればスキップ）
    - ai-team:in-progress
    - escalated:human
    - contributor:ready

# サブエージェント無音停止検知の設定（v0.26.0 新規。キー不在時は既定値で動作）
delegation_watchdog:
  stall_threshold_minutes: 10   # heartbeat 無更新期間の閾値（分）。既定値: 10
  max_redelegations: 2          # 再委託の上限回数。既定値: 2
```

### フィールド詳細

| フィールド | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `mode` | string | ○ | `multi-user` または `solo` |
| `version_management` | string | ○ | `auto` / `manual` / `none` |
| `workspace.strategy` | string | △ | `branch`（既定）または `worktree`。Implementer の作業空間の方式。未指定時は `branch` 扱い（後方互換）。チケットの `workspace:branch` / `workspace:worktree` ラベルが優先される |
| `workspace.worktree_dir` | string | △ | `strategy: worktree` の場合の worktree 配置先（既定 `.claude/worktrees`）。Implementer は `<worktree_dir>/issue-<番号>` に作業ディレクトリを作成する |
| `runtime` | string | ○ | `claude-code`（既定）または `grok`。model/effort エイリアスとミラー先を決める |
| `model_performance` | string | ○ | `high-performance` / `balance` / `low-cost`。役割別 model の元 |
| `effort_depth` | string | ○ | `deep` / `normal` / `light`。effort 一括設定の元 |
| `ticket_backend` | string | ○ | `github` または `local` |
| `local_tickets.dir` | string | △ | local 時のチケットディレクトリ（既定 `tickets`） |
| `solo.poll_interval_minutes` | integer | △ | `mode: solo` の場合に必須。監視間隔（分） |
| `solo.target_labels` | array | △ | `mode: solo` の場合に必須。処理対象とするラベル（OR 条件） |
| `solo.skip_labels` | array | △ | `mode: solo` の場合に必須。スキップ条件 |
| `delegation_watchdog.stall_threshold_minutes` | integer | △ | heartbeat ファイル無更新期間の閾値（分）。既定値: 10。Opus/Sonnet で委託したサブエージェント無音停止検知に使用 |
| `delegation_watchdog.max_redelegations` | integer | △ | サブエージェント再委託の上限回数。既定値: 2。上限超過時は `escalated:human` へエスカレーション |

### モデル・effort の反映とカスタマイズ

`runtime` / `model_performance` / `effort_depth` は setup 時に各エージェント・スキル md の frontmatter（`model` / `effort`）へ書き込まれます。

**一括再適用（runtime 切替を含む）:**

```bash
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime <claude-code|grok> \
  --profile <balance|high-performance|low-cost> \
  --effort <normal|deep|light> \
  --dir .claude
```

`runtime=grok` のときは `.grok/agents` と `.grok/commands` へのミラーも行われます。

**細かい設定は各 md の `model` / `effort` を直接編集してください。** 再 apply すると上書きされます。  
役割表・エイリアス一覧は [エージェントのカスタマイズ](../guide/agents.md) と `.claude/model-profiles.yml` を参照。
### 運用モードの違い

| 観点 | multi-user | solo |
|------|-----------|------|
| 起動方法 | 担当者が `/ai-team-run` 実行 | `/ai-team-watch` で監視ループ |
| 新規チケットの検出 | 手動 | ポーリングで自動 |
| 二重実行防止 | 担当者の運用に依存 | `ai-team:in-progress` ラベル |
| solo セクション | 不要 | 必須 |

### advisor のモデル（Claude Code のときだけ）

v0.29.0 で追加。setup 時に **Claude Code runtime のときだけ** `advisorModel` を設定できます。Grok Build では質問しません。

advisor は、実装エージェントが判断に迷ったときに相談する、より強いモデルです。

**キー**: `advisorModel`（文字列）。エイリアス `fable` / `opus` か、完全なモデル ID を指定できます。未設定なら advisor はオフです。

**書き込み先**: 個人設定 `.claude/settings.local.json`（git リポジトリのルートまたは起動フォルダ、worktree では本体側のルート）。本人にだけ効き、チームの他のメンバーには影響しません。

**読み取り順（優先順位）**:
1. `.claude/settings.local.json`（個人設定・プロジェクト固有）
2. `.claude/settings.json`（共有プロジェクト設定・チーム全体）
3. `~/.claude/settings.json` または `$CLAUDE_CONFIG_DIR/settings.json`（ユーザー設定・全プロジェクト）

上位の設定がある場合、下位の値は上書きされます。個人設定が最優先です。

**確認・設定の方法**:
- 確認: `node <パッケージルート>/bin/setup.js advisor check --profile <balance|high-performance>`
- 設定: `node <パッケージルート>/bin/setup.js advisor apply --model <fable|opus|unset> --profile <balance|high-performance>`
- `.gitignore 追記の提案`: `node <パッケージルート>/bin/setup.js advisor gitignore`

**既に `/advisor` で選んでいた場合**:
- `/advisor` フラグはセッション単位（その実行だけ）に advisor のモデルを上書きします
- `.claude/settings.local.json` に `advisorModel` が設定されていると、個人設定が優先されて `/advisor` の選択は **効きません**
- 変更するには、再 setup（「設定の切替のみ」モード）か `.claude/settings.local.json` を手で編集してください

**未同意環境・Bedrock での動作**:
- `fable` を使うには、事前に Claude Code で `/model fable` を実行し、利用クレジットへの同意が必要です
- 未同意の環境・Amazon Bedrock・Claude Platform on AWS では、公式ドキュメントによれば**エラーにならず advisor なしで動き、通知が出ます**（実測未実施）

---

## `.claude/escalation-rules.yml`

エスカレーション条件と透明性ルールを定義します。

### 全フィールド

```yaml
escalation_triggers:
  - id: legal
    type: legal
    priority: P1
    description: 法的判断、契約、コンプライアンスに関わる内容
    detection: |
      以下を順に確認し、1つでも該当すればエスカレーションと判定する:
        1. 作業内容に利用規約・ライセンス・契約文書の作成・変更・解釈が含まれるか
        2. 個人情報・機密情報の取り扱い方針の新規決定・変更が必要か
        3. 外部サービス・ライブラリの規約/ライセンスの遵守可否の判断が必要か

  - id: budget
    type: budget
    priority: P2
    description: 予算承認、費用の発生を伴う判断
    detection: |
      （費用発生・利用量増加・予算承認の確認手順）

  - id: merge_approval
    type: merge_approval
    priority: P2
    description: プルリクエストの承認とマージは常に人間が行う
    detection: |
      （PR 作成ステップ・保護ブランチへのマージ到達で常にエスカレーション）

  - id: ambiguous_spec
    type: ambiguous_spec
    priority: P3
    description: |
      ルール・仕様書・CLAUDE.mdに記述がなく、どちらを採用しても優劣がつかない場合
    detection: |
      .claude/rules/ → CLAUDE.md → docs/ の順で各1回検索してから判定する
      （記述が見つかればそれに従い、優劣がつけられれば根拠を記録して自走する）

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
| `escalation_triggers[].id` | string | トリガー識別子（v0.11.0 で追加）。human-escalator のエスカレーションコメント「エスカレーション種別」に記載する値 |
| `escalation_triggers[].type` | string | トリガー種別。`legal` / `budget` / `merge_approval` / `ambiguous_spec`（後方互換のため `id` と同値で維持） |
| `escalation_triggers[].priority` | string | 優先度（v0.11.0 で追加）。`P1`: 即時の人間判断が必要 / `P2`: 当日中の対応が望ましい / `P3`: 急がない |
| `escalation_triggers[].description` | string | この条件の説明 |
| `escalation_triggers[].detection` | string | エスカレーションと判定するための具体手順（v0.11.0 で追加。記載の順番どおりに確認する） |
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

> **v0.11.0 の変更**: AI の主観的な解釈に頼らない**機械判定**に強化されました。`sensitive_areas` の各項目に正規表現 `pattern` が追加され、`detection_procedure` に定義された手順（コマンド）どおりに計測・照合します。また全レビュアー共通のチェックリスト `review_criteria` が追加されました。

### 全フィールド

```yaml
review:
  mode: auto  # AI が以下の基準に従って自動判断します

  # ダブルレビュー基準（いずれか 1 つでも該当）
  double_review_criteria:
    file_count_threshold: 5
    sensitive_areas:                 # pattern は拡張正規表現（単語境界 \b 付き）
      - id: auth
        description: 認証・認可（auth / login / session / token / JWT）
        pattern: '\b(auth|login|session|token|jwt|oauth)\b'
      - id: payment
        description: 決済・課金（payment / billing / stripe / invoice）
        pattern: '\b(payment|billing|stripe|invoice|charge)\b'
      - id: personal-data
        description: 個人情報・機密データ（user / password / email / PII）
        pattern: '\b(user|password|email|pii|credential|secret)\b'
      - id: db-schema
        description: データベーススキーマ・マイグレーション（migration / schema）
        pattern: '\b(migration|schema|migrate)\b'
      - id: public-api
        description: 公開API（破壊的変更・エンドポイントの追加・削除）
        pattern: '\b(api|endpoint|route|openapi|swagger)\b'
      - id: security-config
        description: セキュリティ設定（cors / csrf / rate-limit / firewall）
        pattern: '\b(cors|csrf|rate[-_]?limit|firewall|csp)\b'
    cross_layer_changes: true
    labels:
      - "complexity:high"
      - "security-sensitive"
      - "breaking-change"

  # 機械判定手順（v0.11.0 で追加）
  # Tech-Lead はこの手順どおりにコマンドを実行し、計測値をレビュー方式判断コメントに必ず記載する
  detection_procedure:
    base_branch: main   # 計測の基準ブランチ
    steps:
      - id: verify-base       # 0. 基準ブランチの存在確認（失敗時は安全側に倒しダブルレビュー）
        command: 'git rev-parse --verify <base_branch>'
      - id: file-count        # 1. 変更ファイル数の計測
        command: 'git diff --name-only <base_branch>...HEAD | wc -l'
      - id: path-match        # 2. パス照合（該当確定）
        command: 'git diff --name-only <base_branch>...HEAD | grep -ciE "<pattern>" || true'
      - id: body-match        # 3. 本文照合（参考値。該当判定には使わない）
        command: 'git diff <base_branch>...HEAD --unified=0 | grep "^+" | grep -v "^+++" | grep -ciE "<pattern>" || true'

  # シングルレビュー基準
  single_review_criteria:
    - 単一ファイルの変更
    - ドキュメント・コメントのみの変更
    - テストの追加（実装ロジックの変更なし）
    - 設定値・定数の変更（アルゴリズムの変更なし）
    - スタイル・フォーマットの修正

# 全レビュアー共通のレビュー基準（v0.11.0 で追加。reviewer / reviewer-a / reviewer-b が参照）
review_criteria:
  - id: correctness
    item: 機能の正しさ
    check: 要件・設計方針どおりに動作し、エッジケースが考慮されている
  # ほか test-coverage / readability / security / performance / error-handling

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
| `review.double_review_criteria.sensitive_areas` | array | 機密領域の定義。`id` / `description` / `pattern`（単語境界付き拡張正規表現）を持つ |
| `review.double_review_criteria.cross_layer_changes` | boolean | 複数レイヤーをまたぐ変更でダブルレビュー |
| `review.double_review_criteria.labels` | array | これらのラベルが付与されている場合にダブルレビュー |
| `review.detection_procedure.base_branch` | string | 計測の基準ブランチ（プロジェクトのデフォルトブランチに合わせて変更） |
| `review.detection_procedure.steps` | array | 機械判定の手順。`verify-base` → `file-count` → `path-match`（該当確定）→ `body-match`（参考値）の順で実行 |
| `review.single_review_criteria` | array | シングルレビューとなる典型ケース（参考情報） |
| `review_criteria` | array | 全レビュアー共通のレビューチェックリスト（基準の重複記載を避けるため一本化） |
| `post_review.create_pr` | boolean | レビュー後に PR を作成するか |
| `post_review.pr_agent` | string | PR 作成を担当するエージェント名 |

### 機械判定の運用ルール

- Tech-Lead は `detection_procedure` の手順どおりにコマンドを実行し、**計測値（ファイル数・ヒットした pattern と件数）をレビュー方式判断コメントに必ず記載**します。主観での判定は禁止です
- **パス照合（path-match）= 該当確定**: 変更ファイルのパスが pattern にマッチしたらダブルレビュー確定
- **本文照合（body-match）= 参考値**: 追加行の内容マッチは記録のみで、該当判定には使いません
- 基準ブランチの検証（verify-base）に失敗した場合は計測不能として**安全側に倒しダブルレビュー**にします
- `grep -c` の結果は「マッチ行数」。ヒット 0 件時に grep が終了コード 1 を返すため `|| true` を併記します

---

## `.claude/teams/frontend/review-config.yml`

フロントエンドチームのレビュー方式判定基準。`sensitive_areas` の内容（`pattern`）がフロントエンド向けになっている以外、構造（`pattern` / `detection_procedure` / `review_criteria` を含む）はバックエンドと同じです。

### `sensitive_areas`

| 領域 | pattern（抜粋） |
|------|----------|
| 認証 UI | `\b(auth|login|logout|session|signin|signup|token)\b` |
| 決済 UI | `\b(payment|checkout|billing|stripe|cart)\b` |
| 個人情報フォーム | `\b(user|profile|password|email|address|account)\b` |
| デザインシステム破壊的変更 | `\b(design-system|theme|token|variables|components/(common|shared|ui))\b` |
| 公開 API インターフェース変更 | `\b(api|endpoint|openapi|swagger|types/api)\b` |

`cross_layer_changes` フィールドはフロントエンド版にはありません。機械判定は Frontend-Lead が `detection_procedure` の手順で実施します。

---

## 関連ドキュメント

- [ワークフロー定義](workflow.html) — `workflow.yml` の仕様
- [エスカレーションルール](escalation.html) — `escalation-rules.yml` の運用
- [Tech-Writer](../agents/tech-writer.html) — `docs-src/config.json` の更新
