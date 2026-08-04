---
name: airun
description: /ai-team-run の短縮エイリアス。チケットを読み込み、AIチームのワークフローを起動します。引数にチケットのURLまたはIDを指定してください。
model: opus
effort: high
model_role: leader
argument-hint: <チケットURL または チケットID>
---

# /airun — /ai-team-run の短縮エイリアス

このスキルは **`/ai-team-run` の短縮エイリアス**です。固有の手順は持たず、`/ai-team-run` に処理を委譲します。

## 動作

`ai-team-run` スキルを、このスキルが受け取った引数 `$ARGUMENTS` をそのまま渡して実行してください。引数が空の場合も、空のまま渡してください（`/ai-team-run` 側がチケットの入力を促します）。

**第一手段**: Skill ツールで `ai-team-run` を呼び出す（引数: `$ARGUMENTS`）。

**フォールバック**: Skill ツールが使えない場合は、`.claude/commands/ai-team-run.md` を読み込み、その手順に `$ARGUMENTS` を引数として適用してください。

## 実行例

```
/airun 42
# → /ai-team-run 42 と同じ

/airun https://github.com/.*/issues/42
# → /ai-team-run https://github.com/.*/issues/42 と同じ

/airun
# → /ai-team-run と同じ（チケット情報の入力を求める）
```

## 手順を複製しないこと

**このファイルに `/ai-team-run` の手順を書き写してはいけません。** 正規スキルが更新されたときに内容がドリフトし、どちらが正しいのか判断できなくなります。手順の唯一の正は `skills/ai-team-run.md`（配布先では `.claude/commands/ai-team-run.md`）です。
