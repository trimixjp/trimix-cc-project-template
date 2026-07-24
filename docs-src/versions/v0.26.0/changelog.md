# v0.26.0 の変更点

**リリース日**: 2026-07-24

## 概要

Opus / Sonnet をオーケストレーターとして使用する場合、委託したサブエージェントが無音停止しても検知できない問題（実績: 約40分間検知不可）に対応しました。バックグラウンドプロセス（`bin/watchdog.js`）とハートビート機構により、モデルの自発的な注意力に依存しない機械的な停止検知と自動再委託を実現しました。

## 新機能

### サブエージェント無音停止検知・自動再委託（点呼・ウォッチドッグ）

- **`bin/watchdog.js`**: heartbeat ファイルと done マーカーの状態を定期監視し、サブエージェントの生存・停止を機械的に判定するプロセス
- **委託監視プロトコル**: サブエージェント委託時の報告契約・ハートビート義務・起床時判定手順を ai-team-run.md に新設
- **`subagent_stall` エスカレーショントリガー**: 再委託上限超過時に人間へ自動エスカレーション
- **`delegation_watchdog` 設定**: `.claude/ai-team-config.yml` に `stall_threshold_minutes`（既定: 10分）・`max_redelegations`（既定: 2回）を追加

## 改善

### 設定・ドキュメント

- `skills/ai-team-run.md` に「委託監視プロトコル（点呼・ウォッチドッグ）」節を新設（委託前手順・プロンプト必須条項・ウォッチドッグ起動・起床時判定手順）
- `skills/ai-team-setup.md` の ai-team-config.yml 生成に `delegation_watchdog` キーを追加
- `templates/docs/workflow-guide.md` に「サブエージェントの無音停止検知」セクションを追加
- `templates/_shared/escalation-rules.yml` に `subagent_stall`（P2 優先度）トリガーを追加

## テスト・品質保証

- `tests/watchdog.test.js`: 22 個の単体テストを追加
  - 正常系: heartbeat 継続更新中は完了を報告しない、done マーカー検出で正常完了判定
  - 停止系（制御群）: heartbeat 放置で無音検出、実プロセスレベルの制御群で検出系が機能する証明
  - 封じ込め検査: heartbeat/done パスが symlink・FIFO・ディレクトリのとき、ハングせず exit 2 で安全側に倒れることを実測
  - CLI: 引数検証・end-to-end テスト・exit コード確認

## 対象環境

- Claude Code（Opus / Sonnet / Fable）での実行に対応
- Grok Build ランタイムでのバックグラウンドプロセス挙動は本バージョンの対象外（未検証）

## 関連ドキュメント

- [/ai-team-run](../skills/run.html) — サブエージェント委託・監視プロトコル
- [エスカレーションルール](../reference/escalation.html) — `subagent_stall` トリガー定義
- [ワークフロー構築ガイド](../guide/workflow.html) — 無音停止検知の仕組み
- [設定ファイル](../reference/config.html) — `delegation_watchdog` 設定項目

## 既知の制限（フォローアップで対応予定）

- 再委託回数のカウント手順（コメント先頭行の機械照合）が差し戻しカウントと同水準に厳密でない（フォローアップで固定テンプレ＋grep コマンドを追加予定）
- `inspectPath` のEACCES 等非 ENOENT 系エラー伝播経路がテスト未カバー（フォローアップでテスト追加予定）
- 既定値（`stall_threshold_minutes` / `max_redelegations`）が複数ドキュメント・設定に一字一句重複記載（SSOT 化をフォローアップで予定）
