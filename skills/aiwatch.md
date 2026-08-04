---
name: aiwatch
description: /ai-team-watch の短縮エイリアス。ソロモード用に、チケットを定期監視して新しいタスクを自動検出しワークフローを実行します。
model: opus
effort: high
model_role: leader
---

# /aiwatch — /ai-team-watch の短縮エイリアス

このスキルは **`/ai-team-watch` の短縮エイリアス**です。固有の手順は持たず、`/ai-team-watch` に処理を委譲します。

## 動作

`ai-team-watch` スキルを、このスキルが受け取った引数 `$ARGUMENTS` をそのまま渡して実行してください（`/ai-team-watch` は通常引数を取りませんが、将来オプションが追加された場合に備えて素通しします）。

**第一手段**: Skill ツールで `ai-team-watch` を呼び出す（引数: `$ARGUMENTS`）。

**フォールバック**: Skill ツールが使えない場合は、`.claude/commands/ai-team-watch.md` を読み込み、その手順に従ってください。

## 実行例

```
/aiwatch
# → /ai-team-watch と同じ（チケットの定期監視を開始）
```

## 手順を複製しないこと

**このファイルに `/ai-team-watch` の手順を書き写してはいけません。** 正規スキルが更新されたときに内容がドリフトし、どちらが正しいのか判断できなくなります。手順の唯一の正は `skills/ai-team-watch.md`（配布先では `.claude/commands/ai-team-watch.md`）です。
