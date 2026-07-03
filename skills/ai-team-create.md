---
name: ai-team-create
description: 新しいカスタムチームをゼロから作成します。会話形式でチームID・エージェント構成・ワークフローを設計し、必要なファイル一式を生成します。
---

# /ai-team-create — カスタムチーム作成ウィザード

引数: `/ai-team-create [team_id]`

あなたはカスタムチーム作成ウィザードです。ユーザーと会話しながら新しいチームを設計し、`.claude/teams/<team_id>/` 配下に必要なファイルを生成してください。

---

## ステップ0: 前提確認とチームIDの決定

### .claude/ の存在確認

```bash
ls .claude/ 2>/dev/null || echo "NOT_FOUND"
```

存在しない場合は以下を表示して終了してください：

```
❌ .claude/ ディレクトリが見つかりません。
先に /ai-team-setup を実行してください。
```

### チームIDの決定

引数として `<team_id>` が渡されている場合はそれを使用します。渡されていない場合は `AskUserQuestion` で入力させてください。

チームIDは英小文字・数字・ハイフンのみ使用可能です（例: `sales`, `youtube`, `biz-dev`）。

### 重複チェック

以下を確認し、既存チームIDと重複していないか確認します：

```bash
ls .claude/teams/ 2>/dev/null
```

重複している場合は以下を表示して終了してください：

```
❌ チームID "<team_id>" は既に存在します。
別のチームIDを使用するか、/ai-team-configure <team_id> でワークフローを編集してください。
```

---

## ステップ1: チーム基本情報の収集

`AskUserQuestion` ツールで以下を質問してください（2問まとめて）：

- **チーム名（日本語可）**: 例「営業チーム」「SNSチーム」
- **チームの目的・担当領域**: 例「自社サービスの営業活動を自動化する」

---

## ステップ2: エージェント構成の設計

### エージェント数の質問

`AskUserQuestion` で、このチームに必要なエージェントの数を選択させてください（2〜6名）。

### 各エージェントの詳細

エージェントの数だけ、以下を `AskUserQuestion` で質問してください（1エージェントずつ）：

- **エージェントID**（英小文字・ハイフン）: 例 `strategist`, `researcher`, `writer`
- **役割の説明**（1〜2文）: 例「市場調査と競合分析を担当する」
- **担当する成果物**: 例「調査レポート、競合比較表」

### ワークフロー順序の確認

収集したエージェントを表示し、`AskUserQuestion` で実行順序を確認してください：

```
現在のエージェント構成:
  1. <agent_id> — <役割>
  2. <agent_id> — <役割>
  ...

このままの順序でワークフローを作成しますか？
変更がある場合は順序を教えてください。
```

---

## ステップ3: ファイル生成

収集した情報をもとに以下のファイルを生成してください。

### 3-1: ディレクトリ作成

```bash
mkdir -p .claude/teams/<team_id>/agents
mkdir -p .claude/teams/<team_id>/dod
```

### 3-2: 各エージェントの Markdown ファイル生成

`templates/teams/_custom/agents/_agent-template.md` を参照しながら、各エージェントの `.claude/teams/<team_id>/agents/<agent_id>.md` を Write ツールで生成してください。

プレースホルダーの置換ルール：
- `{{agent_id}}` → エージェントID
- `{{agent_name}}` → エージェント名（役割に基づく日本語名。例: Strategist → 「戦略エージェント」）
- `{{agent_description}}` → 役割の説明
- `{{team_name}}` → チーム名
- `{{team_id}}` → チームID
- `{{agent_role_description}}` → 役割の詳細説明
- `{{agent_emoji}}` → 役割に合うemoji（例: 📊 🔍 ✍️ 📈）
- `{{next_agent}}` → ワークフロー上の次のエージェントID（最後のエージェントは `contributor:ready`）

### 3-3: workflow.yml の生成

`templates/teams/_custom/workflow.yml` を参照しながら、`AskUserQuestion` で収集した情報をもとに `.claude/teams/<team_id>/workflow.yml` を生成してください。

収集した全エージェントをステップとして列挙し、`on_complete.next` でワークフロー順序を表現してください。最終ステップの次は必ず `contributor-close` にしてください。

### 3-4: review-config.yml の生成

`templates/teams/_custom/review-config.yml` をコピーし、`{{team_name}}` を置換して `.claude/teams/<team_id>/review-config.yml` を生成してください。

### 3-5: DODテンプレートの生成

`templates/teams/_custom/dod/feature.md` をコピーして `.claude/teams/<team_id>/dod/feature.md` を生成してください。

---

## ステップ4: ai-team-config.yml の更新

`.claude/ai-team-config.yml` の `solo.target_labels` に、最初のエージェントのラベル（`<team_id>:<first_agent_id>`）を追加してください。

```bash
cat .claude/ai-team-config.yml
```

Read ツールで読み込み、Edit ツールで `target_labels:` セクションに追記してください。

---

## ステップ5: 完了報告

以下を表示してください：

```
✅ チーム "<team_name>" を作成しました

## 生成したファイル

| ファイル | 内容 |
|---------|------|
| `.claude/teams/<team_id>/agents/<agent_id>.md` | エージェント定義（×N） |
| `.claude/teams/<team_id>/workflow.yml` | ワークフロー定義 |
| `.claude/teams/<team_id>/review-config.yml` | レビュー設定 |
| `.claude/teams/<team_id>/dod/feature.md` | DODテンプレート |

## 更新したファイル

- `.claude/ai-team-config.yml` に `<team_id>:<first_agent_id>` を追加

## 次のステップ

1. 生成されたエージェント定義をカスタマイズしてください
   → `.claude/teams/<team_id>/agents/` 配下の各ファイル

2. ワークフローを調整する場合は以下を実行してください
   → `/ai-team-configure <team_id>`

3. GitHub にラベルを作成する場合は以下を手動で実行してください
   → `gh label create "<team_id>:<agent_id>" --color "0075ca" --description "説明"`

⚠️  注意: `.claude/` はgitignore対象です。
    チームファイルをリポジトリで管理したい場合は `.gitignore` を見直してください。
```

---

## 注意事項

- このコマンドはプロジェクトルートで実行してください
- `.claude/ai-team-config.yml` が存在しない場合は先に `/ai-team-setup` を実行してください
- 生成後のワークフロー調整には `/ai-team-configure <team_id>` を使用してください
- 既存チームの変更には `/ai-team-configure` を使用し、このコマンドは新規作成専用です
