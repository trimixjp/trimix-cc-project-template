---
name: ai-team-install
description: ワークフロープラグインをインストールします。引数にチームID（backend/frontend/content/infra）を指定してください。
model: haiku
effort: high
model_role: simple
---

# /ai-team-install — プラグインインストール

引数: `/ai-team-install <team_id>`

あなたはワークフロープラグインのインストール担当です。以下の手順を実行してください。

## ステップ1: 引数の確認

ユーザーが指定した `<team_id>` を確認してください。
指定がない場合は「インストールしたいチームIDを教えてください（例: backend, frontend, content, infra）」と質問してください。

利用可能なチームID:
- `backend` — バックエンドチーム（コード実装・レビュー・PR作成）
- `frontend` — フロントエンドチーム（UI実装・コンポーネント開発）
- `content` — コンテンツチーム（記事・ドキュメント作成）
- `infra` — インフラチーム（クラウド構成・セキュリティ）

> ℹ️ `sns`（SNS運用チーム）と `youtube`（YouTube動画制作チーム）はプラグインパッケージとしては提供されていません（テンプレート同梱配布）。`/ai-team-setup` のチーム選択で追加してください。

## ステップ2: インストールコマンドを実行

Bash ツールで以下を実行してください（`<team_id>` を実際の値に置き換え）：

```bash
npx @trimix/ai-team install <team_id>
```

`npx @trimix/ai-team` が見つからない場合：

```bash
node node_modules/@trimix/ai-team/bin/setup.js install <team_id>
```

## ステップ3: 結果を確認

**成功判定基準（両方を満たした場合のみ成功と報告する）:**

1. インストールコマンドが exit code 0 で終了した
2. チームディレクトリが存在する: `ls .claude/teams/<team_id>/` が成功する

どちらかを満たさない場合は失敗として扱い、「エラー対応」の該当項目を案内してください。

成功した場合、以下を報告してください：

- インストールされたファイルの一覧
- GitHub ラベルの作成結果
- `.claude/ai-team-config.yml` の `target_labels` 更新結果（ソロモード運用の場合）
- エラーがあればその内容と解決策

**報告前チェック:**

- [ ] `ls .claude/teams/<team_id>/` で workflow.yml・agents/ の存在を確認した
- [ ] コマンド出力に未対応のエラー・警告が残っていない

## ステップ4: セットアップを案内

インストール完了後、以下を案内してください：

「インストールが完了しました。次のステップ:
1. `/ai-team-setup` を実行してプロジェクトへのセットアップを完了してください
2. GitHub のラベルが作成されたか確認してください
3. ソロモードの場合、`.claude/ai-team-config.yml` の `target_labels` に新チームのラベルが追加されています
4. `/ai-team-run <Issue番号>` でワークフローを起動できます」

## エラー対応

**共通フォールバック:** コマンドが失敗した場合は1回だけリトライし、それでも失敗する場合は下記の該当項目を案内するか、実行すべきコマンドをそのままユーザーに提示して停止してください（失敗を無視して先に進まない）。

- `team_id が見つかりません` → 正しいチームIDを確認して再実行
- `team_id 衝突エラー` → 既存プラグインを `npx @trimix/ai-team uninstall <team_id>` でアンインストールしてから再実行
- `gh コマンドが見つかりません` → GitHub CLI のインストールを案内（`brew install gh` または公式サイト）
- `カスタマイズ済みのため上書きをスキップ` → 強制上書きする場合は `--force` オプションを使用

```bash
npx @trimix/ai-team install <team_id> --force
```

> ⚠️ `--force` を使うとカスタマイズ済みの `workflow.yml` が上書きされます。事前にバックアップを取ってください。

## 注意事項

- プロジェクトルートで実行してください
- `ai-team-plugins.json` がプロジェクトルートに生成されます（コミット対象）
- `/ai-team-configure` で生成した `workflow.yml` には `# customized: true` が自動付与されます
  - 古いバージョンで生成したファイルには手動で先頭行に `# customized: true` を追記することで上書き保護が有効になります
