# よくある質問（FAQ）

---

## セットアップ・基本設定

### Q: 複数のチームを同時に使えますか？

**A: はい、使えます。**

`/ai-team-setup` のチーム選択ステップで複数のチームを選択できます。選択したすべてのチームのエージェント・ワークフロー・DOD テンプレートが `.claude/teams/` 配下に展開されます。

```bash
# セットアップウィザードで複数チームを選択
/ai-team-setup
# → backend / frontend / content を同時に選択可能
```

ただし、1 つのチケットを複数チームが同時処理することはできません。Epic チケットを作成して Dispatcher に分解させる方法が適しています（[Dispatcher エージェント](agents/dispatcher.html) 参照）。

---

### Q: ソロモードとマルチユーザーモードはどう使い分けますか？

| モード | 向いているケース |
|--------|----------------|
| **マルチユーザーモード** | 複数人が担当を分担する・タスクのタイミングを自分で制御したい |
| **ソロモード** | 1 人で運用する・チケットが作成されたら即座に自動処理したい |

マルチユーザーモードでは担当者が `/ai-team-run <チケット番号>` を手動実行します。ソロモードでは `/ai-team-watch` が定期的に未処理チケットを検出して自動実行します。

設定は `/ai-team-setup` の再実行または `.claude/ai-team-config.yml` の直接編集で変更できます（[設定ファイル](reference/config.html) 参照）。

---

### Q: GitHub 以外のチケット管理は使えますか？

**A: はい。ローカル Markdown が第一級で使えます。Jira・Linear は制限付きです。**

#### ローカル Markdown（推奨の代替）

setup で `ticket_backend: local` を選ぶと、リポジトリ内の `tickets/*.md` だけで進捗管理できます（GitHub Issues 不要・オフライン可）。操作は共通 CLI です。

```bash
npx @trimix/ai-team ticket create --title "題名" --body "本文"
npx @trimix/ai-team ticket list
/ai-team-run 1
```

非エンジニア向けには **Obsidian で `tickets/` を開く**運用を推奨しています。詳細は [設定ファイル](reference/config.html)・[セットアップ](guide/setup.html)・`.claude/docs/local-tickets.md`。

#### Jira・Linear

`/ai-team-run` にチケットの URL または内容を渡すことで起動は可能ですが、ラベル更新やコメント投稿は GitHub / ローカル CLI ほど自動化されていません。ラベル更新ステップが手動対応になる場合があります。

---

## 作業空間（branch / worktree）

### Q: ワークツリー方式にすると、依存関係を取り直す必要がありますか？

**原則はひとつだけです。「Git が追跡していないものは、ワークツリーには来ない」。**

`git worktree add` はコミット済みのファイルをチェックアウトします。したがって `.gitignore` に入っているものは複製されません。依存パッケージの実体をリポジトリ内に置く言語では取り直しが必要で、リポジトリ外のキャッシュに置く言語では不要です。

| 言語・ツール | ワークツリー作成後にやること | 理由 |
|---|---|---|
| **Go**（モジュール） | **不要**。そのまま `go test ./...` が通る | 依存は `GOMODCACHE`（既定 `$GOPATH/pkg/mod`）、ビルド結果は `GOCACHE` にあり、いずれもリポジトリ外でマシン共有 |
| **Go**（`vendor/` をコミット） | **不要** | `vendor/` は追跡対象なのでワークツリーにも複製される。`go.mod` の `go` が 1.14 以上で `vendor/modules.txt` があれば自動的に `-mod=vendor` として動作する |
| **Go**（`vendor/` を gitignore） | `go mod vendor` を1回 | ワークツリーに `vendor/` が無いため自動 vendor モードに入らない。`-mod=readonly` としてモジュールキャッシュから解決されるので、`-mod=vendor` を明示している Makefile / CI だけが失敗する |
| **Node.js** | `npm ci`（または `pnpm install`） | `node_modules/` はリポジトリ内かつ gitignore されているのが通常 |
| **Python** | 仮想環境の作成（`.venv` がリポジトリ内の場合） | `.venv/` は gitignore されているのが通常。仮想環境をリポジトリ外に置いているなら不要 |
| **Rust** | **不要**（初回ビルドは走る） | 依存は `~/.cargo/registry` で共有。`target/` は gitignore されているため再ビルドになる |

### Q: Go プロジェクトで、ワークツリーを `.claude/worktrees/` に置いて問題ありませんか？

**問題ありません。** go ツールは名前が `.` または `_` で始まるディレクトリを無視します。親リポジトリで `go build ./...` や `go test ./...` を実行しても、ワークツリー内の複製モジュールを拾いません（「同じパッケージが 2 つ見つかった」というエラーは起きません）。

ただし `find` や `grep` で自作したスクリプトは、隠しディレクトリを自動では除外しません。全ファイルを走査する自作ツールがある場合は `.claude/` を除外してください。

### Q: ワークツリー方式で気をつけることは？

言語を問わず、**gitignore されている生成物・設定**が落ちます。よくあるのは次の3つです。

- **`go.work` / `go.work.sum`** — gitignore されがち。マルチモジュール構成でローカルの `replace` が効かなくなります
- **生成コード**（`*.pb.go`、モックなど）をコミットしていない場合 — `go generate ./...` を1回走らせてください
- **`.env` などのローカル設定** — テストがこれらを読む場合は手動でコピーします

---

## ワークフロー・エージェント

### Q: エージェントが間違った実装をした場合どうすればいいですか？

以下の手順で対処してください。

1. チケットのコメントで問題点を指摘し、`escalated:human` ラベルを手動で除去して（または付与後に対応して）ワークフローを再開します。
2. `/ai-team-resume` を実行すると、最後に停止したステップから再開できます。
3. 差し戻しが必要な場合は、チケットのコメントに修正内容を明記してから `/ai-team-run` を再実行してください。エージェントはコメント履歴を読み取り、指摘内容を考慮して処理します。

重大な問題の場合は、PR をマージせずに チケットに「差し戻し理由」をコメントしてください。エスカレーションルール（[エスカレーション](reference/escalation.html) 参照）に従って人間の判断を求めることもできます。

---

### Q: ワークフローをチームごとに独立してカスタマイズできますか？

**A: できます。**

`.claude/teams/<team_id>/workflow.yml` を直接編集するか、`/ai-team-configure <team_id>` ウィザードを使用してください。各チームのワークフローは完全に独立しており、一方を変更しても他のチームには影響しません。

```bash
# バックエンドチームのみカスタマイズ
/ai-team-configure backend
```

詳細は [ワークフローのカスタマイズ](guide/workflow.html) を参照してください。

---

### Q: PR マージのタイミングで人間が承認する必要がありますか？

**A: 常に人間が承認します。**

PR の承認・マージは `.claude/escalation-rules.yml` で `type: merge_approval` として定義されており、AI が自動的にマージすることはありません。PR-Creator エージェントが PR を作成した時点でワークフローが停止し、人間に承認を求めます。

---

## インシデント・記録

### Q: インシデント記録はどこに蓄積されますか？検索できますか？

インシデントは `.claude/incidents/` 配下に蓄積されます。

```
.claude/incidents/
├── index.yml                           # インシデント一覧（自動管理）
├── TEMPLATE.md                         # レポートテンプレート
└── 20260115-db-connection-pool.md      # 個別レポート
```

`index.yml` には `keywords`・`teams`・`severity` などのメタデータが記録されています。次のコマンドでキーワード検索できます。

```bash
# "timeout" に関連するインシデントを検索
grep -r "timeout" .claude/incidents/
```

エージェントは チケット処理開始時に `index.yml` を自動参照して関連インシデントがあれば注意事項として チケットに追記します（[Contributor エージェント](agents/contributor.html) 参照）。

---

## 関連ドキュメント

- [クイックスタート](getting-started.html) — 基本的な使い方
- [インストール](installation.html) — インストール手順
- [スキル一覧](skills/overview.html) — 全コマンドの一覧
- [トラブルシューティング](guide/troubleshooting.html) — エラー対処法
- [設定ファイル](reference/config.html) — 設定ファイルの仕様
