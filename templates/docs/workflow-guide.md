# ワークフロー定義ガイド

`workflow.yml` の記述方法・ルール・カスタマイズ方法を説明します。

---

## 概要

各チームの `workflow.yml` は、AIエージェントが GitHub Issue を通じてタスクを処理する順序と条件分岐を定義します。このファイルを読んで動作するのはエージェント自身であり、人間が直接実行するものではありません。

```
.claude/teams/<チーム名>/workflow.yml
```

---

## ファイル構造

```yaml
name: <ワークフロー名>
description: <ワークフローの説明>

labels:
  prefix: "<ラベルのプレフィックス>"
  examples: [...]

steps:
  - id: <ステップID>
    agent: <エージェント名>
    label: "<GitHubラベル>"
    description: <説明>
    # 条件・引き継ぎの定義...
```

---

## フィールド一覧

### トップレベル

| フィールド | 必須 | 説明 |
|-----------|------|------|
| `name` | ✅ | ワークフロー識別名（kebab-case） |
| `description` | ✅ | ワークフローの用途説明 |
| `labels` | ✅ | ラベル命名規則の定義 |
| `steps` | ✅ | ステップのリスト |

### `labels`

```yaml
labels:
  prefix: "backend"        # 全ラベルの先頭に付くプレフィックス
  examples:                 # 使用するラベルの例示（ドキュメント目的）
    - "backend:tech-lead"
    - "escalated:human"
```

---

## ステップ定義

### 基本構造

```yaml
steps:
  - id: tech-lead-analysis      # ステップの一意なID（kebab-case）
    agent: tech-lead            # 担当エージェント名（agents/配下のファイル名と一致）
    label: "backend:tech-lead" # このステップで付与するGitHubラベル
    description: <説明>         # ステップの説明（エージェントが参照する）
```

### 完了時の引き継ぎ（`on_complete`）

#### シンプルな引き継ぎ

```yaml
on_complete:
  next: implementer  # 次のステップID
```

#### 条件分岐

```yaml
on_complete:
  conditions:
    - id: single-review             # 条件の識別名
      description: シングルレビュー条件の説明
      criteria:                     # 判断基準（AIが解釈する）
        - 変更ファイル数が5未満
        - 認証関連の変更なし
      next: reviewer                # この条件に合致した場合の次ステップ

    - id: double-review
      description: ダブルレビュー条件の説明
      criteria:
        - 変更ファイル数が5以上
        - 認証・セキュリティ関連の変更を含む
      next: [reviewer-a, reviewer-b]  # 並列起動（リスト形式）
```

**重要**: `criteria` はAIが実装内容・Issue内容を見て解釈します。人間が手動で設定するものではありません。

---

## 条件分岐のルール

### 1. 条件は上から順に評価する

```yaml
conditions:
  - id: high-priority    # 最初に評価される
    criteria: [...]
    next: urgent-handler

  - id: normal           # 上の条件に非該当の場合に評価される
    criteria: [...]
    next: normal-handler
```

### 2. 条件が複数該当する場合

最初に合致した条件が適用されます。より具体的な条件を先に記述してください。

### 3. デフォルト条件

全ての条件に非該当の場合のフォールバックを定義できます。

```yaml
conditions:
  - id: special-case
    criteria: [...]
    next: special-handler

  - id: default           # id: default は全条件に非該当の場合に適用
    next: normal-handler
```

---

## 並列実行

### 並列起動

`next` をリスト形式にすると、複数のステップが並列で起動します。

```yaml
on_complete:
  next: [network-engineer, infra-specialist]  # 同時に両方を起動
```

### 並列ステップの宣言

並列で実行されるステップには `parallel_with` を記述します。

```yaml
- id: reviewer-a
  agent: reviewer-a
  label: "backend:reviewer-a"
  parallel_with: reviewer-b   # 並列実行であることを宣言

- id: reviewer-b
  agent: reviewer-b
  label: "backend:reviewer-b"
  parallel_with: reviewer-a
```

### 並列ステップの完了待ち

後続ステップで全並列ステップの完了を待つ場合は `requires_all_of` を使います。

```yaml
- id: cross-review
  agent: reviewer-a
  requires_all_of:          # 全ての完了を待つ
    - reviewer-a
    - reviewer-b
  description: 両者のレビュー完了後にクロスレビューを実施する
```

---

## 差し戻し（リワーク）

```yaml
on_rework:
  condition: 不合格         # 差し戻しのトリガー条件（AIが解釈）
  next: implementer         # 差し戻し先のステップID
```

差し戻しが発生すると、指定したステップから再実行されます。

---

## エスカレーション

### エスカレーション定義

```yaml
on_escalation:
  next: human-escalator     # 常に human-escalator ステップへ
```

条件付きエスカレーション：

```yaml
on_escalation:
  condition: 重大セキュリティリスクを発見
  next: human-escalator
```

### human-escalatorステップの定義

ワークフロー内に必ず以下を定義してください。

```yaml
- id: human-escalator
  agent: human-escalator
  label: "escalated:human"
  description: 判断できない事項を人間にエスカレーション
  on_complete:
    condition: 人間が判断・返答
    next: return_to_previous  # エスカレーション元のステップに戻る
```

`return_to_previous` は予約語です。エスカレーション元のステップに自動で戻ります。

---

## 特殊な引き継ぎ先

| 値 | 意味 |
|----|------|
| `return_to_previous` | エスカレーション・差し戻し元のステップに戻る |
| `[step-a, step-b]` | 複数ステップを並列起動 |

---

## 完了アクション

```yaml
- id: contributor-close
  agent: contributor
  label: "contributor:ready"
  on_complete:
    action: close_issue    # Issueをクローズする
```

`action: close_issue` はワークフローの終端を示します。

---

## ラベル設計ルール

### 命名規則

```
<チーム名>:<エージェント名>

例:
  backend:tech-lead
  backend:implementer
  content:writer
  infra:security-engineer
```

### 共通ラベル（チーム横断）

| ラベル | 意味 |
|--------|------|
| `contributor:ready` | Contributor によるDOD確認・クローズ待ち |
| `escalated:human` | 人間の判断待ち |
| `epic` | 複数チームにまたがるEpic Issue（Dispatcherが分解） |
| `sub-issue` | Dispatcherが生成したSub Issue |
| `complexity:high` | 複雑度が高い（ダブルレビューのトリガー） |
| `security-sensitive` | セキュリティ関連（ダブルレビューのトリガー） |
| `breaking-change` | 破壊的変更（ダブルレビューのトリガー） |
| `type:incident` | インシデントレポートのIssue |

### ラベルの状態遷移

各ステップ完了時にラベルを更新することで、現在の担当エージェントが明示されます。

```
backend:tech-lead → backend:implementer → backend:reviewer → backend:pr-creator → contributor:ready
```

---

## エージェントの追加方法

### 1. エージェント定義ファイルを作成

```
.claude/teams/<チーム名>/agents/<エージェント名>.md
```

### 2. workflow.yml にステップを追加

```yaml
- id: new-agent-step
  agent: new-agent-name   # agents/<name>.md のファイル名（拡張子なし）
  label: "<チーム名>:new-agent-name"
  description: <説明>
  on_complete:
    next: <次のステップ>
```

### 3. 前後のステップの `next` を更新

既存ステップの `on_complete.next` を新しいステップIDに変更します。

---

## 依頼時のみ起動するエージェント

常駐せず、特定の条件でのみ起動するエージェントは `conditions` で制御します。

```yaml
- id: infra-lead-check
  agent: infra-lead
  on_complete:
    conditions:
      - id: architect-needed
        description: 大規模変更・アーキテクチャ判断が必要な場合のみ
        criteria:
          - システム全体の設計方針に関わる大規模変更
          - 言語・フレームワークの選定が必要
        next: architect   # この条件の場合のみ architect を起動

      - id: no-architect-needed
        description: 通常の変更
        next: security-engineer  # architect をスキップ
```

---

## カスタマイズのガイドライン

### プロジェクト固有の設定は workflow.yml を直接編集

```yaml
# プロジェクト固有のレビュー基準を追加する例
- id: tech-lead-review-decision
  # ... 既存の設定 ...
  on_complete:
    conditions:
      - id: double-review
        criteria:
          - 変更ファイル数が5以上
          - 認証・セキュリティ関連の変更
          - このプロジェクト固有の条件: <追記>   # ← ここに追加
        next: [reviewer-a, reviewer-b]
```

### チームを追加する場合

1. `templates/teams/<新チーム名>/` ディレクトリを作成
2. `agents/` 配下にエージェント定義ファイルを配置
3. `workflow.yml` を作成
4. `dod/` 配下にDODテンプレートを配置
5. セットアップウィザード（`/ai-team setup`）でチームを選択できるよう、ウィザード設定を更新

---

## よくある設計パターン

### パターン1: シンプルな直列フロー

```yaml
steps:
  - id: step-a
    on_complete: { next: step-b }
  - id: step-b
    on_complete: { next: step-c }
  - id: step-c
    on_complete: { action: close_issue }
```

### パターン2: 条件分岐あり

```yaml
- id: decision-point
  on_complete:
    conditions:
      - id: path-a
        criteria: [条件A]
        next: handler-a
      - id: path-b
        criteria: [条件B]
        next: handler-b
```

### パターン3: 並列 + 合流

```yaml
- id: trigger
  on_complete:
    next: [parallel-a, parallel-b]

- id: parallel-a
  parallel_with: parallel-b
  on_complete: { next: merge-point }

- id: parallel-b
  parallel_with: parallel-a
  on_complete: { next: merge-point }

- id: merge-point
  requires_all_of: [parallel-a, parallel-b]
  on_complete: { next: next-step }
```

### パターン4: 差し戻しループ

```yaml
- id: implementer
  on_rework: { condition: 差し戻し, next: implementer }  # 自分自身に戻る
  on_complete: { next: reviewer }

- id: reviewer
  on_complete: { condition: 合格, next: next-step }
  on_rework: { condition: 不合格, next: implementer }
```

---

## 実践例

実際のチームワークフローを題材にした具体的なシナリオです。

---

### 実践例A: バックエンドチーム — セキュリティ関連実装がダブルレビューになるケース

**シナリオ**: JWTトークンの認証ロジックを修正するIssue

#### Issueの状態

```
タイトル: JWT有効期限の設定をconfigから読み込むよう修正
ラベル: backend:tech-lead, team:backend
変更予定ファイル: src/auth/jwt.ts, src/config/auth.ts, tests/auth.test.ts
```

#### 1. Tech-Lead が設計方針を決定

Tech-Lead がインシデントファイルを確認すると、過去に同種のインシデントが記録されていた。

```
⚠️ 関連インシデント注意事項

参照: `.claude/incidents/2026-05-10_101_auth-token-expiry.md`

⛔ やってはいけないこと
- トークン有効期限を直接コードに書くこと
- 環境変数の存在チェックを省略すること

⚠️ 注意事項
- 必ず config/auth.yml の値を参照すること
```

設計方針コメントを投稿し、`backend:implementer` に更新。

#### 2. Implementer が実装・テストを完了

完了報告を投稿。変更ファイルは3件、テスト全件パス。

#### 3. Tech-Lead がレビュー方式を自動判断

```
🔧 Tech-Lead: レビュー方式を判断しました

## 影響範囲の分析
- 変更ファイル数: 3件
- 変更対象領域: 認証・JWT・トークン管理
- 複数レイヤーの変更: なし

## 判断結果: ダブルレビュー

判断理由:
- 認証ロジック（JWT）の変更を含むため、double_review_criteria の
  「認証・認可に関わる変更」に該当する

⏭️ 次のアクション: backend:reviewer-a + backend:reviewer-b に引き継ぎます
```

ラベルを `backend:reviewer-a` と `backend:reviewer-b` の両方に付与。

#### 4. Reviewer-A と Reviewer-B が独立してレビュー（並列）

Reviewer-A・Reviewer-B はお互いのコメントを見ずにそれぞれレビューし、暫定結果を投稿。

```
🔍 Reviewer-A: 独立レビュー完了（暫定）
※ このレビューはReviewer-Bの結果を見ずに独立して行いました
- 指摘: src/auth/jwt.ts L.23 — 環境変数が未定義の場合のフォールバック処理がない
  根拠: .claude/rules/security.md「環境変数は必ず存在チェックを行うこと」
```

```
🔍 Reviewer-B: 独立レビュー完了（暫定）
※ このレビューはReviewer-Aの結果を見ずに独立して行いました
- 指摘: src/auth/jwt.ts L.23 — 同上（環境変数の存在チェック漏れ）
- 指摘: tests/auth.test.ts — 環境変数未定義時のテストケースがない
```

#### 5. クロスレビューで合意形成

```
🔀 Reviewer-A: クロスレビュー完了 → 最終判定

## Reviewer-B との差異確認
| 指摘項目 | Reviewer-A | Reviewer-B | 最終判断 |
|---------|-----------|-----------|---------|
| 環境変数チェック漏れ | 指摘あり | 指摘あり | 要修正（合意） |
| テストケース不足 | 指摘なし | 指摘あり | 要修正（Reviewer-Bが正しい） |

## 最終判定: 不合格

⏭️ 次のアクション: backend:implementer に差し戻します
```

#### 6. Implementer が修正 → 再レビュー → 合格 → PR作成 → 人間が承認・マージ

---

### 実践例B: コンテンツチーム — Researcherが呼ばれるケースとスキップされるケース

**シナリオ比較**: 同じ「健康」カテゴリでも調査の要否が分かれる

#### ケースB-1: Researcherが呼ばれるケース

```
タイトル: 日本人の睡眠不足の現状と改善策についての記事を作成
```

Editor-in-Chief の判断：

```
📝 Editor-in-Chief: 方針を決定しました

...（方針の記述）...

## Researcherへの調査依頼
統計データ（日本人の平均睡眠時間・睡眠不足の割合）と
科学的根拠のある改善策が必要なため、Researcherに調査を依頼します。

⏭️ 次のアクション: content:researcher に引き継ぎます
```

Researcher が政府統計・査読論文から事実データを収集し、調査レポートを作成。

```
🔬 Researcher: 調査が完了しました

## 確認された事実
- 日本人の平均睡眠時間は7時間22分（厚生労働省「国民健康・栄養調査」2023年、URL）
- 「睡眠負債」は認知機能・免疫機能に影響（Nature誌 Smith et al., 2022、URL）

## 推定として扱うべき情報
- 推定: 経済損失は年間約15兆円と推定される
  根拠: ランド研究所試算（2023）、ただし試算方法に議論あり（URL）
```

Writer は調査レポートを参照して執筆。事実と推定を明確に区別した原稿を作成。

#### ケースB-2: Researcherがスキップされるケース

```
タイトル: 社内Slackの使い方ガイドを更新する
```

Editor-in-Chief の判断：

```
📝 Editor-in-Chief: 方針を決定しました

...（方針の記述）...

## 調査の要否
内部ドキュメントの整理・更新であり、既知の情報のみで構成されるため
Researcherへの調査依頼は不要と判断します。

⏭️ 次のアクション: content:writer に直接引き継ぎます
```

Researcher をスキップして Writer に直接引き継ぎ。

#### ケースB-3: 健康記事でコンプライアンスが法的判断を必要とするケース

Writer が「○○サプリメントは睡眠を改善します」という表現を含む原稿を提出。

Compliance がチェック：

```
❌ Compliance: 差し戻し

## CRITICAL（必ず修正）
- [ ] 「睡眠を改善します」という表現
  - 問題: 薬機法上の効能・効果の標榜に該当する可能性がある
  - 根拠: compliance-rules/health-pharma.md「効能・効果の標榜禁止」
  - 修正方針: 「睡眠をサポートする成分を含みます」等の表現に変更、
              またはHuman-Escalatorで法的判断を仰ぐ

⏭️ 次のアクション: content:writer に差し戻します
```

---

### 実践例C: インフラチーム — Architectへの依頼が発生するケース

**シナリオ**: マイクロサービス化のためのAPI Gateway導入

#### Issueの状態

```
タイトル: モノリスAPIをAPI Gateway + Lambda構成に移行する
ラベル: infra:infra-lead
```

#### 1. Infra-Lead が分析・設計方針を決定

公式ドキュメント（AWS API Gateway）を参照し、設計方針を投稿。

変更内容を分類：
- API Gatewayのルーティング設定 → Network-Engineer
- Lambda・IAM・CloudFormation → Infra-Specialist

両エージェントを並列起動。

#### 2. Network-Engineer と Infra-Specialist が並列で実装

それぞれ独立して担当領域を実装し、完了を報告。

#### 3. Infra-Lead が整合性を確認 → Architect への依頼を判断

```
🏗️ Infra-Lead: 実装完了を確認しました

## 整合性チェック結果
Network-Engineer の実装と Infra-Specialist の実装の整合性を確認しました。
技術的には問題ありませんが、以下の理由でArchitectへの助言を依頼します。

## Architectへの依頼理由
このAPI Gateway導入はシステム全体のアーキテクチャ変更（モノリス → マイクロサービス）
を伴います。言語・デザインパターン・将来の拡張性について、
システム全体の観点からの助言が必要と判断しました。

⏭️ 次のアクション: infra:architect に助言を依頼します（Opusモデル使用）
```

#### 4. Architect が助言（Opusモデルで深い推論）

```
🏛️ Architect: 助言を提供します

## 質問・依頼の理解
モノリスAPIをAPI Gateway + Lambda構成に移行する際の
アーキテクチャ的な妥当性と注意点について助言を求められています。

## 分析

### 選択肢の比較

**選択肢A: 今回の構成（API Gateway + Lambda）**
- 利点: スケーラビリティ・従量課金・デプロイの独立性
- 欠点: コールドスタート・レイテンシ増加・デバッグの複雑化
- 適した状況: トラフィックが不規則・チームが独立してデプロイしたい

**選択肢B: API Gateway + コンテナ（ECS/EKS）**
- 利点: コールドスタートなし・Lambdaの制約（15分タイムアウト等）なし
- 欠点: 常時起動コスト・インフラ管理の複雑化
- 適した状況: 長時間処理・既存のコンテナ資産がある

### 推奨
現在のトラフィックパターンと開発チームの規模から判断すると、
選択肢Aが適切です。ただし以下の点に注意してください。

## 長期的な考慮事項
- サービス間通信のパターンを早期に定義する（同期/非同期）
- 共通処理（認証・ログ）はLambda Layerで管理する
- 将来のサービス追加を見据えてOpenAPIスキーマを整備する

## 参照したパターン・原則
- マイクロサービスパターン: API Gatewayパターン（Richardson, 2018）
- AWSベストプラクティス: Serverless Application Lens
```

#### 5. Security-Engineer がセキュリティレビュー → Contributor がクローズ

Architect の助言を受けた実装をSecurity-Engineerがレビューし合格。Contributorがクローズ。

クローズ時にインシデント調査を実施：

```
✅ Contributor確認済み：インシデント記録なし

今回のAPI Gateway導入では特筆すべき障害・事故・判断ミスはありませんでした。
```
