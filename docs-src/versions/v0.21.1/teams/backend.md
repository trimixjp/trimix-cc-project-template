# バックエンドチーム

バックエンドチームは、コード実装・テスト・レビュー・ドキュメント更新・PR 作成までを自律的に行う AI チームです。実装内容の影響範囲に応じて、シングルレビュー / ダブルレビューを自動で使い分ける仕組みが特徴です。

> **ワークフロー定義**: `.claude/teams/backend/workflow.yml`
> **レビュー判定**: `.claude/teams/backend/review-config.yml`
> **エージェント定義**: `.claude/teams/backend/agents/*.md`
> **DOD テンプレート**: `.claude/teams/backend/dod/*.md`

---

## エージェント一覧

| エージェント | 役割 | ラベル |
|------------|------|--------|
| `tech-lead` | リーダー。要件分析・設計方針決定・レビュー方式判断 | `backend:tech-lead` |
| `implementer` | 実装担当。Tech-Lead の方針に従いコード・テストを実装 | `backend:implementer` |
| `reviewer` | シングルレビュー担当 | `backend:reviewer` |
| `reviewer-a` | ダブルレビュー A 担当（独立レビュー + クロスレビュー） | `backend:reviewer-a` |
| `reviewer-b` | ダブルレビュー B 担当（独立レビュー + クロスレビュー） | `backend:reviewer-b` |
| `version-bumper` | バージョン管理担当。conventional commit に基づき `package.json` を自動インクリメント | `backend:version-bumper` |
| `tech-writer` | ドキュメント更新担当。`docs-src/` 更新と `build.js` 実行 | `backend:tech-writer` |
| `pr-creator` | プルリクエスト作成担当 | `backend:pr-creator` |

各エージェントの詳細は各 agents/ ページを参照してください。

---

## ワークフロー全体フロー

```mermaid
flowchart TD
    A(["/ai-team-run &lt;番号&gt;"]) --> B["tech-lead\n要件分析・設計方針決定\nインシデント確認"]
    B --> C["implementer\n実装・テスト\n完了報告"]
    C --> D["tech-lead\nレビュー方式判断\nreview-config.yml 参照"]
    D --> E{レビュー方式}
    E -->|シングルレビュー| F["reviewer\nシングルレビュー"]
    E -->|ダブルレビュー| G["reviewer-a\n独立レビュー"]
    E -->|ダブルレビュー| H["reviewer-b\n独立レビュー"]
    G --> I["cross-review\nrequires: a + b\n最終判定"]
    H --> I
    F -->|合格| VB["version-bumper\npackage.json 更新\nauto/manual 選択"]
    I -->|合格| VB
    F -->|不合格| C
    I -->|不合格| C
    VB --> J["tech-writer\ndocs-src/ 更新\nbuild.js 実行"]
    J --> K["pr-creator\ngh pr create\nescalated:human"]
    K --> L["⏸️ human-merge-approval\n人間がマージ"]
    L --> M["contributor-close\nDOD 確認\nインシデント記録\nIssue クローズ"]
```

---

## レビュー方式の自動判断

Tech-Lead が Implementer の完了報告を確認した後、`.claude/teams/backend/review-config.yml` の `double_review_criteria` に基づいてレビュー方式を判断します。

### ダブルレビュー判定基準（いずれか 1 つでも該当）

| 基準 | しきい値 |
|------|---------|
| 変更ファイル数 | 5 ファイル以上 |
| 機密領域への変更 | 認証・認可・決済・個人情報・DB スキーマ・公開 API・セキュリティ設定 |
| クロスレイヤー変更 | DB / API / Frontend の複数レイヤーにまたがる |
| 危険ラベル | `complexity:high` / `security-sensitive` / `breaking-change` |

### シングルレビュー判定基準（すべてに該当）

- 単一ファイルの変更
- ドキュメント・コメントのみの変更
- テストの追加（実装ロジックの変更なし）
- 設定値・定数の変更（アルゴリズムの変更なし）
- スタイル・フォーマットの修正

### 機密領域の判定キーワード

`review-config.yml` の `sensitive_areas` で定義：

| 領域 | キーワード |
|------|----------|
| 認証・認可 | auth / login / session / token / JWT |
| 決済・課金 | payment / billing / stripe / invoice |
| 個人情報 | user / password / email / PII |
| DB スキーマ | migration / schema |
| 公開 API | エンドポイントの追加・削除・破壊的変更 |
| セキュリティ設定 | cors / csrf / rate-limit / firewall |

### 機械判定手順（v0.11.0）

v0.11.0 から、Tech-Lead は主観で判定せず、`review-config.yml` の `detection_procedure` に定義されたコマンドを実行して計測値で判定します。

1. **verify-base**: 基準ブランチ（`base_branch`）の存在を `git rev-parse --verify` で確認（失敗時は安全側に倒しダブルレビュー）
2. **file-count**: `git diff --name-only <base_branch>...HEAD | wc -l` で変更ファイル数を計測
3. **path-match（該当確定）**: 変更ファイルのパスを各 `sensitive_areas` の `pattern`（単語境界付き正規表現）と照合。マッチ行数 1 以上で該当確定
4. **body-match（参考値）**: 差分の追加行の内容を pattern と照合。結果は記録のみで該当判定には使わない

計測値（ファイル数・ヒットした pattern と件数）はレビュー方式判断コメントに必ず記載されます。詳細は[設定ファイル](../reference/config.html)を参照してください。

---

## ダブルレビューの仕組み

ダブルレビューは「独立レビュー → クロスレビュー」の 2 段階で行われます。

### 段階 1: 独立レビュー（並列実行）

```
reviewer-a と reviewer-b が並列起動
  - お互いのコメントは読まない
  - それぞれが Tech-Lead の方針と Implementer の実装をレビュー
  - 暫定判定コメントを投稿
```

各レビュアーは Reviewer-A / Reviewer-B として独立して動作し、`workflow.yml` の `parallel_with` 設定で並列実行が宣言されています。

**観点の差別化（v0.11.0）**: 両者は `review-config.yml` の `review_criteria`（共通チェックリスト）を全項目確認したうえで、以下の観点を重点的に深掘りします。観点を分担することで独立並列レビューの価値を高めます。

| レビュアー | 重点観点 |
|-----------|---------|
| Reviewer-A | 設計との整合・保守性・テスト |
| Reviewer-B | セキュリティ・パフォーマンス・エラー処理 |

### 段階 2: クロスレビュー

```
両者完了後、reviewer-a がクロスレビューをリード
  - requires: [reviewer-a, reviewer-b] で両者完了を待つ
  - 指摘の差異を比較・議論
  - 最終判定（合格 / 不合格 / エスカレーション）を投稿
```

両者の意見が割れて判断できない場合は `human-escalator` を呼び出します。

---

## レビュー結果による分岐

レビューの結果に応じて次のステップが決まります。

| 結果 | 次のステップ |
|------|------------|
| 合格 | `version-bumper` |
| 不合格 | `implementer`（差し戻し、`on_rework`） |
| 不合格（3 回目 = `rework_limit: 2` 超過） | `human-escalator`（差し戻さずエスカレーション） |
| 意見不一致（ダブルレビュー） | `human-escalator` |

### 差し戻し上限と決定論的カウント（v0.11.0）

`workflow.yml` の `rework_limit: 2` により、同一 Issue での差し戻しは 2 回までです。3 回目の不合格は implementer へ差し戻さず `escalated:human` へエスカレーションします。

カウントは決定論的です。差し戻しコメントの**先頭行**を `❌ <エージェント名>: 差し戻し（差し戻し回数: n/2）` 形式に固定し、レビュー役エージェントが `gh api` でコメント先頭行のみを正規表現照合して数えます。本文中の引用による偽陽性はありません。独立レビューの暫定結果コメントは先頭行に「差し戻し」という語を使わないルールになっています（誤検出防止）。

---

## Version-Bumper のバージョン管理

レビュー合格後、Version-Bumper が起動して `package.json` のバージョンを管理します。動作は `.claude/ai-team-config.yml` の `version_management` 設定で制御されます。

| 設定値 | 動作 |
|-------|------|
| `auto` | conventional commit を解析して自動インクリメント |
| `manual` | スキップして Tech-Writer へ引き継ぎ |

### auto モードの判定ルール

| コミット種別 | バージョン種別 |
|-------------|--------------|
| `BREAKING CHANGE:` / `feat!:` | major（X.0.0） |
| `feat:` | minor（x.Y.0） |
| `fix:` / `docs:` / `chore:` / `refactor:` / `test:` | patch（x.y.Z） |

複数種別が混在する場合は最も高いものを採用します（major > minor > patch）。

### 判定対象とするコミット範囲の決め方（多段フォールバック）

バージョン種別を判定する際、Version-Bumper は「履歴全体」ではなく「前回のバージョンアップ以降に追加されたコミットだけ」を解析対象にします。過去のリリースで取り込み済みの `feat:` を再度数えてしまうと、保守目的の patch リリースのはずが誤って minor に上がってしまうためです。

この対象範囲は、以下の優先順位で上から評価し、最初に確定した境界をもって決定します（多段フォールバック）。

| 優先順位 | 判定方式 | 境界の決め方 |
|---------|---------|-------------|
| 1 | git タグ境界 | `git describe --tags` で直近のバージョンタグが取得できれば、そのタグから HEAD までを対象にする |
| 2 | 版バンプコミット境界 | タグが無い場合、`chore: vX.Y.Z にバージョンアップ` という規約コミットを直近1件さかのぼって境界にする |
| 3 | package.json 変更境界 | 上記が見つからない場合、`package.json` を最後に変更したコミットを境界候補にする |
| 4 | HEAD 全件 | 1〜3 のいずれも検出できない真の初回バンプ時のみ、履歴全体を対象にする |

判定不能（どの正規表現にもマッチしない）コミットのみだった場合は、これまでどおり patch 扱いになります。

> **なぜ多段フォールバックなのか**: git タグを運用していないプロジェクトでは、従来は範囲判定がそのまま「履歴全体」へフォールバックしていました。その結果、過去の `feat:` をすべて拾って minor へ誤って上げてしまうことがありました。版バンプコミット（`chore: vX.Y.Z にバージョンアップ`）を第2の境界として優先的に使うことで、タグ運用の有無にかかわらず「前回バージョンアップ以降」だけを正しく対象化し、誤バンプを防ぎます。将来 git タグ運用を導入してもタグ境界が最優先で維持されるため、挙動は壊れません。

Version-Bumper は完了報告に、実際に使った境界の判定方式（タグ / 版バンプコミット / package.json / HEAD）と対象コミット範囲を必ず記録します。どの基準でバージョンが決まったかを後から追跡できるようにするためです。

> git タグは作成しません（`--no-git-tag-version`）。タグのタイミングはプロジェクトのリリース戦略に委ねます。

設定変更は `.claude/ai-team-config.yml` の `version_management` を `auto` / `manual` に書き換えてください。

---

## Tech-Writer のドキュメント更新

レビュー合格後、Tech-Writer が起動してドキュメントを更新します。詳細は [Tech-Writer エージェント詳細](../agents/tech-writer.html) を参照してください。

主な処理：

1. `git diff` で変更差分を取得
2. `package.json` からバージョンを読み取り、`docs-src/versions/v<バージョン>/` を準備
3. Markdown を更新
4. `node docs-src/build.js` を実行して HTML をビルド
5. `docs-src/` と `public/docs/` を 1 つのコミットに含める

---

## PR 作成と人間マージ

Tech-Writer 完了後、PR-Creator が起動します。

```bash
gh pr create \
  --title "<タイトル>" \
  --body "<本文>" \
  --base main \
  --head <feature-branch>
```

PR 本文には次が含まれます：

- 概要・関連 Issue（`Closes #<番号>`）
- 変更内容（Implementer の完了報告から転記）
- 設計方針（Tech-Lead の方針から要約）
- テスト結果
- レビュー結果
- チェックリスト

PR 作成後は `escalated:human` ラベルが付与され、人間のマージを待ちます。マージは AI ではなく必ず人間が行います。

---

## DOD（Definition of Done）

バックエンドチーム用に 5 種類の DOD テンプレートが用意されています。

| ファイル | 用途 | 主なチェック項目 |
|---------|------|---------------|
| `dod/feature.md` | 新機能実装 | 設計方針・実装・テスト・カバレッジ 80%・レビュー・バージョン管理・PR・ドキュメント |
| `dod/bugfix.md` | バグ修正 | 再現手順・根本原因・リグレッションテスト・同種バグ確認・バージョン管理・PR |
| `dod/refactor.md` | リファクタリング | 目的明記・機能変更なし・カバレッジ維持・PR |
| `dod/review.md` | コードレビュー | スコープ・重大度別整理・レビュー方式判断・全件対応 |
| `dod/documentation.md` | ドキュメント更新（Tech-Writer 用） | 全変更箇所反映・バージョン管理・ビルド成功・コミット形式 |

`contributor` エージェントが Issue クローズ前に該当 DOD の全項目チェックを実施します。

---

## ステップ定義詳細（workflow.yml より）

`.claude/teams/backend/workflow.yml` の主要ステップ：

| step id | agent | label | 概要 |
|---------|-------|-------|------|
| `tech-lead-analysis` | tech-lead | `backend:tech-lead` | 要件分析・設計方針決定・インシデント確認 |
| `implementer` | implementer | `backend:implementer` | 実装・テスト実施 |
| `tech-lead-review-decision` | tech-lead | `backend:tech-lead` | レビュー方式を `conditions` で分岐判定 |
| `reviewer` | reviewer | `backend:reviewer` | シングルレビュー |
| `reviewer-a` | reviewer-a | `backend:reviewer-a` | ダブルレビュー A（`parallel_with: reviewer-b`） |
| `reviewer-b` | reviewer-b | `backend:reviewer-b` | ダブルレビュー B（`parallel_with: reviewer-a`） |
| `cross-review` | reviewer-a | `backend:reviewer-a` | クロスレビュー（`requires: [reviewer-a, reviewer-b]`） |
| `version-bumper` | version-bumper | `backend:version-bumper` | `ai-team-config.yml` の設定に従いバージョンを管理（auto/manual） |
| `tech-writer` | tech-writer | `backend:tech-writer` | docs-src 更新・build.js 実行 |
| `pr-creator` | pr-creator | `backend:pr-creator` | PR 作成・人間に承認依頼 |
| `human-merge-approval` | human-escalator | `escalated:human` | 人間がマージ |
| `human-escalator` | human-escalator | `escalated:human` | 判断不能事項を人間にエスカレーション |
| `contributor-close` | contributor | `contributor:ready` | DOD 確認・Issue クローズ（`action: close_issue`） |

---

## 関連ドキュメント

- [Tech-Writer](../agents/tech-writer.html) — ドキュメント更新の詳細
- [ワークフロー定義](../reference/workflow.html) — workflow.yml の文法
- [DOD テンプレート](../reference/dod.html) — DOD の運用ルール
