# バージョン移行ガイド

`@trimix/ai-team` のバージョンアップ手順をまとめています。

---

## モデル・effort プロファイル / runtime 導入後の移行

エージェント定義とスキルに `model` / `effort` / `model_role` が入り、実行基盤 `runtime`（`claude-code` | `grok`）を選べるようになりました。既存プロジェクトを更新する場合:

1. パッケージを更新し、`templates/_shared/model-profiles.yml` を `.claude/model-profiles.yml` に配置する
2. `.claude/ai-team-config.yml` に次を追加する（推奨既定）:
   - `runtime: claude-code`
   - `model_performance: balance`
   - `effort_depth: normal`
3. 一括反映する:

```bash
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime claude-code \
  --profile balance --effort normal --dir .claude
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime claude-code \
  --profile balance --effort normal --dir .claude/commands --skills-only
```

Grok に切り替える場合は `--runtime grok` を使い、`AGENTS.md` と（hooks 利用時）`.grok/hooks/ensure-issue.json` を setup 手順どおり配置してください。

**細かい設定は md ファイルの変更で可能です。** 既に個別で `model` を書いている場合は、apply 前にバックアップするか、apply 後に再編集してください。  
カスタマイズの詳細は [エージェントのカスタマイズ](agents.md) を参照。
---

## v0.21.x から v0.22.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| 同梱ドキュメントディレクトリのリネーム | npm 配布物に同梱するドキュメントディレクトリを `public/` から `ai-team-manual/` に変更（`package.json` の `files`）。**破壊的変更** |
| postinstall 展開先の変更 | `bin/postinstall.js` がドキュメントを展開する先を、導入先プロジェクトの `public/` から `ai-team-manual/` に変更。**破壊的変更** |
| ルート index のバージョン追従化 | ルート `ai-team-manual/index.html`（最新版ドキュメントへのリダイレクト）を `docs-src/build.js` の生成対象に追加。`config.latest` へ自動追従するため、バージョンアップ時の手動更新が不要に |

### 背景

`public/` は、多くのプロジェクトでビルド出力ディレクトリやホスティングの公開ルートとして使われる一般的な名前です。本パッケージがこの名前でドキュメントを展開すると、導入先が自前で使っている `public/` と衝突するおそれがありました。この衝突を避けるため、専用の `ai-team-manual/` にリネームしました。

あわせて、これまで手動で管理していたルートのリダイレクト用 index をビルド生成（`docs-src/build.js`）に一本化し、バージョンアップ時に入口が旧バージョンを指したまま取り残される問題も解消しています。

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.22.0.tgz
```

インストール時、ドキュメントは導入先プロジェクトの `ai-team-manual/` に展開されます（従来の `public/` には展開されなくなります）。

#### ステップ 2: 旧 `public/docs/` の削除（任意）

本パッケージが過去（v0.21.x 以前）に展開した `public/docs/` が導入先に残っている場合、本パッケージはそれを自動削除しません（導入先の資産を誤って削除しないための安全側の挙動です）。不要であれば手動で削除して構いません。

```bash
rm -rf public/docs/
```

> **注意**: 導入先が自前で `public/` を別用途に使っている場合は、本変更によって本パッケージとの名前の衝突が解消されます。`public/` 配下のうち、本パッケージが展開した `docs/` 以外のファイルには触れないでください。

#### ステップ 3: 確認事項チェックリスト

- [ ] `npm list @trimix/ai-team` でバージョンが `0.22.0` になっている
- [ ] ドキュメントが導入先プロジェクトの `ai-team-manual/docs/` に展開されている
- [ ] ルート `ai-team-manual/index.html` が最新バージョンのドキュメントへリダイレクトする

### v0.21.x からの破壊的変更

**破壊的変更があります**。npm 配布物の同梱ディレクトリ名（`public/` → `ai-team-manual/`）と postinstall の展開先が変わります。導入先に残る旧 `public/docs/` は自動削除されないため、必要に応じて手動で削除してください。また、リポジトリ外（ホスティングの管理画面など）で公開ルートを `public/` に設定している場合は、別途 `ai-team-manual/` へ追従させる必要があります。

---

## v0.11.x から v0.12.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| YouTube動画制作チームの機構強化 | テンプレートを v1.1.0 に更新。6 つの新機構（多言語メタ・gallery 型・縦 Shorts 自動 UP・X／TikTok 配信・yt-episode 統括フロー・予約再スケジュール）を追加 |
| 新機構の有効化 | いずれも `channel.yaml` の任意フィールド（`upload.shorts_upload`・`social.enabled`・`social.tiktok.enabled`・`subtitles.targets`）で有効化。**未設定なら従来どおり動作**（後方互換） |
| registry.json の更新 | youtube プラグインの version を 1.0.0 → 1.1.0 に更新。tags に `shorts`／`localization`／`tiktok` を追加 |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.12.0.tgz
```

#### ステップ 2: YouTube テンプレートの更新（youtube チーム利用時のみ）

YouTube動画制作チームを導入済みのプロジェクトでは、`/ai-team-install youtube` を再実行するとテンプレート v1.1.0 が反映されます。

> **注意**: `# customized: true` コメントがあるファイルは上書きされません。カスタマイズ済みの `.claude/teams/youtube/` に新機構を取り込みたい場合は、`PRODUCTION-GUIDE.md`・各エージェント定義・`workflow.yml`・`dod/` の差分を手動で反映してください。

#### ステップ 3: 確認事項チェックリスト

- [ ] `npm list @trimix/ai-team` でバージョンが `0.12.0` になっている
- [ ] `registry.json` の youtube プラグインが version `1.1.0` になっている
- [ ] 新機構を使う場合のみ、`channel.yaml` に対応するスイッチ（`upload.shorts_upload`・`social.enabled`・`social.tiktok.enabled`）を設定する

### v0.11.x からの破壊的変更

**破壊的変更はありません**。YouTube の新機構はすべて `channel.yaml` の任意フィールドで有効化する後方互換の設計のため、設定を変更しなければ既存チャンネルの挙動は変わりません。youtube チームを導入していないプロジェクトには影響しません。

---

## v0.10.x から v0.11.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| Opus 最適化 | 全エージェント定義が Claude Opus で動作する前提に最適化。モデルはエイリアス指定（`architect` のみ `model: opus` を明示） |
| レビュー方式の機械判定化 | `review-config.yml` の `sensitive_areas` に正規表現 `pattern` を追加。`detection_procedure`（base_branch 検証・git diff 計測・パス照合=確定 / 本文照合=参考値）で機械判定 |
| 差し戻し上限 | `workflow.yml` に `rework_limit: 2` と `on_rework.limit_exceeded_next` を追加（全 5 チーム）。3 回目の不合格は `escalated:human` へ。先頭行照合による決定論的カウント |
| AND 待機のアトミック遷移 | `requires_all_of` 合流時のレースコンディション対策（待機パス再確認・冪等付与・誤発動ガード付きリカバリ） |
| `return_to_previous` の構造化 | human-escalator が「エスカレーション元ステップ」を構造化フィールドで記録し、`/ai-team-resume` が機械的に復帰 |
| リマインド方針 | 人間無応答時、48 時間経過後に 1 回のみリマインドコメントを投稿 |
| エージェント統一規約 | コメント必須 5 フィールド・完了条件（exit criteria）・状態記録の原則を全エージェントに適用 |
| レビュアー観点差別化 | Reviewer-A = 設計・保守性・テスト、Reviewer-B = セキュリティ・パフォーマンス・エラー処理 |
| 生成器の新規約対応 | `/ai-team-create`・`/ai-team-configure` が生成するファイルも新規約に準拠。テンプレート整合性テストを追加 |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.11.0.tgz
```

#### ステップ 2: セットアップウィザードを再実行

機械判定（`pattern` / `detection_procedure`）・`rework_limit`・統一規約は `.claude/teams/` 配下のテンプレート更新で反映されるため、`/ai-team-setup` の再実行を推奨します。

> **注意**: `# customized: true` コメントがあるファイルは上書きされません。カスタマイズ済みの workflow.yml / review-config.yml に新フィールドを反映したい場合は、手動で `rework_limit: 2`・`limit_exceeded_next`・`pattern`・`detection_procedure` を追記してください。

#### ステップ 3: 確認事項チェックリスト

- [ ] `npm list @trimix/ai-team` でバージョンが `0.11.0` になっている
- [ ] 各チームの `workflow.yml` に `rework_limit: 2` が存在する
- [ ] backend / frontend の `review-config.yml` に `detection_procedure` と `sensitive_areas[].pattern` が存在する
- [ ] `.claude/agents/human-escalator.md` のエスカレーションコメント形式に「エスカレーション元ステップ」フィールドが含まれている
- [ ] `detection_procedure.base_branch` がプロジェクトのデフォルトブランチと一致している（`main` 以外の場合は変更）

### v0.10.x からの破壊的変更

ワークフローの構造に**破壊的変更はありません**。ただし旧形式のエスカレーションコメント（「エスカレーション元ステップ」フィールドなし）が残っている チケットでは、`/ai-team-resume` が復帰先を機械的に決定できないため、コメント履歴から文脈で判断するフォールバック動作になります。

---

## v0.6.x から v0.7.0 への移行

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| SNS運用チームの追加 | Strategist / Researcher / Writer / Operator の 4 エージェント構成のテンプレートが新規追加 |
| チケット強制チェック（hooks）オプション | セットアップ時に `UserPromptSubmit` フックで変更系指示をブロックする設定を選択可能に |
| `.gitignore` の自動更新 | セットアップ時に `.claude/` 配下の個人設定ファイルを `.gitignore` から除外するパターンを追記 |

---

### 移行手順

#### ステップ 1: 新しい `.tgz` を入手してインストール

配布された `trimix-ai-team-0.7.0.tgz` をプロジェクトルートに配置してインストールします。

```bash
npm install --save-dev ./trimix-ai-team-0.7.0.tgz
```

インストール完了メッセージでスキルファイルが展開されたことを確認してください（現行は 9 件。`/ai-team-ticket` を含む）。

---

#### ステップ 2: セットアップウィザードを再実行（オプション）

SNS チームを追加したい場合や、hooks による チケット強制チェックを有効にしたい場合は、`/ai-team-setup` を再実行してください。

```
/ai-team-setup
```

> **注意**: 既存チームのワークフロー・エージェント定義（`.claude/teams/` 配下）は、ファイルに `# customized: true` コメントがある場合は上書きされません。カスタマイズ済みの設定は保持されます。

---

#### ステップ 3: 確認事項チェックリスト

移行後に以下を確認してください。

- [ ] `npm list @trimix/ai-team` でバージョンが `0.7.0` になっている
- [ ] `.claude/commands/` に 7 つのスキルファイルが存在する
- [ ] 既存チームのワークフロー定義（`.claude/teams/*/workflow.yml`）が想定通りの内容になっている
- [ ] SNS チームを追加した場合、`.claude/teams/sns/` が正しく展開されている
- [ ] hooks を有効にした場合、`.claude/hooks/ensure-issue.sh` が存在し、`.claude/settings.json` に登録されている

---

### v0.6.x からの破壊的変更

v0.6.x から v0.7.0 への変更に**破壊的変更はありません**。既存のワークフロー・エージェント・設定ファイルはそのまま動作します。

---

## v0.5.x から v0.6.0 への移行（参考）

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| Version-Bumper ステップの追加 | バックエンドワークフローに `version-bumper` ステップが追加（Reviewer 合格後に `package.json` を自動更新） |
| バージョン管理設定 | `ai-team-config.yml` に `version_management` フィールドを追加（`auto` / `manual` を選択） |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.6.0.tgz
```

#### ステップ 2: `ai-team-config.yml` に `version_management` を追加

v0.5.x では `version_management` フィールドが存在しないため、手動で追加する必要があります。

```yaml
# .claude/ai-team-config.yml に追記
version_management: manual  # または auto
```

`auto` を選択すると、Reviewer 合格後に conventional commit に基づき `package.json` のバージョンが自動インクリメントされます。

#### ステップ 3: 確認事項チェックリスト

- [ ] `ai-team-config.yml` に `version_management` フィールドが存在する
- [ ] バックエンドワークフローの `steps` に `version-bumper` ステップが含まれている（`auto` 選択時）

---

## バージョン履歴

| バージョン | 主な変更内容 |
|-----------|------------|
| v0.11.0 | Opus 最適化と再現性強化（レビュー機械判定・`rework_limit`・アトミック遷移・`return_to_previous` 構造化・統一規約） |
| v0.10.0 | `/ai-team-create` スキル追加（カスタムチーム作成ウィザード） |
| v0.9.0 | `/ai-team-gallery` の実行環境判定バグ修正・`npm run sync` 追加 |
| v0.8.0 | ワークフロー設計の汎用化・全チーム workflow.yml の整合性修正・月次見直しの仕組み追加 |
| v0.7.0 | SNS運用チーム追加・hooks による チケット強制チェック・`.gitignore` 自動更新 |
| v0.6.0 | Version-Bumper ステップ追加・バージョン管理設定サポート |
| v0.5.2 | Mermaid.js 対応・マニュアル全体の構造再編成 |
| v0.5.1 | postinstall でスキルファイルが展開されない問題を修正 |
| v0.5.0 | ワークフロー設定ウィザード（`/ai-team-configure`）を追加 |

---

## 関連ドキュメント

- [インストール](../installation.html) — インストール手順の詳細
- [セットアップガイド](setup.html) — `/ai-team-setup` の詳細
- [設定ファイル](../reference/config.html) — `ai-team-config.yml` の全フィールド
