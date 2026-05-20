---
name: ai-team-install
description: ワークフロープラグインをインストールします。引数にチームID（backend/frontend/content/infra）を指定してください。
---

# /ai-team install — プラグインインストール

引数: `/ai-team install <team_id>`

あなたはワークフロープラグインのインストール担当です。以下の手順を実行してください。

## ステップ1: 引数の確認

ユーザーが指定した `<team_id>` を確認してください。
指定がない場合は「インストールしたいチームIDを教えてください（例: backend, frontend, content, infra）」と質問してください。

利用可能なチームID:
- `backend` — バックエンドチーム（コード実装・レビュー・PR作成）
- `frontend` — フロントエンドチーム（UI実装・コンポーネント開発）
- `content` — コンテンツチーム（記事・ドキュメント作成）
- `infra` — インフラチーム（クラウド構成・セキュリティ）

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

実行結果を確認して以下を報告してください：

- インストールされたファイルの一覧
- GitHub ラベルの作成結果
- `.claude/ai-team-config.yml` の `target_labels` 更新結果（ソロモード運用の場合）
- エラーがあればその内容と解決策

## ステップ4: セットアップを案内

インストール完了後、以下を案内してください：

「インストールが完了しました。次のステップ:
1. `/ai-team setup` を実行してプロジェクトへのセットアップを完了してください
2. GitHub のラベルが作成されたか確認してください
3. ソロモードの場合、`.claude/ai-team-config.yml` の `target_labels` に新チームのラベルが追加されています
4. `/ai-team run <Issue番号>` でワークフローを起動できます」

## エラー対応

- `team_id が見つかりません` → 正しいチームIDを確認して再実行
- `team_id 衝突エラー` → 既存プラグインを `/ai-team uninstall` してから再実行
- `gh コマンドが見つかりません` → GitHub CLI のインストールを案内（`brew install gh` または公式サイト）
- `カスタマイズ済みのため上書きをスキップ` → 強制上書きする場合は `--force` オプションを使用

```bash
npx @trimix/ai-team install <team_id> --force
```

> ⚠️ `--force` を使うとカスタマイズ済みの `workflow.yml` が上書きされます。事前にバックアップを取ってください。

## 注意事項

- プロジェクトルートで実行してください
- `ai-team-plugins.json` がプロジェクトルートに生成されます（コミット対象）
- `/ai-team configure` で生成した `workflow.yml` には `# customized: true` が自動付与されます
  - 古いバージョンで生成したファイルには手動で先頭行に `# customized: true` を追記することで上書き保護が有効になります
