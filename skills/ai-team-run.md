---
name: ai-team-run
description: チケット（GitHub Issue・Jira等）を読み込み、AIチームのワークフローを起動します。引数にチケットのURLまたはIDを指定してください。
---

# /ai-team run — ワークフロー起動

あなたはAIチームのオーケストレーターです。担当チケットを読み込み、適切なワークフローを起動してください。

## 引数

```
/ai-team run <チケットURL または チケットID または 問題の説明>
```

引数が省略された場合は、ユーザーにチケットのURLまたは内容の貼り付けを求めてください。

## ステップ1: 引数の種別を判定して読み込む

引数の形式によって処理を分岐してください。

### パターンA: Issue番号（数字のみ）または GitHub URL

```
gh issue view <番号> --json title,body,labels,assignees,comments
```

URLのパターンから自動判別：
- `github.com/*/issues/*` → GitHub Issue（gh コマンドで取得）
- `*.atlassian.net/browse/*` → Jira（URLの内容をユーザーに貼り付けてもらう）

Issue が取得できたら**ステップ2へ進む**。

### パターンB: 自由記述テキスト（問題・依頼の説明文）

Issue番号でも URL でもない文字列が渡された場合（例: `/ai-team run ログインAPIがエラーを返す` や `/ai-team run 1 現在の状況に合わせて最新化する`）は、以下の手順で **GitHub Issue を起点にしてからワークフローを起動**してください。

> **なぜ Issue 経由が必須か**: インシデント記録・ラベルによる状態管理・作業履歴の追跡は Issue ベースで動作します。Issue を作らずにワークフローを動かすと、これらのフローがすべてスキップされます。

#### B-1: 既存 Issue の検索

入力テキストからキーワードを抽出して、関連する open Issue を検索してください：

```bash
gh issue list --state open --search "<キーワード>" --json number,title,labels,url
```

**候補が見つかった場合:**

一覧をユーザーに提示し、どれかに該当するか確認してください：

```
以下の既存 Issue が見つかりました：
- #12: [タイトル] ([ラベル])
- #15: [タイトル] ([ラベル])

この Issue を使いますか？それとも新規 Issue を作成しますか？
```

- 既存 Issue を使う → その Issue 番号でステップ2へ
- 新規作成 → B-2へ

**候補が見つからなかった場合:** B-2へ

#### B-2: 新規 Issue の作成

入力テキストから以下を判断して Issue を作成してください：

1. **タイトル**: 入力内容を要約した短いタイトル（50文字以内）
2. **本文**: 入力テキストをそのまま含め、背景・現象・対応方針を構造化
3. **ラベル**: 内容から適切なチームラベルを推定（例: バグならそのチームの lead ラベル）

```bash
gh issue create \
  --title "<タイトル>" \
  --body "<本文>" \
  --label "<推定ラベル>"
```

作成した Issue の番号を取得し、ステップ2へ進んでください。

### パターンC: 引数なし

ユーザーにチケットの URL・番号・または問題の説明の入力を求めてください。入力されたらパターンA/Bで処理します。

## ステップ2: 前提確認

`.claude/` ディレクトリが存在しない場合は、セットアップが完了していないことをユーザーに伝え、`/ai-team setup` を先に実行するよう案内してください。

## ステップ3: チームとワークフローの特定

チケットの**ラベル**・**タイトル**・**内容**から、担当チームとワークフローを判断してください。

### ラベルによる判断（優先）

| ラベルのプレフィックス | 担当チーム | ワークフロー |
|----------------------|-----------|------------|
| `backend:*` | バックエンドチーム | `.claude/teams/backend/workflow.yml` |
| `content:*` | コンテンツチーム | `.claude/teams/content/workflow.yml` |
| `infra:*` | インフラチーム | `.claude/teams/infra/workflow.yml` |
| `epic` または `dispatcher` | Dispatcher | 各チームに分解 |
| `incident` | インシデント対応 | 緊急対応フロー |
| `escalated:human` | 人間対応待ち | ワークフロー停止中（解除後は /ai-team resume で再開） |

### ラベルがない場合

チケットの内容を分析して最も適切なチームを判断し、ユーザーに確認してから起動してください。

## ステップ4: インシデント確認

担当チームのワークフロー起動前に、`.claude/incidents/index.yml` を読み込み、チケット内容と `keywords` を照合してください。

**関連インシデントが見つかった場合:**
- 該当インシデントファイルを読み込む
- チケットにコメントとして注意事項を投稿する（`gh issue comment` または 表示）

## ステップ5: ワークフローの起動

特定したワークフローの最初のステップを実行します。

### Epic / Dispatcher の場合

`.claude/agents/dispatcher.md` を読み込み、Dispatcher エージェントとして動作してください：
- チケット内容を分析してSub Issue（またはサブタスク）に分解
- 各チームのワークフローを並列または順次で起動

### 通常チケットの場合

ワークフロー定義（`workflow.yml`）の最初のステップのエージェント定義を読み込み、そのエージェントとして動作してください。

例（バックエンドチーム）:
```
workflow.yml の steps[0] = tech-lead-analysis
→ .claude/teams/backend/agents/tech-lead.md を読み込む
→ Tech-Lead として動作開始
```

### インシデントの場合

担当チームが不明な場合はユーザーに確認し、即座に `escalated:human` ラベルの付与を提案してください。

## ステップ6: エージェントとしての動作

読み込んだエージェント定義に従い、チケットを処理してください。

**チケットへの記録:**  
各エージェントの作業結果はチケット（Issue）のコメントとして記録します：
- GitHub Issues: `gh issue comment <番号> --body "..."` を実行
- その他システム: コメント内容をユーザーに提示し、手動での貼り付けを案内

**ラベルの更新:**  
次のエージェントへの引き継ぎ時はラベルを更新します：
- GitHub Issues: `gh issue edit <番号> --add-label "..." --remove-label "..."`
- その他: ラベル変更をユーザーに案内

**ワークフローの継続:**  
現在のエージェントの処理が完了したら、`workflow.yml` の `on_complete` に従い次のステップへ進んでください。人間のアクションが必要な場合（`escalated:human`、PR承認等）はそこで停止し、ユーザーに案内してください。

**並列起動（`next` が配列の場合）:**  
`on_complete.next` または `conditions[].next` が配列（例: `[reviewer-a, reviewer-b]`）の場合、列挙されたすべてのステップのラベルを一度に付与して並列起動します。

```bash
gh issue edit <番号> \
  --add-label "backend:reviewer-a" \
  --add-label "backend:reviewer-b" \
  --remove-label "<現在のラベル>"
```

**AND完了待機（次のステップに `requires` がある場合）:**  
完了後の次のステップに `requires: [A, B, ...]` が設定されている場合、以下の手順で待機判断を行ってください。

1. `gh issue view <番号> --json labels` で現在のラベル一覧を取得する
2. `requires` に列挙されたすべてのステップのラベルが除去済みかを確認する  
   （並列ステップが完了するとそのラベルは除去されるため、ラベルの有無が完了状態の指標となる）
3. **いずれかのラベルがまだ存在する** → 自分のラベルのみ除去して終了（相手の完了を待機中）  
   **すべてのラベルが除去済み** → 次のステップのラベルを付与して引き継ぎ

例（reviewer-a が先に完了した場合）：
```bash
# 現在のラベルを確認
gh issue view <番号> --json labels
# → backend:reviewer-b がまだ存在する場合
gh issue edit <番号> --remove-label "backend:reviewer-a"
# → backend:reviewer-b も除去済みの場合
gh issue edit <番号> --remove-label "backend:reviewer-a" --add-label "backend:cross-review"
```

## ワークフロー停止条件

以下のいずれかに該当する場合はワークフローを停止し、ユーザーに状況を報告してください：

- `escalated:human` ラベルが付与された（人間の判断が必要）
  → エスカレーションコメントに再開手順を案内し停止。人間の対応後に `/ai-team resume` で再開。
- PR の承認・マージが必要になった
- セキュリティレビューで重大リスクが発見された
- エスカレーション条件（`.claude/escalation-rules.yml`）に該当した
- Issue がクローズされた（Contributor が完了処理済み）

## 実行例

```
/ai-team run https://github.com/org/repo/issues/42
# → Issue を直接読み込んでワークフロー起動
```

```
/ai-team run 42
# → Issue #42 を読み込んでワークフロー起動
```

```
/ai-team run ログインAPIが500エラーを返している
# → 既存Issueを検索 → なければ新規作成 → Issueベースでワークフロー起動
```

```
/ai-team run
# → チケット情報の入力を求める
```
