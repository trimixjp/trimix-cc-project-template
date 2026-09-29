---
name: ai-team-create
description: 新しいカスタムチームをゼロから作成します。会話形式でチームID・エージェント構成・ワークフローを設計し、必要なファイル一式を生成します。
model: opus
effort: high
model_role: leader
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
- `{{agent_name}}` → 「<役割の日本語訳>エージェント」のパターンで命名する（例: Strategist → 「戦略エージェント」、Researcher → 「調査エージェント」、Writer → 「執筆エージェント」）。日本語訳が定まらない場合はエージェントIDをカタカナ化して「〜エージェント」とする（例: `analyst` → 「アナリストエージェント」）
- `{{agent_description}}` → 役割の説明
- `{{team_name}}` → チーム名
- `{{team_id}}` → チームID
- `{{agent_role_description}}` → 役割の詳細説明
- `{{agent_emoji}}` → 下表の役割カテゴリに対応するemojiを選択する

  | 役割カテゴリ | emoji |
  |---|---|
  | 戦略・企画・分析 | 📊 |
  | 調査・リサーチ | 🔍 |
  | 執筆・作成 | ✍️ |
  | レビュー・QA・チェック | ✅ |
  | 実装・開発 | 💻 |
  | 公開・運用・配信 | 🚀 |
  | 成長・改善・収益 | 📈 |
  | 上記のいずれにも該当しない | 🤖 |

- `{{next_agent}}` → ワークフロー上の次のエージェントID（最後のエージェントは `contributor:ready`）

**model / effort / model_role（必須）:**

frontmatter に必ず `model`・`effort`・`model_role` を含めます。

1. `model_role` を決める: チーム先頭・方針決定役は `leader`、他者成果物の合否判定を専任で行うレビュー・QA は `verifier`、実装・調査は `worker`、定型処理は `simple`
2. `.claude/ai-team-config.yml` の `model_performance` / `effort_depth` を読む（無ければ balance / normal）
3. `.claude/model-profiles.yml`（またはパッケージの `bin/lib/model-profiles.js`）に従い `model` と `effort` を埋める
4. **leader** の動作フローには「次担当へ渡す チケットコメントに詳細な設計書を書く（薄い設計での委譲禁止）」を明記する

細かい調整は生成後に各 md の `model` / `effort` を直接編集できます。

### 3-3: workflow.yml の生成

`templates/teams/_custom/workflow.yml` を参照しながら、`AskUserQuestion` で収集した情報をもとに `.claude/teams/<team_id>/workflow.yml` を生成してください。

収集した全エージェントをステップとして列挙し、`on_complete.next` でワークフロー順序を表現してください。最終ステップの次は必ず `contributor-close` にしてください。

### 3-4: review-config.yml の生成

`templates/teams/_custom/review-config.yml` をコピーし、`{{team_name}}` を置換して `.claude/teams/<team_id>/review-config.yml` を生成してください。

### 3-5: DODテンプレートの生成

`templates/teams/_custom/dod/feature.md` をコピーして `.claude/teams/<team_id>/dod/feature.md` を生成してください。

### 失敗時のフォールバック

- **テンプレートファイルが見つからない場合**: `templates/teams/_custom/` に加えて `node_modules/@trimix/ai-team/templates/teams/_custom/` も確認する。どちらにも存在しない場合はテンプレート欠落として停止し、パッケージの再インストール（`npm install`）を案内する
- **`mkdir` / Write が失敗した場合**: 1回だけリトライし、それでも失敗する場合は生成内容をユーザーに提示して手動保存を案内し、停止する

---

## ステップ4: ai-team-config.yml の更新

`.claude/ai-team-config.yml` の `solo.target_labels` に、最初のエージェントのラベル（`<team_id>:<first_agent_id>`）を追加してください。

```bash
cat .claude/ai-team-config.yml
```

Read ツールで読み込み、Edit ツールで `target_labels:` セクションに追記してください。

---

## 報告前チェック（ステップ5の前に必ず実行）

生成物が実在するか以下で検証し、欠けているファイルがあればステップ3に戻って生成し直してください。

```bash
ls .claude/teams/<team_id>/agents/ \
   .claude/teams/<team_id>/workflow.yml \
   .claude/teams/<team_id>/review-config.yml \
   .claude/teams/<team_id>/dod/feature.md
grep -F "<team_id>:<first_agent_id>" .claude/ai-team-config.yml
```

- [ ] `agents/` 内の `.md` ファイル数が設計したエージェント数と一致する
- [ ] `workflow.yml` / `review-config.yml` / `dod/feature.md` が存在する
- [ ] 生成したファイルに未置換のプレースホルダーが残っていない（`grep -rF "{{" .claude/teams/<team_id>/` の出力が空）
- [ ] `ai-team-config.yml` の `target_labels` に `<team_id>:<first_agent_id>` が追記されている

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
