---
name: aiticket
description: /ai-team-ticket の短縮エイリアス。チケットの作成・一覧・詳細・コメント・ラベル更新・クローズを対話入力で行います。github / local 両対応。
model: haiku
effort: high
model_role: simple
argument-hint: create|list|view|comment|edit|close|backend
---

# /aiticket — /ai-team-ticket の短縮エイリアス

このスキルは **`/ai-team-ticket` の短縮エイリアス**です。固有の手順は持たず、`/ai-team-ticket` に処理を委譲します。

## 動作

`ai-team-ticket` スキルを、このスキルが受け取った引数 `$ARGUMENTS` をそのまま渡して実行してください。引数が空の場合も、空のまま渡してください（`/ai-team-ticket` 側が操作の選択を促します）。

**第一手段**: Skill ツールで `ai-team-ticket` を呼び出す（引数: `$ARGUMENTS`）。

**フォールバック**: Skill ツールが使えない場合は、`.claude/commands/ai-team-ticket.md` を読み込み、その手順に `$ARGUMENTS` を引数として適用してください。

## 実行例

```
/aiticket list
# → /ai-team-ticket list と同じ

/aiticket view 42
# → /ai-team-ticket view 42 と同じ

/aiticket
# → /ai-team-ticket と同じ（操作の選択を求める）
```

## 手順を複製しないこと

**このファイルに `/ai-team-ticket` の手順を書き写してはいけません。** 正規スキルが更新されたときに内容がドリフトし、どちらが正しいのか判断できなくなります。手順の唯一の正は `skills/ai-team-ticket.md`（配布先では `.claude/commands/ai-team-ticket.md`）です。
