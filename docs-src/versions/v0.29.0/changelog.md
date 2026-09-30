# v0.29.0 の変更点

## 概要

v0.29.0 では **setup で advisor のモデルを選択できる** ようにしました。Claude Code runtime のときだけ、setup ウィザードで advisor を `fable`（推奨）/ `opus`から選んで個人設定 `.claude/settings.local.json` に記録できます。advisor は実装エージェントが判断に迷ったときに相談する、より強いモデルです。

## 主な変更

### advisor のモデル設定（Issue #115）

**setup ウィザードに質問7 `advisor のモデル` を追加**

v0.28.0 までは、setup で advisor のモデルを設定できませんでした。v0.29.0 では setup 時にウィザードで選べます：

- **fable（推奨）**: 設計・検証を強いモデルに任せる方針の既定値。事前に `/model fable` で利用クレジットへの同意が必要です
- **opus**: 本体が fable のセッションには付きません。性能が high-performance（本体の設計役が fable）のときは、この選択肢を出しません
- **設定しない**: どのファイルも変えません（既存の値も消しません）
- **解除**: `.claude/settings.local.json` に `advisorModel` があるときだけ表示。そのキーだけを削除します

runtime が Claude Code のときだけ質問が出ます。Grok Build では質問しません（advisor は Claude Code の機能のため）。

**advisor コマンドの追加**

`node <パッケージルート>/bin/setup.js advisor` に次のサブコマンドを追加しました。詳細は [設定リファレンス](reference/config.html) を参照してください。

- `advisor check`: 現在の実効値と、値がある場所を表示します（何も書き込みません）
- `advisor apply`: `advisorModel` を設定・解除します。既存の値が違うときは黙って上書きせず、`--overwrite` を付けたときだけ上書きします
- `advisor gitignore`: `.claude/settings.local.json` を `.gitignore` に追記します

**性能との組み合わせ（決定6）**

性能が high-performance のときは opus を選べません。既存の値が opus のまま high-performance にした場合は、値と場所を示して変更するかを尋ねます。

**「設定しない」と `.gitignore`（決定7）**

「設定しない」を選んでも、`.claude/settings.local.json` が既にあり Git 管理外でなければ、`.gitignore` への追記を提案します。同意したときだけ追記し、`advisorModel` は書きません。

### 既存環境への影響

**破壊的変更はありません**。既存の `.claude/settings.local.json` には何も書き込まれません（opt-in）。再度 `/ai-team-setup` を実行すると、「設定の切替のみ」モードで質問0・5・6・7 が出ます。

### 個人設定優先化

`advisorModel` が `.claude/settings.local.json` に設定されている場合、プロジェクト設定・ユーザー設定より優先されます。その結果、`/advisor` コマンドで選んだモデル（ユーザー設定に保存されます）は **効かなくなります**。変更は再 setup か `.claude/settings.local.json` 編集で行ってください。

### その他の改善

**v0.28.0 のマニュアルの不正確さを修正**:
- `skills/setup.md` の質問5（モデル性能）で Grok の説明に verifier を加えた（「Grok では balance / high-performance 時 leader/verifier/worker=grok-4.5…」）
- `guide/migration.md` の v0.28.0 の節にある「16ファイル」は、導入済みのチームの検証役ファイルだけが対象であることを明記（5チームすべてを導入している場合は16ファイル。`upgrade` の対象は導入済みのチームです）

## 関連チケット・参照資料

- Issue #115: setup で advisor のモデル設定を可能に
- Issue #111: 検証役ロール（verifier）の新設（v0.28.0）
- Issue #113: setup の書き込み経路解決確認

## アップグレード手順

```bash
npm install --save-dev ./trimix-ai-team-0.29.0.tgz
```

advisor を設定する場合は、setup ウィザード（「設定の切替のみ」モード）で質問7 に答えてください。詳細は [移行ガイド](guide/migration.html) を参照してください。
