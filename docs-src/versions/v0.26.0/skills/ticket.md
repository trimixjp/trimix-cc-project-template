# /ai-team-ticket — チケット操作

チケットの作成・一覧・詳細・コメント・ラベル更新・クローズを行うスキルです。  
`ticket_backend: github | local` のどちらでも同じ呼び出しで使えます。

> **スキル定義**: `skills/ai-team-ticket.md`  
> **配置先**: `.claude/commands/ai-team-ticket.md`

---

## 使い方

```
/ai-team-ticket create
/ai-team-ticket list
/ai-team-ticket view
/ai-team-ticket comment
/ai-team-ticket edit
/ai-team-ticket close
/ai-team-ticket backend
```

引数で全部渡すこともできますが、**足りない項目はスキルが対話で入力を求めます**。

---

## 入力の決まり

| 操作 | ユーザーが入力するもの |
|------|------------------------|
| **create** | **タイトル**（必須）と **本文**（必須）。起動ラベルは任意 |
| **view** | **チケット番号**（必須） |
| **comment** | **チケット番号** と **コメント本文** |
| **edit** | **チケット番号** と追加/削除するラベル |
| **close**（削除含む） | **チケット番号**（実行前に確認あり） |
| **list** / **backend** | 番号不要 |

### 作成の流れ（例）

```
ユーザー: /ai-team-ticket create
スキル: チケットのタイトルを入力してください
ユーザー: ログインAPIにレート制限を追加する
スキル: チケットの本文を入力してください
ユーザー: （目的・完了条件など）
スキル: 起動ラベルは？（例: backend:tech-lead / なし）
ユーザー: backend:tech-lead
→ CLI 実行 → 番号 1 を表示 → /ai-team-run 1 を案内
```

### クローズの流れ（例）

```
ユーザー: /ai-team-ticket close
スキル: 対象のチケット番号を入力してください
ユーザー: 1
スキル: チケット #1 をクローズします。よろしいですか？
ユーザー: はい
→ CLI 実行
```

---

## サブコマンド一覧

| サブコマンド | 説明 |
|-------------|------|
| `create` | 作成（タイトル・本文を対話入力） |
| `list` | 一覧 |
| `view` | 詳細（番号を対話入力） |
| `comment` | コメント（番号・本文） |
| `edit` | ラベル更新（番号・ラベル） |
| `close` | クローズ（番号・確認） |
| `backend` | 設定確認 |

---

## CLI との関係

スキルは内部で次と同等です。

```bash
npx @trimix/ai-team ticket <サブコマンド> ...
```

---

## 関連

- [ai-team-run](run.html) — ワークフロー起動
- [クイックスタート](../getting-started.html)
- [設定ファイル](../reference/config.html) — `ticket_backend`
