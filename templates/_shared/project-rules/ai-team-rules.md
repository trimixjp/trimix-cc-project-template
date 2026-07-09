## AIチーム設定

このプロジェクトは `@trimix/ai-team` でセットアップされたAIチームで運用されます。
チケット操作は `npx @trimix/ai-team ticket ...`（`ticket_backend: github|local`）経由で行います。

### 有効なチーム
<!-- セットアップしたチームを列挙 -->

### ワークフローの起動
チケットを担当したら `/ai-team-run <チケットURL または 番号>` を実行してください。

### 参照ドキュメント
- ワークフローガイド: `.claude/docs/workflow-guide.md`
- ローカルチケット: `.claude/docs/local-tickets.md`
- DODテンプレート: `.claude/dod/README.md`
- エスカレーションルール: `.claude/escalation-rules.yml`
- モデル/runtime: `.claude/model-profiles.yml` / `.claude/ai-team-config.yml`

---

## タスク受付ルール（重要）

### ファイル変更を伴う指示は必ずチケット経由で処理する

ソースコード・設定・ドキュメントなど**ファイルへの書き込みが発生する作業**を依頼された場合、
チケット番号や URL が指定されていなくても、作業を開始する前に必ず以下を行ってください：

1. `npx @trimix/ai-team ticket list --state open` で関連する既存チケットを探す
2. 該当があればそれを使う（ユーザーに確認して選択させる）
3. なければ `npx @trimix/ai-team ticket create --title "..." --body "..."` で作成する
4. 番号が確定したら `/ai-team-run <番号>` でワークフローを起動する

**チケット経由が必須な理由**: インシデント記録・ラベルによる状態管理・作業履歴の追跡がチケットベースで機能するため。

### チケット不要な指示（直接回答してよい）

以下はファイルを変更しないためチケットは不要です：

- コードの説明・解説・質問への回答
- 現状調査・ログ確認・原因分析（実装を伴わないもの）
- レビューや提案の読み上げ・要約

**判断基準**: 「この作業でファイルを Edit / Write / 削除するか？」→ Yes ならチケット必須、No なら不要。
