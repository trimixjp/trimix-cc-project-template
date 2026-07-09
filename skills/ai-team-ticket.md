---
name: ai-team-ticket
description: チケットの作成・一覧・詳細・コメント・ラベル更新・クローズを行う。github / local どちらでも共通 CLI 経由で操作する。引数例: create / list / view 1 / comment 1 / edit 1 / close 1 / backend
model: haiku
effort: high
model_role: simple
argument-hint: create|list|view|comment|edit|close|backend [options]
---

# /ai-team-ticket — チケット操作

あなたはチケット操作スキルです。`.claude/ai-team-config.yml` の `ticket_backend`（`github` | `local`）に従い、**必ず**次の CLI を実行して結果を JSON のままユーザーに示してください。推測でチケットを捏造してはいけません。

```bash
# パッケージルートは npm なら node_modules/@trimix/ai-team、ソースならリポジトリルート
npx @trimix/ai-team ticket <サブコマンド> ...
# または
node <パッケージルート>/bin/ticket-cli.js <サブコマンド> ...
```

## 引数

ユーザー入力（`$ARGUMENTS` またはメッセージ末尾）を解析し、次のいずれかに振り分けます。

| 呼び出し例 | 実行する CLI |
|-----------|--------------|
| `/ai-team-ticket create --title "題名" --body "本文"` | `ticket create --title "題名" --body "本文"` |
| `/ai-team-ticket create --title "題名" --body "本文" --label backend:tech-lead` | 同上 + `--label backend:tech-lead`（複数可） |
| `/ai-team-ticket list` | `ticket list --state open` |
| `/ai-team-ticket list --state all` | `ticket list --state all` |
| `/ai-team-ticket list --label backend:tech-lead` | `ticket list --label backend:tech-lead` |
| `/ai-team-ticket view 1` | `ticket view 1` |
| `/ai-team-ticket comment 1 --body "メモ"` | `ticket comment 1 --body "メモ"` |
| `/ai-team-ticket edit 1 --add-label L1 --remove-label L2` | `ticket edit 1 --add-label L1 --remove-label L2` |
| `/ai-team-ticket close 1` | `ticket close 1` |
| `/ai-team-ticket backend` | `ticket backend` |

引数が空、または `create` だけで title が無い場合は、ユーザーにタイトル・本文・付与ラベルを確認してから `create` を実行します。

## サブコマンド手順

### create（作成）

1. `--title` が無ければユーザーに題名を確認する
2. `--body` が無ければ空文字または短い本文を確認する
3. 起動用ラベルがあれば `--label` を付ける（例: `backend:tech-lead`）
4. CLI を実行し、返却 JSON の `number` / `url` をユーザーに伝える
5. 次のアクションを案内する: `/ai-team-run <number>`

```bash
npx @trimix/ai-team ticket create \
  --title "<題名>" \
  --body "<本文>" \
  --label "<任意のラベル>"
```

### list（一覧）

```bash
npx @trimix/ai-team ticket list --state open
```

結果を番号・タイトル・ラベルが分かる表または箇条書きで示す。

### view（詳細）

```bash
npx @trimix/ai-team ticket view <番号>
```

title / body / labels / comments / state / url を整理して表示する。

### comment（コメント）

```bash
npx @trimix/ai-team ticket comment <番号> --body "<本文>"
```

### edit（ラベル）

```bash
npx @trimix/ai-team ticket edit <番号> \
  --add-label "<ラベル>" \
  --remove-label "<ラベル>"
```

### close（クローズ）

```bash
npx @trimix/ai-team ticket close <番号>
```

### backend（設定確認）

```bash
npx @trimix/ai-team ticket backend
```

`ticket_backend` と `local_tickets` を表示する。

## 失敗時

1. コマンドを 1 回だけリトライする
2. それでも失敗したら、実行したコマンド全文と stderr をユーザーに示して停止する
3. `ticket_backend: github` で `gh` 未認証の場合は `gh auth login` を案内する
4. `ticket_backend: local` で `tickets/` が無い場合は `/ai-team-setup` で local を選んだか、雛形配置を案内する

## 報告前チェック

- [ ] 実際に CLI を実行した（結果を捏造していない）
- [ ] create 時は number を明示し、`/ai-team-run <number>` を案内した
- [ ] エラー時はコマンドと出力を残した

## 関連

- ワークフロー起動: `/ai-team-run`
- 詳細ドキュメント: `.claude/docs/local-tickets.md`
- 設定: `.claude/ai-team-config.yml` の `ticket_backend`
