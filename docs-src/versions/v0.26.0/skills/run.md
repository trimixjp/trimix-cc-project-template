# /ai-team-run — ワークフロー起動

担当チケット（チケット・Jira・Linear 等）を読み込み、適切なチームのワークフローを起動します。

> **スキル定義**: `skills/ai-team-run.md`

---

## 使い方

```
/ai-team-run <チケットURL または チケットID>
```

引数を省略した場合、チケットの URL またはチケット内容の貼り付けを促されます。

### 実行例

```
# チケット番号で指定
/ai-team-run 42

# チケット URL で指定
/ai-team-run https://github.com/.*/issues/42

# Jira URL で指定
/ai-team-run https://your-org.atlassian.net/browse/PROJ-123

# 引数なしで起動 → チケット内容の入力を求められる
/ai-team-run
```

---

## ステップ 1: チケットの読み込み

引数の形式に応じて、自動的に取得方法を選択します。

| チケットの形式 | 取得方法 |
|---------------|---------|
| 番号のみ（例: `42`） | `gh issue view 42 --json title,body,labels,assignees,comments` |
| チケット URL | `gh issue view <番号>` で取得 |
| Jira URL | URL から番号抽出後、ユーザーに内容貼り付けを依頼 |
| その他の URL | ユーザーにチケット内容の貼り付けを依頼 |

---

## ステップ 2: 前提確認

`.claude/` ディレクトリが存在しない場合、未セットアップとして `/ai-team-setup` の実行を案内して中断します。

---

## ステップ 3: チームとワークフローの特定

チケットの**ラベル**・**タイトル**・**内容**から担当チームを判定します。ラベルが優先されます。

### ラベルによる判断（優先）

| ラベルプレフィックス | 担当チーム | ワークフロー |
|---------------------|-----------|------------|
| `backend:*` | バックエンドチーム | `.claude/teams/backend/workflow.yml` |
| `frontend:*` | フロントエンドチーム | `.claude/teams/frontend/workflow.yml` |
| `content:*` | コンテンツチーム | `.claude/teams/content/workflow.yml` |
| `infra:*` | インフラチーム | `.claude/teams/infra/workflow.yml` |
| `epic` / `dispatcher` | Dispatcher | 各チームに分解（`.claude/agents/dispatcher.md`） |
| `incident` | インシデント対応 | 緊急対応フロー |
| `escalated:human` | 人間対応待ち | ワークフロー停止中（`/ai-team-resume` で再開） |

### ラベルがない場合

タイトル・本文のキーワードを次の決定表に機械的に照合してチームを推定し、ユーザーに確認してから起動します（v0.23.0 で決定表化）。どの行にも一致しない場合はユーザーに直接質問します。

| タイトル・本文のキーワード（いずれかを含む） | 付与するラベル |
|---|---|
| 複数チームにまたがる・横断・全体 | `epic` |
| 障害・本番エラー・緊急 | `incident` |
| API・DB・サーバ・バッチ・認証・バックエンド | `backend:tech-lead` |
| 画面・UI・コンポーネント・CSS・フロントエンド | `frontend:designer` |
| インフラ・クラウド・ネットワーク・デプロイ・セキュリティ | `infra:infra-lead` |
| 記事・ドキュメント・README・文章 | `content:editor-in-chief` |
| SNS・X・Instagram・投稿文 | `sns:strategist` |
| YouTube・動画・台本・チャンネル | `youtube:director` |

---

## ステップ 4: インシデント確認

担当チームのワークフロー起動前に `.claude/incidents/index.yml` を読み込み、チケット内容と `keywords` を照合します。関連インシデントが見つかった場合、注意事項を チケット本文末尾またはコメントとして投稿します。

```
## ⚠️ 関連インシデント注意事項

参照: `.claude/incidents/<ファイル名>`

⛔ やってはいけないこと
- （インシデントファイルから転記）

⚠️ 注意事項
- （インシデントファイルから転記）
```

---

## ステップ 5: ワークフローの起動

### Epic / Dispatcher の場合

`.claude/agents/dispatcher.md` を読み込み、Dispatcher エージェントとして動作します。

1. チケット内容を分析して サブチケット（またはサブタスク）に分解
2. 各チームのワークフローを並列または順次で起動

### 通常チケットの場合

`workflow.yml` の最初のステップに対応するエージェント定義を読み込み、そのエージェントとして動作します。

例（バックエンドチームの場合）：

```
workflow.yml の steps[0] = tech-lead-analysis
→ .claude/teams/backend/agents/tech-lead.md を読み込む
→ Tech-Lead として動作開始
```

### インシデントの場合

担当チームが不明な場合はユーザーに確認し、即座に `escalated:human` ラベルの付与を提案します。

---

## ステップ 6: エージェントとしての動作

エージェント定義に従い、チケットを処理します。

### チケットへの記録

各エージェントの作業結果は チケットコメントとして記録されます。

```bash
# GitHub Issues
gh issue comment <番号> --body "..."

# その他のシステム
# コメント内容をユーザーに提示し、手動での貼り付けを案内
```

### ラベルの更新

次のエージェントへの引き継ぎ時にラベルを更新します。

```bash
gh issue edit <番号> --add-label "backend:reviewer" --remove-label "backend:implementer"
```

### ワークフローの継続

現在のエージェントの処理が完了したら、`workflow.yml` の `on_complete.next` に従って次のステップへ進みます。

---

## サブエージェントの無音停止検知（点呼・ウォッチドッグ）

Opus / Sonnet をオーケストレーターとして使用する場合、委託したサブエージェントが API エラー等で無音停止しても気づけない問題が発生しています（実績例: 約40分間の停止を検知できず）。この機能は、バックグラウンドプロセス（`bin/watchdog.js`）を使用して、サブエージェントの生存状態を定期的に確認します。

### 仕組みの概要

```
委託時:
  1. .claude/delegation-status/issue-<番号>/<task-slug>/ ディレクトリ作成
  2. サブエージェント起動（バックグラウンド）
  3. 同時に watchdog も起動（バックグラウンド）

watchdog 監視中:
  - heartbeat.log の更新時刻を定期確認（5分間隔での更新を期待）
  - done マーカーファイルの作成を検知

停止検知時（heartbeat 10分間以上未更新）:
  - heartbeat と成果物ファイルの mtime を実測確認（長考中を誤判定しないため）
  - 生存なら → 監視継続
  - 死亡なら → 同一プロンプトで再委託（上限2回）
  - 再委託上限超過 → escalated:human へエスカレーション
```

### 設定

`.claude/ai-team-config.yml` に `delegation_watchdog` キーがある場合は下記の値で、ない場合は既定値を使用します：

```yaml
delegation_watchdog:
  stall_threshold_minutes: 10   # heartbeat 更新なし期間の閾値（既定: 10分）
  max_redelegations: 2          # 再委託の上限回数（既定: 2回）
```

### サブエージェント側の報告義務

サブエージェントには以下の報告契約を明示してください：

1. 着手時・主要ステップ完了ごと・失敗時・完了時に報告する
2. 最低5分に1回、`date '+%Y-%m-%dT%H:%M:%S' >> <heartbeat.log>` を実行する
3. 完了時に `<done マーカー>` ファイルを作成してから終了する
4. STATUS? 受信時は、3行以内+実測値付きで即応する
5. 指示で明示されたパス以外に出力・削除をしない

---

## ワークフロー停止条件

以下のいずれかに該当した場合、ワークフローを停止してユーザーに状況を報告します。

| 停止理由 | 対応方法 |
|---------|---------|
| `escalated:human` ラベル付与 | 人間が判断・コメント → `/ai-team-resume` で再開 |
| PR の承認・マージが必要 | 人間が承認・マージ → ワークフロー継続 |
| 重大セキュリティリスク発見 | 人間の判断・対応 → 修正後に再開 |
| `escalation-rules.yml` の `escalation_triggers` に該当 | 人間の判断 → `/ai-team-resume` |
| チケットがクローズされた | Contributor が完了処理済み → 停止 |

---

## エージェント間の引き継ぎフロー（バックエンド例）

```
[/ai-team-run 42]
       │
       ▼
[ラベル backend:tech-lead を確認]
       │
       ▼
[tech-lead エージェント起動]
  → 要件分析・設計方針コメント投稿
  → ラベルを backend:implementer に更新
       │
       ▼
[implementer エージェント起動]
  → 実装・テスト・完了報告コメント投稿
  → ラベルを backend:tech-lead に戻す
       │
       ▼
[tech-lead がレビュー方式判断]
  → シングル or ダブルレビューを決定
  → ラベルを reviewer または reviewer-a + reviewer-b に更新
       │
       ▼
[reviewer / cross-review 完了]
  → 合格コメント投稿
  → ラベルを backend:tech-writer に更新
       │
       ▼
[tech-writer がドキュメント更新]
  → docs-src/ を更新、build.js 実行
  → ラベルを backend:pr-creator に更新
       │
       ▼
[pr-creator が PR 作成]
  → escalated:human ラベル付与
  → 人間の承認・マージを待つ
       │
       ▼
[人間がマージ後]
  → /ai-team-resume または solo 自動再開
  → contributor が DOD 確認・チケットクローズ
```

---

## 関連ドキュメント

- [ai-team-resume](resume.html) — エスカレーション後の再開
- [バックエンドチーム](../teams/backend.html) — フロー詳細
- [ワークフロー定義](../reference/workflow.html) — `workflow.yml` の仕様
- [エスカレーションルール](../reference/escalation.html) — 停止条件の詳細
