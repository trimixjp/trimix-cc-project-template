# ワークフローのカスタマイズ

## workflow.yml とは

`workflow.yml` は、各チームのタスク処理手順をコードとして定義するファイルです。`.claude/teams/<team_id>/workflow.yml` に配置され、どのエージェントをどの順番で起動するか、エスカレーション条件をどう判定するかなど、チームの動作ロジック全体を記述します。インストール直後はパッケージ同梱のデフォルト定義が展開されていますが、プロジェクトの要件に合わせて自由に変更できます。

---

## `/ai-team configure` ウィザードを使ったカスタマイズ（推奨）

ウィザードを使うと、質問に答えるだけで `workflow.yml` を生成・更新できます。

```bash
/ai-team configure backend
```

ウィザードは以下の項目を対話形式で設定します。

- ワークフローのステップ数と各ステップで起動するエージェント
- レビュー方式（シングル／ダブル）の判定基準
- エスカレーションを発生させる条件
- Tech-Writer の起動タイミング（バックエンドチームのみ）

生成された `workflow.yml` は `.claude/teams/<team_id>/workflow.yml` に保存されます。既存ファイルがある場合は上書き確認が表示されます。

---

## 手動で workflow.yml を編集する場合の注意点

テキストエディタで直接編集することもできます。その際は以下の点に注意してください。

- **インデントは半角スペース 2 文字**で統一してください。タブ文字を使うと YAML パースエラーになります。
- `steps` キー配下のエージェント名は、`.claude/teams/<team_id>/agents/` に存在するファイル名（拡張子なし）と一致させてください。
- 変更後は `/ai-team run` で動作確認することを推奨します。構文エラーがあるとエージェントが起動しません。

---

## よくあるカスタマイズ例

### ステップを追加する

デフォルトの `steps` リストに新しいエージェントを追加します。たとえばバックエンドチームで `security-reviewer` ステップを Reviewer の後に差し込む場合は、`workflow.yml` の該当箇所に以下のように追記します。

```yaml
steps:
  - agent: tech-lead
  - agent: implementer
  - agent: reviewer
  - agent: security-reviewer   # 追加
  - agent: tech-writer
  - agent: pr-creator
```

追加するエージェントの定義ファイル（`security-reviewer.md`）を先に `.claude/teams/backend/agents/` に作成しておく必要があります。

### レビュー方式の判定基準を変える

シングルレビューとダブルレビューの振り分けロジックは `workflow.yml` ではなく、`.claude/teams/<team_id>/review-config.yml` で管理します。このファイルに機密領域のパターン（ファイルパスや変更行数のしきい値）を記述すると、Tech-Lead が自動的に参照して判断します。

```yaml
double_review_triggers:
  paths:
    - "src/auth/**"
    - "src/payment/**"
  change_lines_threshold: 200
```

### 差し戻し条件を変える

レビューで問題が検出された場合に Implementer へ差し戻すかどうかの条件は、`workflow.yml` の `review_failure_action` キーで設定します。

```yaml
review_failure_action: revert_to_implementer   # 差し戻す（デフォルト）
# review_failure_action: escalate_to_human     # 人間にエスカレーション
```

---

## 詳細な YAML 仕様

`workflow.yml` で使用できるすべてのキーとオプションは[ワークフロー定義（リファレンス）](../reference/workflow.html)を参照してください。
