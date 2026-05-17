---
name: ai-team-configure
description: ワークフロー定義を対話式ウィザードで設定します。引数にチームID（backend/frontend/content/infra）を指定してください。
---

# /ai-team configure — ワークフロー設定ウィザード

対話式ウィザードで `.claude/teams/<team_id>/workflow.yml` を生成・上書きします。

## 使い方

```bash
node bin/setup.js configure <team_id>
# または
npx @trimix/ai-team configure <team_id>
```

## ウィザードの実行手順

以下のコマンドを実行してウィザードを起動してください。

引数の `<team_id>` は設定したいチームIDに置き換えます（例: `backend`, `frontend`, `content`, `infra`）。

```bash
node bin/setup.js configure backend
```

## ウィザードの流れ

1. **基本情報の入力**
   - ワークフロー名（デフォルト: `<team_id>-workflow`）
   - ワークフローの説明
   - ラベルプレフィックス（デフォルト: `<team_id>`）

2. **パス1: ステップ一覧の収集**
   - ステップIDとエージェントをすべて列挙する（前方参照解決のため）
   - `.claude/teams/<team_id>/agents/` 内の `.md` ファイルが候補として表示される

3. **パス2: 各ステップの詳細設定**
   - label（デフォルト: `<prefix>:<agent>`）
   - description
   - 完了後の動作（次のステップへ / 条件分岐 / Issueをクローズ）
   - 差し戻し設定（on_rework）
   - エスカレーション設定（on_escalation）
   - 並列実行（parallel_with）
   - 完了待ちステップ群（requires）

4. **プレビュー & 保存確認**
   - 生成されるYAMLを表示して確認
   - 保存するか選択（y/N）

## 前提条件

- `.claude/teams/<team_id>/` ディレクトリが存在していること
- 存在しない場合は先に `/ai-team setup` または `/ai-team install <team_id>` を実行してください

## 注意事項

- 既存の `workflow.yml` は上書きされます
- ステップIDの入力後に詳細設定が行われるため、先にすべてのステップIDを決めておくと作業しやすいです
