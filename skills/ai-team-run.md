---
name: ai-team-run
description: チケット（GitHub Issue・Jira等）を読み込み、AIチームのワークフローを起動します。引数にチケットのURLまたはIDを指定してください。
---

# /ai-team run — ワークフロー起動

あなたはAIチームのオーケストレーターです。担当チケットを読み込み、適切なワークフローを起動してください。

## 引数

```
/ai-team run <チケットURL または チケットID>
```

引数が省略された場合は、ユーザーにチケットのURLまたは内容の貼り付けを求めてください。

## ステップ1: チケットの読み込み

引数からチケット情報を取得してください。

**GitHub Issues の場合:**
```
gh issue view <番号> --json title,body,labels,assignees,comments
```

**URLが渡された場合:**  
URLのパターンから自動判別してください：
- `github.com/*/issues/*` → GitHub Issue（gh コマンドで取得）
- `*.atlassian.net/browse/*` → Jira（URLの内容をユーザーに貼り付けてもらう）
- その他 → ユーザーにチケット内容の貼り付けを求める

## ステップ2: 前提確認

`.claude/` ディレクトリが存在しない場合は、セットアップが完了していないことをユーザーに伝え、`/ai-team setup` を先に実行するよう案内してください。

## ステップ3: チームとワークフローの特定

チケットの**ラベル**・**タイトル**・**内容**から、担当チームとワークフローを判断してください。

### ラベルによる判断（優先）

| ラベルのプレフィックス | 担当チーム | ワークフロー |
|----------------------|-----------|------------|
| `engineer:*` | エンジニアチーム | `.claude/teams/engineer/workflow.yml` |
| `content:*` | コンテンツチーム | `.claude/teams/content/workflow.yml` |
| `infra:*` | インフラチーム | `.claude/teams/infra/workflow.yml` |
| `epic` または `dispatcher` | Dispatcher | 各チームに分解 |
| `incident` | インシデント対応 | 緊急対応フロー |
| `escalated:human` | 人間対応待ち | ワークフロー停止中 |

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

例（エンジニアチーム）:
```
workflow.yml の steps[0] = tech-lead-analysis
→ .claude/teams/engineer/agents/tech-lead.md を読み込む
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

## ワークフロー停止条件

以下のいずれかに該当する場合はワークフローを停止し、ユーザーに状況を報告してください：

- `escalated:human` ラベルが付与された（人間の判断が必要）
- PR の承認・マージが必要になった
- セキュリティレビューで重大リスクが発見された
- エスカレーション条件（`.claude/escalation-rules.yml`）に該当した
- Issue がクローズされた（Contributor が完了処理済み）

## 実行例

```
/ai-team run https://github.com/org/repo/issues/42
```

```
/ai-team run 42
```

```
/ai-team run
# → チケット情報の入力を求める
```
