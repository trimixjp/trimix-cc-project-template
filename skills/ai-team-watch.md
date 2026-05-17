---
name: ai-team-watch
description: ソロモード用。GitHub Issuesを定期監視し、新しいタスクを自動検出してワークフローを実行します。
---

# /ai-team watch — 自動監視モード

あなたはIssue監視エージェントです。以下の手順でGitHub Issuesを定期監視し、新しいタスクを自動処理してください。

## 前提確認

1. `.claude/ai-team-config.yml` を読み込み、`mode: solo` であることを確認してください
2. `mode: multi-user` の場合は以下を表示して終了：
   ```
   ℹ️  現在の運用モードは multi-user です。
   /ai-team watch はソロモード専用コマンドです。
   タスクを処理するには: /ai-team run <IssueのURL>
   ```
3. `gh auth status` でGitHub認証を確認。未認証なら `gh auth login` を案内して終了

## 監視ループ

以下をループで繰り返してください。

### ループ1回の処理

**ステップ1: 処理対象Issueの検索**

**A) 新規Issue（通常処理）**

`.claude/ai-team-config.yml` の `solo.target_labels` に定義されたラベルのいずれかが付いており、かつ `solo.skip_labels` のラベルが付いていないIssueを検索：

```bash
gh issue list --label "<target_label>" --state open --json number,title,labels,url
```

target_labels を1つずつ検索し、結果をまとめて重複を除去してください。

**B) エスカレーション解除Issue（再開処理）**

`escalated:human` ラベルが**付いていない**、かつ直近のコメントに `🚨 エスカレーション` が含まれており、その後に人間のコメントが存在するIssueを検索：

```bash
gh issue list --state open --json number,title,labels,comments,url
```

取得したIssueのうち以下の条件を満たすものを再開対象として抽出：
- `escalated:human` ラベルがない
- コメント履歴に `🚨 エスカレーション` を含むコメントがある
- そのコメントより後に、AIエージェント以外（`🚨`・`✅`・`🛠️`・`🔧`・`🎨`・`💻` で始まらない）のコメントがある

これらは `/ai-team run` の再開モードで処理します。

**ステップ2: 処理済み・処理中Issueのスキップ判定**

取得したIssueのうち、以下をスキップ：
- `ai-team:in-progress` ラベルが付いているIssue（別プロセスが処理中のため二重実行防止）
- `solo.skip_labels` のいずれかのラベルが付いているIssue

**ステップ3: 未処理Issueの処理**

処理対象のIssueが1件以上ある場合：
- 各Issueに対して以下の順で処理する（1件ずつ順番に、並列実行しない）：

  1. **処理開始のロック**: Issue に `ai-team:in-progress` ラベルを付与してから処理を開始
     ```bash
     gh issue edit <番号> --add-label "ai-team:in-progress"
     ```
  2. **コンソールへ出力**：
     ```
     🤖 [HH:MM] Issue #<番号> を処理中: <タイトル>
     ```
  3. `/ai-team run <IssueのURL>` に相当する処理を実行
  4. **処理完了のアンロック**: 処理が完了（またはエラー終了）したら `ai-team:in-progress` ラベルを除去
     ```bash
     gh issue edit <番号> --remove-label "ai-team:in-progress"
     ```

処理対象Issueが0件の場合：
```
💤 [HH:MM] 処理待ちのIssueはありません
```

**ステップ4: 次回まで待機**

`.claude/ai-team-config.yml` の `solo.poll_interval_minutes` 分待機してから、ステップ1に戻ります。

ループ開始時に以下を表示：
```
👁️  /ai-team watch を開始しました
   監視間隔: <poll_interval_minutes>分
   対象ラベル: <target_labels の一覧>
   停止するには Ctrl+C を押してください
```

## エラーハンドリング

- `gh` コマンドが失敗した場合はエラーを表示し、次のループサイクルで再試行
- Issue処理中にエラーが発生した場合：
  - 該当Issueの `ai-team:in-progress` ラベルを必ず除去してからスキップする（ラベルが残るとそのIssueが永久にロックされるため）
  - ログにErrorを記録し、次のIssueへ進む
- 連続3回エラーが発生した場合はループを停止し、`ai-team:in-progress` が残っているIssueの一覧を表示して人間に確認を求める
