# /ai-team-watch — 自動監視モード（ソロ運用）

GitHub Issues を定期監視し、新しいタスクを自動検出してワークフローを実行します。1 人で運用するソロモード専用のスキルです。

> **スキル定義**: `skills/ai-team-watch.md`

---

## 使い方

```
/ai-team-watch
```

引数はありません。`.claude/ai-team-config.yml` の `mode: solo` 設定が必須です。

```yaml
mode: solo

solo:
  poll_interval_minutes: 5
  target_labels:
    - dispatcher
    - backend:tech-lead
    - frontend:designer
    - content:editor-in-chief
    - infra:infra-lead
  skip_labels:
    - ai-team:in-progress
    - escalated:human
    - contributor:ready
```

---

## 前提確認

起動時に以下を確認し、満たさない場合は終了します。

| 確認項目 | 失敗時の挙動 |
|---------|-------------|
| `.claude/ai-team-config.yml` の `mode` が `solo` | 案内メッセージを表示して終了 |
| `gh auth status` が成功 | `gh auth login` を案内して終了 |

`mode: multi-user` の場合は次のメッセージが表示されます。

```
ℹ️  現在の運用モードは multi-user です。
/ai-team-watch はソロモード専用コマンドです。
タスクを処理するには: /ai-team-run <IssueのURL>
```

---

## 監視ループの動作

起動時に以下が表示されます。

```
👁️  /ai-team-watch を開始しました
   監視間隔: 5分
   対象ラベル: dispatcher, backend:tech-lead, frontend:designer, ...
   停止するには Ctrl+C を押してください
```

その後、`poll_interval_minutes` 分間隔でループ処理が実行されます。

### ループ 1 回の処理

#### ステップ 1: 処理対象 Issue の検索

##### A) 新規 Issue（通常処理）

`target_labels` のいずれかが付いており、`skip_labels` のラベルが付いていない Issue を検索します。

```bash
gh issue list --label "<target_label>" --state open --json number,title,labels,url
```

複数のラベルを 1 つずつ検索し、結果をまとめて重複を除去します。

##### B) エスカレーション解除 Issue（再開処理）

以下の条件を満たす Issue を再開対象として抽出します。

- `escalated:human` ラベルが付いていない
- コメント履歴に `🚨 エスカレーション` を含むコメントがある
- そのコメントより後に、AI エージェント以外のコメント（`🚨`・`✅`・`🛠️`・`🔧`・`🎨`・`💻` で始まらない）がある

これらは `/ai-team-run` の再開モードで処理します。

#### ステップ 2: スキップ判定

取得した Issue のうち、以下をスキップします。

- `ai-team:in-progress` ラベルが付いている Issue（別プロセスが処理中の二重実行防止）
- `skip_labels` のいずれかのラベルが付いている Issue

#### ステップ 3: 未処理 Issue の処理

処理対象の Issue がある場合、1 件ずつ順番に処理します（並列実行はしません）。

```
1. ロック付与: gh issue edit <番号> --add-label "ai-team:in-progress"
2. ログ出力: 🤖 [HH:MM] Issue #<番号> を処理中: <タイトル>
3. ワークフロー実行: /ai-team-run <IssueのURL> 相当の処理
4. ロック解除: gh issue edit <番号> --remove-label "ai-team:in-progress"
```

処理対象 Issue が 0 件の場合は以下を表示します。

```
💤 [HH:MM] 処理待ちのIssueはありません
```

#### ステップ 4: 待機

`poll_interval_minutes` 分待機してから、ステップ 1 に戻ります。

---

## ロック機構（`ai-team:in-progress` ラベル）

複数プロセスや手動実行と競合しないように、処理開始時に `ai-team:in-progress` ラベルを付与します。

```
処理開始 → ai-team:in-progress 付与 → 処理実行 → ai-team:in-progress 除去
```

別プロセスがこのラベルを見つけた場合は、処理中と判断してスキップします。

---

## エラーハンドリング

| エラーの種類 | 挙動 |
|------------|------|
| `gh` コマンドの失敗 | エラーを表示し、次のループサイクルで再試行 |
| 1 件の Issue 処理中のエラー | `ai-team:in-progress` ラベルを必ず除去してからスキップ、次の Issue へ進む |
| 連続 3 回のエラー | ループを停止し、`ai-team:in-progress` が残っている Issue の一覧を表示して人間に確認を求める |

ラベル除去を忘れると Issue が永久にロックされるため、エラー発生時のクリーンアップが特に重要です。

---

## マルチユーザーモードとの違い

| 観点 | solo モード（watch） | multi-user モード（run） |
|------|---------------------|------------------------|
| 起動方法 | 1 回の `/ai-team-watch` で監視ループ開始 | 担当者が各 Issue ごとに `/ai-team-run` 実行 |
| Issue 検出 | 自動（ポーリング） | 手動 |
| 二重実行防止 | `ai-team:in-progress` ラベルで制御 | 担当者の運用に依存 |
| 適性 | 1 人運用・新規 Issue を取りこぼしたくない | 複数人で分担運用 |
| エスカレーション後再開 | 自動検出（再開処理 B） | 人間が `/ai-team-resume` 実行 |

---

## 停止方法

監視ループ中に Ctrl+C を押すと停止します。停止時点で `ai-team:in-progress` ラベルが残っている Issue があれば、手動でラベルを除去してください。

```bash
gh issue edit <番号> --remove-label "ai-team:in-progress"
```

---

## 関連ドキュメント

- [ai-team-run](run.html) — 個別 Issue の手動起動
- [ai-team-resume](resume.html) — エスカレーション後の再開
- [設定ファイル](../reference/config.html) — `ai-team-config.yml` の `solo` 設定詳細
