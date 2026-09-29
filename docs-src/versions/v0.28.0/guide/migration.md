# バージョン移行ガイド

`@trimix/ai-team` のバージョンアップ手順をまとめています。

---

## v0.27.0 から v0.28.0 への移行

v0.28.0 では、**検証役ロール `verifier` を新設**し、レビュー・QA・セキュリティ確認などの検証専任エージェント 13 名（16ファイル）を `worker` から `verifier` に変更しました。このアップグレードでは、既存インストールの検証役エージェントが自動で更新されます。

### 破壊的変更

**破壊的変更はありません**。ただし、未編集のエージェント定義ファイルの `model` と `model_role` が変わります（詳細は下記）。

### アップグレード時の変更

#### 未編集のファイル（baseline と一致）

検証役 13 名（16ファイル）の frontmatter が変わります。**全プロファイルで `model_role` が `worker` → `verifier` に** 変わり、**balance プロファイル限定で `model` も `sonnet` → `opus` に** 変わります。

| runtime / プロファイル | model の変更 | model_role の変更 |
|---|---|---|
| claude-code / balance | sonnet → opus | worker → verifier |
| claude-code / high-performance | 不変（opus のまま） | worker → verifier |
| claude-code / low-cost | 不変（sonnet のまま） | worker → verifier |
| grok / balance | 不変（grok-4.5） | worker → verifier |
| grok / high-performance | 不変（grok-4.5） | worker → verifier |
| grok / low-cost | 不変（grok-composer-2.5-fast） | worker → verifier |

対象エージェント（16ファイル）：

- backend・frontend：`reviewer`、`reviewer-a`、`reviewer-b`
- infra：`security-engineer`
- content：`compliance`
- youtube：`render-reviewer`、`script-qa`、`growth-qa`、`affiliate-qa`、`publish-qa`、`sns-qa`、`monetizer-qa`、`channel-producer-qa`

#### 手編集済みのファイル

`# customized: true` マーカーの無い手編集ファイル（例：frontmatter の `model` を直接編集）は、`.new` ファイルが書き出されます。本体は `sonnet` / `worker` のまま保護されます。

アップグレード後、自分の編集を保持しながら新しい仕様を取り込むには：

1. アップグレードが `*.new` ファイルを作成していることを確認
2. `.new` ファイルを編集するエディタで開き、frontmatter（先頭 3～10 行）の `model` と `model_role` だけを確認
3. 本来のファイルを開き、frontmatter の 2 行だけを変更（本文は触らない）

```bash
# 例：backend/agents/reviewer.md の frontmatter をアップグレード適用
# reviewer.md.new を確認 → model: opus, model_role: verifier を採用
# reviewer.md を編集：model と model_role だけを上の 2 行に更新
# .new ファイルは削除
rm .claude/teams/backend/agents/reviewer.md.new
```

### 「更新」と表示されるが model が不変な場合

`upgrade --dry` で以下が表示される場合があります：

```
update (no-baseline) .claude/teams/backend/agents/reviewer.md
```

これは `model_role` が変わるため、アップグレード対象として認識されているのです。**model が不変（high-performance や low-cost など）でも、`model_role` の行が書き直されるため「更新」と表示されるのは正常動作**です。

### 注意：移行手段として推奨しない方法

**`apply-model-profile` を移行手段として使わないことを推奨します。** 理由：

```bash
# ❌ これはしないこと
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime claude-code \
  --profile balance --effort normal --dir .claude
```

手編集済みファイルで `apply-model-profile` を再実行した場合、手編集内容が baseline に記録され（`recordChangedToBaseline` 経路）、次のバージョンアップグレードで保護が外れて上書きされる可能性があります。

### バランスプロファイルでのコスト増

バランスプロファイルを使用している場合、検証役エージェントが `sonnet` から `opus` に変わるため、**トークン消費量が増加します**。特にレビュー・QA が多いプロジェクトでは、月次のコスト見積もりを見直してください。

高コストが課題の場合、以下の選択肢があります：

1. **低コストプロファイルに切り替え**：すべての検証役を `sonnet` に保つ（他の `worker` も `sonnet`）
2. **個別に `model` を編集**：特定の検証役エージェント（例：script-qa）だけ `sonnet` に変える

詳細は [エージェントのカスタマイズ](agents.md) を参照してください。

### アップグレード手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.28.0.tgz
```

#### ステップ 2: 差分確認（ドライラン）

```bash
npx @trimix/ai-team upgrade --dry
```

以下が表示されます：

- `update` または `update (no-baseline)`：16ファイルの検証役エージェント
- `update (edited)`：手編集済みファイル（保護されます）

#### ステップ 3: アップグレード実行

```bash
npx @trimix/ai-team upgrade
```

自動でバックアップが `.ai-team-backups/<日時>/` に作成されます。

#### ステップ 4: 確認事項チェック

- [ ] `npm list @trimix/ai-team` でバージョンが `0.28.0` になっている
- [ ] `upgrade --dry` で想定どおりの16ファイルが「更新」と出た
- [ ] 手編集ファイルがある場合、`.new` ファイルを見比べて frontmatter を適用
- [ ] `.new` ファイルが残っていれば削除（`rm .claude/teams/**/agents/*.new 2>/dev/null`）

### 参考

- [エージェントのカスタマイズ](agents.md)（model 直接編集の詳細）
- [アップグレード](upgrade.html)（upgrade コマンドの仕組み）
- Issue #111（検証役ロール新設の背景）

---

## v0.23.x から v0.24.0 への移行

v0.24.0 で **`upgrade` コマンド**が新設され、`.claude/` 配下のテンプレート（エージェント定義・ワークフロー・DOD など）を最新版へ追随できるようになりました。

### 変更点サマリー

| 変更内容 | 詳細 |
|---------|------|
| `upgrade` コマンドの新設 | `npx @trimix/ai-team upgrade [team_id]` で `.claude/` 配下のテンプレートを更新。`npm install` はスキルとマニュアルしか更新しない |
| アップグレード前の自動バックアップ | 上書き前に `.ai-team-backups/<日時>/` へ退避し SHA-256 で検証。失敗時はアップグレードを実行しない（fail-closed） |
| カスタマイズ上書き保護のバグ修正 | `# customized: true` の保護が `agents/*` / `dod/*` のワイルドカード展開でも効くように修正（データ損失の修正） |

### 移行手順

#### ステップ 1: インストール

```bash
npm install --save-dev ./trimix-ai-team-0.24.0.tgz
```

この時点では、更新されるのはスキル（`.claude/commands/`）と同梱マニュアルのみです。

#### ステップ 2: `upgrade` でテンプレートを最新化

エージェント定義・ワークフロー・DOD などを最新化するには、`upgrade` を実行します。まず差分だけ確認することを推奨します。

```bash
# 差分の確認（書き込み・バックアップとも行わない）
npx @trimix/ai-team upgrade --dry

# 問題なければ適用（適用直前に自動でバックアップが作成されます）
npx @trimix/ai-team upgrade
```

`# customized: true` を持つカスタマイズ済みファイルは保護され、上書きされません。最新テンプレートへ揃えたい場合のみ、内容を確認したうえで `--force` を付けて再実行してください。

> **注意（既知の制限）**: 上書き保護は `# customized: true` マーカーの有無だけで判定します。マーカーの付かない手編集ファイル（例: `agents/*.md` の `model` / `effort` を直接編集したもの）は上書きされます（適用前にバックアップへ退避はされます）。また、保護されたファイルへ最新テンプレートの変更を取り込む組み込み手段は現時点ではありません。詳細と回避手順は [アップグレード](upgrade.html) を参照してください。

#### ステップ 3: 確認事項チェックリスト

- [ ] `npm list @trimix/ai-team` でバージョンが `0.24.0` になっている
- [ ] `upgrade --dry` の差分が想定どおりである（保護されたファイル・上書きされるファイルを確認した）
- [ ] `upgrade` 実行後、`.ai-team-backups/<日時>/` にバックアップが作成されている（適用した場合）

### v0.23.x からの破壊的変更

**破壊的変更はありません**。`npm install`（`postinstall`）の挙動は従来どおりで、スキルとマニュアルのみを展開します。`upgrade` は明示的に実行するコマンドとして追加されたものです。

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
