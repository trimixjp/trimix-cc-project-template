# /ai-team-ticket — チケット操作

チケットの作成・一覧・詳細・コメント・ラベル更新・クローズを行うスキルです。  
`ticket_backend: github | local` のどちらでも同じ呼び出しで使えます（内部で共通 CLI を実行します）。

> **スキル定義**: `skills/ai-team-ticket.md`  
> **配置先**: `.claude/commands/ai-team-ticket.md`

---

## 使い方

```
/ai-team-ticket create --title "題名" --body "本文" --label backend:tech-lead
/ai-team-ticket list
/ai-team-ticket view 1
/ai-team-ticket comment 1 --body "メモ"
/ai-team-ticket edit 1 --add-label backend:implementer --remove-label backend:tech-lead
/ai-team-ticket close 1
/ai-team-ticket backend
```

---

## サブコマンド

| サブコマンド | 説明 |
|-------------|------|
| `create` | チケット作成。`--title` 必須。`--body` / `--label` 任意 |
| `list` | 一覧（`--state open|closed|all` / `--label`） |
| `view <番号>` | 詳細（本文・ラベル・コメント） |
| `comment <番号>` | コメント追加（`--body`） |
| `edit <番号>` | ラベル更新（`--add-label` / `--remove-label`） |
| `close <番号>` | クローズ |
| `backend` | 現在の `ticket_backend` 設定を表示 |

---

## 初回タスクの例

```
/ai-team-ticket create --title "ログインAPIにレート制限を追加する" --body "## 目的
レート制限を実装する
" --label backend:tech-lead
```

返ってきた番号でワークフローを起動します。

```
/ai-team-run 1
```

---

## CLI との関係

スキルは内部で次と同等の処理を行います。

```bash
npx @trimix/ai-team ticket <サブコマンド> ...
```

シェルから直接実行する場合も同じ CLI を使えます。エージェント・スキル間の操作は **このスキルまたは CLI に統一**し、`gh issue` の直叩きはしません。

---

## 関連

- [ai-team-run](run.html) — ワークフロー起動
- [クイックスタート](../getting-started.html) — 初回チケット作成手順
- [設定ファイル](../reference/config.html) — `ticket_backend`
- プロジェクト内 `.claude/docs/local-tickets.md`
