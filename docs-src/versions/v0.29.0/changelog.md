# v0.29.0 の変更点

## 概要

v0.29.0 では **setup で advisor のモデルを選択できる** ようにしました。Claude Code runtime のときだけ、setup ウィザードで advisor を `fable`（推奨）/ `opus`から選んで個人設定 `.claude/settings.local.json` に記録できます。advisor は実装エージェントが判断に迷ったときに相談する、より強いモデルです。

## 主な変更

### advisor のモデル設定（Issue #115）

**setup ウィザードに質問7 `advisor のモデル` を追加**

v0.28.0 では advisor のモデルを `.claude/settings.local.json` に手で書く必要がありました。v0.29.0 では setup 時にウィザードで選べるようになります：

- **fable（推奨）**: 設計・検証を強いモデルに任せる方針の既定値。事前に `/model fable` で利用クレジットへの同意が必要です
- **opus**: バランス型。検証・実装で活躍
- **設定しない**: advisor を設定しません

runtime が Claude Code のときだけ質問が出ます。Grok Build では質問しません（advisor は Claude Code の機能のため）。

### 既存環境への影響

**破壊的変更はありません**。既存の `.claude/settings.local.json` には何も書き込まれません（opt-in）。再度 `/ai-team-setup` を実行すると、「設定の切替のみ」モードで質問7（advisor のモデル）が出ます。

### 個人設定優先化

`advisorModel` が `.claude/settings.local.json` に設定されている場合、プロジェクト設定・ユーザー設定より優先されます。その結果、既に `/advisor` で選んでいたモデル選択は **効かなくなります**。変更は再 setup か `.claude/settings.local.json` 編集で行ってください。

### その他の改善

**v0.28.0 の軽微な不正確さを修正**:
- `skills/setup.md` の質問5（モデル性能）で Grok の説明に verifier を加えた（「Grok では balance / high-performance 時 leader/verifier/worker=grok-4.5…」）
- `guide/migration.md` の「`upgrade --dry` で16ファイルが表示される」が導入済みチームの検証役ファイル対象である点を明確に

## インシデント修正・改善

- #9（`resolveSettings()` は起動フォルダからの読み込みに。Agent SDK の既定動作）を設計に反映
- #4（書き込み経路・読み取り経路の全列挙）に基づき、advisorModel 読み取り対象を 4 か所に明記
- #8（マニュアルリンク検証テスト）で npm test 全件成功を確認
- #2（未コミット変更での destructive git コマンド禁止）で別作業ツリーで実装

## 関連チケット・参照資料

- Issue #115: setup で advisor のモデル設定を可能に
- Issue #111: 検証役ロール（verifier）の新設（v0.28.0）
- Issue #113: setup の書き込み経路解決確認

## アップグレード手順

```bash
npm install --save-dev ./trimix-ai-team-0.29.0.tgz
```

advisor を設定する場合は、setup ウィザード（「設定の切替のみ」モード）で質問7 に答えてください。詳細は [移行ガイド](guide/migration.html) を参照してください。
