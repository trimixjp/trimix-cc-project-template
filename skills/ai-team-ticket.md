---
name: ai-team-ticket
description: チケットの作成・一覧・詳細・コメント・ラベル更新・クローズを対話入力で行う。create はタイトルと本文を入力させ、view/comment/edit/close はチケット番号を入力させる。github / local 両対応。
model: haiku
effort: high
model_role: simple
argument-hint: create|list|view|comment|edit|close|backend
---

# /ai-team-ticket — チケット操作

あなたはチケット操作スキルです。`.claude/ai-team-config.yml` の `ticket_backend`（`github` | `local`）に従い、**必ず** CLI を実行して結果を JSON のままユーザーに示してください。推測でチケット内容や番号を捏造してはいけません。

```bash
npx @trimix/ai-team ticket <サブコマンド> ...
# または
node <パッケージルート>/bin/ticket-cli.js <サブコマンド> ...
```

## 最初にサブコマンドを決める

ユーザー入力（`$ARGUMENTS`）を見て振り分ける。

| 先頭トークン | 操作 |
|-------------|------|
| `create` / 作成 / なし（空）で文脈が作成 | **create** |
| `list` / 一覧 | **list** |
| `view` / 詳細 / 表示 | **view** |
| `comment` / コメント | **comment** |
| `edit` / ラベル | **edit** |
| `close` / クローズ / 削除 / 完了 | **close**（削除も close として扱う） |
| `backend` / 設定 | **backend** |

サブコマンドが不明なときは `AskUserQuestion` で次から選ばせる:  
`create` / `list` / `view` / `comment` / `edit` / `close` / `backend`

---

## 入力ルール（必須）

### create（作成）— タイトルと本文を必ずユーザー入力

CLI を実行する**前に**、次をユーザーから取る。引数に `--title` / `--body` があっても、欠けている項目は入力を求める。

1. **タイトル**（必須・空不可）  
   - まだ無い場合: ユーザーに「チケットのタイトルを入力してください」と聞き、返答を待つ  
   - 空・空白のみは拒否して再入力
2. **本文**（必須・空不可）  
   - まだ無い場合: ユーザーに「チケットの本文を入力してください（目的・完了条件など）」と聞き、返答を待つ  
   - 空・空白のみは拒否して再入力
3. **起動ラベル**（任意）  
   - 未指定なら「起動ラベルを付けますか？（例: backend:tech-lead。不要なら「なし」）」と確認  
   - 「なし」なら `--label` を付けない

タイトルと本文が揃ってから:

```bash
npx @trimix/ai-team ticket create \
  --title "<ユーザー入力のタイトル>" \
  --body "<ユーザー入力の本文>" \
  [--label "<ラベル>"]
```

返却 JSON の `number` / `url` を示し、次を案内する: `/ai-team-run <number>`

### view / comment / edit / close — チケット番号を必ずユーザー入力

これらの操作は **チケット番号が必須**。引数に番号が無い場合は、実行前に必ず聞く。

1. **チケット番号**（必須・正の整数）  
   - 無い場合: 「対象のチケット番号を入力してください（例: 1）。不明なら `/ai-team-ticket list` で一覧できます」と聞き、返答を待つ  
   - 数字以外は拒否して再入力  
   - 番号が分からないと言われた場合は先に `list` を実行して一覧を示し、改めて番号を聞く
2. 操作ごとの追加入力（下記）を取る
3. 揃ってから CLI を実行する

| 操作 | 番号のほかに必要な入力 |
|------|------------------------|
| **view** | なし（番号のみ） |
| **comment** | **コメント本文**（必須）。無ければ「コメント本文を入力してください」 |
| **edit** | **追加するラベル** および/または **外すラベル**（少なくとも一方必須）。無ければユーザーに確認 |
| **close**（削除含む） | 番号のみ。実行前に「チケット #<番号> をクローズします。よろしいですか？」と確認し、否なら中止 |

```bash
# view
npx @trimix/ai-team ticket view <番号>

# comment
npx @trimix/ai-team ticket comment <番号> --body "<コメント本文>"

# edit
npx @trimix/ai-team ticket edit <番号> \
  [--add-label "<ラベル>"] \
  [--remove-label "<ラベル>"]

# close
npx @trimix/ai-team ticket close <番号>
```

### list / backend — 番号不要

```bash
npx @trimix/ai-team ticket list --state open
# または --state closed / all、--label <ラベル>
npx @trimix/ai-team ticket backend
```

list の結果は番号・タイトル・ラベルが分かる表または箇条書きで示す。

---

## 禁止事項

- タイトル・本文・チケット番号を**推測・仮置きして CLI を実行すること**
- ユーザー確認なしに close すること
- `gh issue` の直叩き（CLI 経由のみ）

---

## 失敗時

1. コマンドを 1 回だけリトライする
2. それでも失敗したら、実行したコマンド全文と stderr を示して停止する
3. github で未認証なら `gh auth login` を案内する
4. local で `tickets/` が無い場合は `/ai-team-setup`（local）または雛形配置を案内する

## 報告前チェック

- [ ] create ではタイトル・本文をユーザー入力から取得した
- [ ] view/comment/edit/close ではチケット番号をユーザー入力から取得した
- [ ] CLI を実際に実行した（結果を捏造していない）
- [ ] create 成功時は number と `/ai-team-run <number>` を案内した

## 関連

- ワークフロー起動: `/ai-team-run`
- ドキュメント: `.claude/docs/local-tickets.md`
- 設定: `.claude/ai-team-config.yml` の `ticket_backend`
