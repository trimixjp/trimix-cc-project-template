# @trimix/ai-team とは

`@trimix/ai-team` は、Claude Code を使った AI チームをプロジェクトに導入するセットアップパッケージです。GitHub Issues（または Jira・Linear 等）のチケットをトリガーに、バックエンド・フロントエンド・コンテンツ・インフラの各 AI チームが自律的にタスクを処理します。

`package.json` の `description` には次のように定義されています。

```
AIチームをプロジェクトにセットアップするウィザード
```

このパッケージは 5 つの専門チーム（合計 25 個のエージェント定義）と 8 つの Claude Code スキル（スラッシュコマンド）から構成されており、プロジェクト固有のワークフローを `.claude/teams/<team_id>/workflow.yml` で柔軟に定義できます。

---

## 主な特徴

### 1. 自律的なワークフロー実行

担当者が `/ai-team-run <Issue番号>` を実行するだけで、Tech-Lead → Implementer → Reviewer → Tech-Writer → PR-Creator の順にエージェントが自動で引き継ぎながらタスクを進めます。各エージェントは Issue コメントに作業内容と判断根拠を記録するため、後から作業履歴を追跡できます。

### 2. ソロモード（自動監視）

`/ai-team-watch` を実行すると、GitHub Issues を定期的に監視して新しいタスクを自動検出します。1 人で運用する場合や、新規 Issue を取りこぼしたくない場合に有効です。監視間隔・対象ラベル・スキップラベルは `.claude/ai-team-config.yml` で設定できます。

### 3. 動的なレビュー方式（バックエンド・フロントエンド）

実装内容の影響範囲に応じて、Tech-Lead（または Frontend-Lead）が自動的にシングルレビューとダブルレビューを使い分けます。判定基準は `.claude/teams/<team_id>/review-config.yml` で定義されており、認証・決済・公開 API 等の機密領域は自動的にダブルレビューに切り替わります。

### 4. エスカレーション機構

法的判断・予算承認・PR マージ・仕様の曖昧さなど、AI が判断すべきでない事項に遭遇した場合、エージェントは自動的に `human-escalator` を呼び出して人間にエスカレーションします。人間が対応を完了した後は `/ai-team-resume` で続きから再開できます。

### 5. インシデント記録と再発防止

Contributor エージェントは Issue クローズ時にインシデントとして記録すべき情報がないか調査し、`.claude/incidents/` 配下にインシデントレポートを作成します。次回以降の作業開始時には、各リーダーエージェントが過去のインシデントを参照して「やってはいけないこと」を Issue に追記します。

### 6. ドキュメント自動更新（Tech-Writer）

バックエンドチームでは、PR 作成前に Tech-Writer エージェントが起動し、コードの変更差分を `docs-src/` 配下の Markdown に反映してから `node docs-src/build.js` で `public/docs/` に HTML をビルドします。コードとドキュメントが乖離しない仕組みです。

---

## 対応チーム

5 つのチームに対応しています。詳細は[チーム概要](teams/overview.html)を参照してください。

---

## バージョン情報

- **現行バージョン**: v0.11.0
- **必要な Node.js**: 18.0.0 以上（`engines.node` で定義）
- **配布形式**: npm パッケージ（`.tgz`）
- **ライセンス**: MIT

### v0.11.x シリーズの主な変更点

- v0.11.0: **Opus 最適化と再現性強化**。全エージェントが Claude Opus で動作する前提に最適化（モデルはエイリアス指定。助言役の `architect` のみ frontmatter に `model: opus` を明示）。主な変更:
  - **レビュー方式の機械判定化**: `review-config.yml` の `sensitive_areas` に正規表現 `pattern` を追加し、`detection_procedure`（base_branch 検証 → `git diff` 計測 → パス照合=該当確定 / 本文照合=参考値）で機械的に判定
  - **差し戻し上限 `rework_limit: 2`**: 同一 Issue で 3 回目の不合格は implementer へ差し戻さず `escalated:human` へ。コメント先頭行照合による決定論的カウント（全 5 チーム）
  - **AND 待機のアトミック遷移**: `requires_all_of` 合流時のレースコンディションを防ぐ手順（待機パス再確認・冪等なラベル付与・誤発動ガード付きリカバリ）を全エージェントに導入
  - **`return_to_previous` の構造化**: human-escalator が「エスカレーション元ステップ」を構造化フィールドで記録し、`/ai-team-resume` が機械的に復帰先を決定
  - **人間無応答時のリマインド方針**: 最終エスカレーションコメントから 48 時間経過後に 1 回のみリマインド
  - **エージェント統一規約**: コメント必須 5 フィールド・完了条件（exit criteria）チェックリスト・状態記録の原則を全エージェントに適用
  - **reviewer-a / reviewer-b の観点差別化**: A = 設計・保守性・テスト、B = セキュリティ・パフォーマンス・エラー処理
  - `/ai-team-create`・`/ai-team-configure` の生成器も新規約に対応し、テンプレート整合性テストを追加

### v0.10.x シリーズの主な変更点

- v0.10.0: `/ai-team-create` スキルを追加。会話形式でカスタムチームを新規作成できるウィザード。チームID・エージェント構成・ワークフローを対話的に設計し、`.claude/teams/<team_id>/` 配下に必要なファイル一式（エージェント定義・workflow.yml・review-config.yml・DOD）を自動生成する。`templates/teams/_custom/` にベーステンプレートを追加。

### v0.9.x シリーズの主な変更点

- v0.9.0: `/ai-team-gallery` スキルがソースリポジトリ（`@trimix/ai-team` 自体の開発環境）で失敗していたバグを修正。実行環境を自動判定する 3 段階フォールバック方式を導入。`npm run sync` スクリプトを追加（`templates/` → `.claude/` の自動同期）。

### v0.8.x シリーズの主な変更点

- v0.8.0: ワークフロー設計の汎用化・業務ドメイン別拡張設計ドキュメントを追加。全チームの `workflow.yml` の整合性修正（`on_complete.conditions` 形式統一・`requires_all_of` 統一・`on_escalation` の網羅性向上）。月次ワークフロー見直しの仕組み（Issueテンプレート・GitHub Actions）を追加。

### v0.7.x シリーズの主な変更点

- v0.7.0: SNS運用チームテンプレートを追加（Strategist / Researcher / Writer / Operator の 4 エージェント構成）

### v0.6.x シリーズの主な変更点

- v0.6.0: Version-Bumper ステップをバックエンドワークフローに追加・バージョン管理設定（`ai-team-config.yml` の `version_management`）をサポート

### v0.5.x シリーズの主な変更点

- v0.5.0: ワークフロー設定ウィザード（`/ai-team-configure`）を追加
- v0.5.1: postinstall で全スキルファイルが展開されない問題を修正
- v0.5.2: Mermaid.js によるフローチャート描画対応・マニュアル全体の構造を再編成

`bin/setup.js` で展開される 8 つのスキルファイルは以下のとおりです。

```
ai-team-setup.md
ai-team-run.md
ai-team-watch.md
ai-team-resume.md
ai-team-gallery.md
ai-team-install.md
ai-team-configure.md
ai-team-create.md
```
