# @trimix/ai-team とは

`@trimix/ai-team` は、Claude Code（および Grok Build）を使った AI チームをプロジェクトに導入するセットアップパッケージです。**チケットをトリガー**に、バックエンド・フロントエンド・コンテンツ・インフラ・SNS運用・YouTube動画制作の各 AI チームが自律的にタスクを処理します。

チケットの置き場は setup で選べます。

| 方式 | 説明 | 向いている用途 |
|------|------|----------------|
| **GitHub Issues**（既定） | `gh` 経由。協業・PR 連携向き | エンジニア中心・公開/組織リポジトリ |
| **ローカル Markdown** | リポジトリ内 `tickets/*.md`。CLI で操作 | **非公開 GitHub が使えない・オフライン・非エンジニア** |
| Jira・Linear 等 | URL/本文の貼り付けで起動は可能 | ラベル更新などは手動になる場合あり |

**ローカル Markdown は本テンプレートの特徴のひとつです。** プライベートリポジトリの課金を避けつつ、同じワークフロー（ラベル遷移・コメント履歴）をファイルだけで回せます。人間向け UI としては **Obsidian で `tickets/` を vault として開く**運用を推奨しています（エージェントは Obsidian API に依存せず、md + `npx @trimix/ai-team ticket` を使います）。設定は [設定ファイル](reference/config.html) の `ticket_backend`、手順は [セットアップ](guide/setup.html) とプロジェクト内 `.claude/docs/local-tickets.md` を参照してください。

`package.json` の `description` には次のように定義されています。

```
AIチームをプロジェクトにセットアップするウィザード
```

このパッケージは 6 つの専門チームとスキル（スラッシュコマンド）から構成されており、プロジェクト固有のワークフローを `.claude/teams/<team_id>/workflow.yml` で柔軟に定義できます。各チームは専用のエージェント群を持ちます（例: YouTube動画制作チームは 9 体）。

---

## 主な特徴

### 1. 自律的なワークフロー実行

担当者が `/ai-team-run <チケット番号>` を実行すると、チケットの**ラベル・タイトル・内容**から担当チームとワークフローが決まり、そのチームの先頭エージェントから順に処理が進みます（例: バックエンドなら Tech-Lead 起点、フロントエンドなら Designer 起点、コンテンツなら Editor-in-Chief 起点。Epic なら Dispatcher が サブチケットに分解）。各エージェントはチケットコメント（github なら Issue コメント、local なら md の Comments 節）に作業内容と判断根拠を記録し、`workflow.yml` の定義に従って次の担当へラベルで引き継ぎます。チームごとの流れは [チーム概要](teams/overview.html) を参照してください。

### 2. チケットバックエンドの選択（GitHub / ローカル md）

`ticket_backend: github | local` で進捗管理の置き場を切り替えます。操作はスキル **`/ai-team-ticket`**（内部で共通 CLI）に統一されており、エージェント定義は backend を意識しにくくなっています。local 時は `tickets/open/`・`tickets/closed/` に md が並び、Obsidian でもそのまま閲覧できます。

### 3. ソロモード（自動監視）

`/ai-team-watch` を実行すると、チケット（GitHub Issues またはローカル open 一覧）を定期的に監視して新しいタスクを自動検出します。1 人で運用する場合や、新規チケットを取りこぼしたくない場合に有効です。監視間隔・対象ラベル・スキップラベルは `.claude/ai-team-config.yml` で設定できます。
### 4. 動的なレビュー方式（バックエンド・フロントエンド）

実装内容の影響範囲に応じて、Tech-Lead（または Frontend-Lead）が自動的にシングルレビューとダブルレビューを使い分けます。判定基準は `.claude/teams/<team_id>/review-config.yml` で定義されており、認証・決済・公開 API 等の機密領域は自動的にダブルレビューに切り替わります。

### 5. エスカレーション機構

法的判断・予算承認・PR マージ・仕様の曖昧さなど、AI が判断すべきでない事項に遭遇した場合、エージェントは自動的に `human-escalator` を呼び出して人間にエスカレーションします。人間が対応を完了した後は `/ai-team-resume` で続きから再開できます。

### 6. インシデント記録と再発防止

Contributor エージェントはチケットクローズ時にインシデントとして記録すべき情報がないか調査し、`.claude/incidents/` 配下にインシデントレポートを作成します。次回以降の作業開始時には、各リーダーエージェントが過去のインシデントを参照して「やってはいけないこと」をチケットに追記します。

### 7. ドキュメント自動更新（Tech-Writer）
バックエンドチームでは、PR 作成前に Tech-Writer エージェントが起動し、コードの変更差分を `docs-src/` 配下の Markdown に反映してから `node docs-src/build.js` で `ai-team-manual/docs/` に HTML をビルドします。コードとドキュメントが乖離しない仕組みです。

---

## 対応チーム

6 つのチーム（バックエンド・フロントエンド・インフラ・コンテンツ・SNS運用・YouTube動画制作）に対応しています。詳細は[チーム概要](teams/overview.html)を参照してください。

---

## バージョン情報

- **現行バージョン**: v0.23.0
- **必要な Node.js**: 18.0.0 以上（`engines.node` で定義）
- **配布形式**: npm パッケージ（`.tgz`）
- **ライセンス**: MIT

### v0.23.x シリーズの主な変更点

- v0.23.0: **全エージェント定義・全スキルのモデル非依存ブラッシュアップ**。高推論モデルの暗黙的な補完に頼らず、Opus / Sonnet などどのモデルで実行しても同等品質で動作するよう、8 本のスキルと 47 体のエージェント定義＋ワークフローを「決定論的な手順」へ書き直しました。主な変更:
  - **エージェント記述標準の新設（agent-writing-guide §9-5〜9-8）**: 「失敗時挙動」セクションの必須化・機械的検証の原則・モデル非依存の原則・設定値のハードコード禁止を、エージェント定義の記述標準として明文化しました。全エージェントに「失敗時挙動」を水平展開し、曖昧な自然文の判断を決定表・転記式チェックに統一しています
  - **SNS 運用チームの品質ゲート追加**: `strategist-review` ステップに `on_rework`（調査レポートが不十分な場合の Researcher への差し戻し）を追加し、差し戻し上限超過時は human-escalator へ遷移するようにしました
  - **Tech-Writer の差分範囲判定を多段フォールバック化**: Version-Bumper と同一の 4 段フォールバック（git タグ → 版バンプコミット → package.json 変更 → HEAD 全件）を Tech-Writer にも水平展開し、ドキュメント更新対象の誤範囲を防ぎます
  - **フロントエンドチームの起動ラベルを `frontend:designer` に統一**: ワークフローの最初のステップが `designer-analysis` であるため、チケット起動ラベル（キーワード判定表・ソロモードの `target_labels`）を `frontend:frontend-lead` から `frontend:designer` に統一しました
  - **YouTube チームのステップ判定を決定論化**: director のマルチモード判定（`director-planning` / `director-channel-review`）を、直前の引き継ぎコメント（`⏭️` 行）の機械抽出＋決定表照合に変更し、失敗時挙動を追加しました
  - **バージョン管理の選択肢に「使わない（none）」を追加**: `/ai-team-setup` のバージョン管理の質問に `none` を追加。選択すると version-bumper ステップ自体をワークフローから削除し、Reviewer 合格後は直接 Tech-Writer に引き継がれます（バージョン概念のないリポジトリ向け）
  - **テンプレート同梱チーム（sns / youtube）の install ガードと gallery 区別表示**: `distribution: "template"` のチームはプラグインパッケージ非配布であることを明示し、`/ai-team-install` では案内メッセージを表示、`/ai-team-gallery` では「テンプレート同梱（/ai-team-setup で追加）」として区別表示するようにしました
  - **postinstall の配布欠落修正**: `ai-team-create.md` が `.claude/commands/` に展開されない欠落を修正し、配布スキル一覧を `bin/lib/skill-files.js` に単一情報源化しました（展開されるスキルは 8 件）
  - **ensure-issue.sh の修正**: ハイフン区切りの `/ai-team-*` コマンド（正準表記）が チケット強制チェックにブロックされる問題を修正しました
  - 詳細は [v0.23.0 の変更点](changelog.html) を参照

### v0.22.x シリーズの主な変更点

- v0.22.0: **ドキュメント公開ディレクトリを `public/` から `ai-team-manual/` にリネーム（破壊的変更）**。`public/` は導入先プロジェクトのビルド出力ディレクトリやホスティングの公開ルートとして使われやすい一般的な名前で、名前が衝突するリスクがありました。専用の `ai-team-manual/` に変更することで、この衝突を回避します。主な変更:
  - **同梱ディレクトリ名の変更**: npm 配布物に含めるディレクトリ（`package.json` の `files`）を `public/` から `ai-team-manual/` に変更しました。あわせて `bin/postinstall.js` の展開先も、導入先プロジェクトの `ai-team-manual/` に変更しています
  - **ルート `ai-team-manual/index.html` のバージョン追従化**: これまで手動で管理していたルートのリダイレクト用 index を `docs-src/build.js` の生成対象に加え、常に `config.latest`（最新バージョン）へ自動で追従するようにしました。これにより、バージョンアップ時にルートの入口が旧バージョンを指したまま取り残される問題を解消します
  - **破壊的変更**: npm 配布物の同梱ディレクトリ名と postinstall の展開先が `public/` から `ai-team-manual/` へ変わります。導入先に旧 `public/docs/`（本パッケージが過去に展開したもの）が残っている場合の扱いを含む移行手順は、[バージョン移行ガイド](guide/migration.html)を参照してください

### v0.16.x シリーズの主な変更点

- v0.16.0: **ドキュメントビルド（`docs-src/build.js`）の画像対応と、YouTube動画制作チームページへの `figure` 表示サンプルの追加**。これまで `build.js` は Markdown から HTML への変換と `assets/`（共通 CSS/JS）の生成のみを行っており、画像ファイルは `ai-team-manual/docs/` に反映されませんでした。図版を使った説明ができるよう、ビルド処理に画像対応を加えました。主な変更:
  - **画像ファイルのコピー処理を追加**: 各バージョンの `docs-src/versions/<ver>/` 配下にある画像（`.png` / `.jpg` / `.jpeg` / `.svg` / `.gif` / `.webp`）を、サブディレクトリ構造（相対パス）を保ったまま `ai-team-manual/docs/<ver>/` へ再帰的にコピーします。既存の Markdown→HTML 変換・`assets/` 生成には手を加えていないため、従来のビルド挙動は変わりません
  - **Markdown の画像構文に対応**: `markdownToHtml` が画像構文 `![alt](src)` を `<img>` タグへ変換するようにしました（リンク変換 `[text](url)` より前に処理することで通常リンクへの影響を避けています）。あわせて画像表示用の CSS（`.content img`）を共通スタイルに追加しました。これにより、ページと同じ階層に置いた画像を `![説明](画像名.png)` の相対参照で埋め込めます
  - **YouTube動画制作チームページに全 19 型の表示サンプルを追加**: [YouTube動画制作チーム](teams/youtube.html) §6（ビジュアル型）に、19 型すべて（前半 10 型・後半 8 型・`figure`）の表示サンプル画像を `teams/figures/<型>.png` として埋め込みました。すべて ai-youtube エンジンの実レンダー静止画（1920×1080・PNG）で、配色は nihon101 のトンマナ（藍・朱・生成り・墨）に統一しています。各型は代表レイアウトを 1 枚ずつ掲載し、前半 10 型・後半 8 型はそれぞれサンプルブロックに、`figure` は型の節に配置しました
  - この変更により、19 型のビジュアル型を実際の見た目つきのカタログとして一目で見渡せるようになりました

### v0.15.x シリーズの主な変更点

- v0.15.0: **Contributor のインシデント判定基準を改善**。運用中に判明した過検出（本来インシデントではない正常なフローまでインシデント化する問題）を解消しました。主な変更:
  - **PR 承認・マージ待ちをインシデント対象外に**: PR の承認・main マージは設計上すべての PR で必ず発生する正規ゲート（`human-merge-approval` ステップ）です。`escalated:human` の有無だけで判定すると正常に完了したほぼ全チケットがインシデント記録されてしまうため、エスカレーションコメントの構造化フィールド「エスカレーション種別」を読み、`merge_approval` 種別を除外しました。`legal` / `budget` / `ambiguous_spec` の真のエスカレーションのみインシデント候補とします
  - **本文キーワードの部分一致による誤検出を廃止**: バグ修正の判定で本文に「fix」等が含まれるかを部分一致で確認していたため、`fix:` 等のコミットプレフィックスに誤ヒットしていました。`incident` ラベルまたは適用 DOD（`bugfix.md` 判定）で判定する方式に変更し、補助キーワードを使う場合もタイトル限定・完全一致に制限しました
  - **DOD カバレッジ 80% に計測手段なし時の除外を明記**: バックエンド feature DOD のカバレッジ項目に「カバレッジ計測手段がないプロジェクトは対象外（根拠を チケットコメントに記録）」を追記し、計測手段のないプロジェクトでの過剰な差し戻しを防ぎます
  - 詳細は [Contributor](agents/contributor.html) の「インシデント判定基準」、[DOD テンプレート](reference/dod.html)、[エスカレーションルール](reference/escalation.html) を参照

### v0.13.x シリーズの主な変更点

- v0.13.0: **YouTube動画制作チームのビジュアル型を 18 型へ拡張（テンプレート v1.2.0）**。`PRODUCTION-GUIDE.md` §6 のビジュアル型カタログを 10 型から 18 型へパス非依存で同期しました（チーム定義は Markdown／YAML のみ。エンジン本体は同梱しません）。追加された 8 型:
  - **`clip`（動画クリップ埋め込み）**: 実写動画を主役級に 1 本見せる型。`data.video` に動画ファイルを指定（`full`／`caption`／`split` レイアウト）。写真型と異なり `query` 検索は未対応で、ローカル/staticFile（手元の確定ファイル）のみ対応
  - **`quote`（引用）**: レビュー引用・名言・ユーザーの声（`centered`／`card`／`with-photo`）。`with-photo` では著者写真を `data.photo` で添える
  - **`versus`（対称比較）**: 左右対等な 2 対象の属性比較（`split`／`stacked`／`table`）。`contrast`（否定/Before-After）・`map`（地理差）とは役割が異なり、3 対象以上は `table` を使う
  - **`pie`（構成比）／`bar`（量の比較）**: SVG によるデータ可視化系で互いに対。`pie` は割合・内訳、`bar` は数量差を表す（写真なし）
  - **`ranking`（ランキング）**: 順位付きリスト（`list`／`podium`／`countdown`）。`items: [{ rank, label, photo? }]`
  - **`table`（比較表）**: 3 対象以上 × 複数属性のマトリクス（`grid`／`compact`／`highlight`）。`.max` 制約で文字を切り捨てない
  - **`qa`（問い→答え）**: 誤解解消・フックの問い→答え形式（`single`／`list`／`reveal`）
  - 追加 8 型も既存型と同じ**不変原則**（情報が主・デザインは従／文字切り捨て・重なり禁止／英語ラベルのみ／焼き込み字幕なし）の上に乗ります。詳細は [YouTube動画制作チーム](teams/youtube.html) を参照
  - `registry.json` の youtube プラグインを version 1.1.0 → 1.2.0 に更新し、tags に `chart`／`comparison` を追加

### v0.12.x シリーズの主な変更点

- v0.12.0: **YouTube動画制作チーム（テンプレート v1.1.0）の機構強化**。ai-youtube の知見をもとに、配布テンプレートへ 6 つの新機構をパス非依存で反映しました（チーム定義は Markdown／YAML のみ。エンジン本体は同梱しません）。主な変更:
  - **タイトル・説明欄の多言語化（localizations）**: 字幕とは別に、タイトル・説明欄そのものを各言語版で持たせる。`subtitles.targets` 駆動・base 言語は除外・1 言語の失敗は警告で続行（冪等）
  - **gallery 型の追加**: `PRODUCTION-GUIDE.md` §6 の視覚・モーション型を 9 型から 10 型へ拡張。複数対象を 1 枚ずつ写真で見せる型
  - **縦 Shorts の自動切り出し＋自動アップロード**: 本編から決定論で区間抽出し縦 1080x1920 を生成。`upload.shorts_upload` で有効化・`shorts-manifest.json` で冪等管理
  - **X／TikTok の決定論下書き＋人間ゲート配信**: `social.enabled`／`social.tiktok.enabled` で有効化。下書き生成と `--send`（下書き・inbox 送信）まで自動化し、最終公開は人間
  - **yt-episode 統括フロー**: プレビュー承認ゲート（必須・人間ゲート）→ セクション単位レンダ → ユーザー確認 → 公開。章数は `sections` 配列長で自動判定
  - **update-meta による予約再スケジュール**: `privacy: private` の予約公開のみ更新し、`public`（既公開）は触らない（冪等）
  - これらの機構は**人間ゲート・冪等性・config-driven（後方互換）**の 3 原則に従い、`channel.yaml` の任意フィールドで有効化します（未設定なら従来どおり動作）。詳細は [YouTube動画制作チーム](teams/youtube.html) を参照
  - `registry.json` の youtube プラグインを version 1.0.0 → 1.1.0 に更新し、tags に `shorts`／`localization`／`tiktok` を追加

### v0.11.x シリーズの主な変更点

- v0.11.0: **Opus 最適化と再現性強化**。全エージェントが Claude Opus で動作する前提に最適化（モデルはエイリアス指定。助言役の `architect` のみ frontmatter に `model: opus` を明示）。主な変更:
  - **レビュー方式の機械判定化**: `review-config.yml` の `sensitive_areas` に正規表現 `pattern` を追加し、`detection_procedure`（base_branch 検証 → `git diff` 計測 → パス照合=該当確定 / 本文照合=参考値）で機械的に判定
  - **差し戻し上限 `rework_limit: 2`**: 同一チケットで 3 回目の不合格は implementer へ差し戻さず `escalated:human` へ。コメント先頭行照合による決定論的カウント（全 5 チーム）
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

- v0.8.0: ワークフロー設計の汎用化・業務ドメイン別拡張設計ドキュメントを追加。全チームの `workflow.yml` の整合性修正（`on_complete.conditions` 形式統一・`requires_all_of` 統一・`on_escalation` の網羅性向上）。月次ワークフロー見直しの仕組み（チケットテンプレート・GitHub Actions）を追加。

### v0.7.x シリーズの主な変更点

- v0.7.0: SNS運用チームテンプレートを追加（Strategist / Researcher / Writer / Operator の 4 エージェント構成）

### v0.6.x シリーズの主な変更点

- v0.6.0: Version-Bumper ステップをバックエンドワークフローに追加・バージョン管理設定（`ai-team-config.yml` の `version_management`）をサポート

### v0.5.x シリーズの主な変更点

- v0.5.0: ワークフロー設定ウィザード（`/ai-team-configure`）を追加
- v0.5.1: postinstall で全スキルファイルが展開されない問題を修正
- v0.5.2: Mermaid.js によるフローチャート描画対応・マニュアル全体の構造を再編成

`bin/setup.js` で展開される 9 つのスキルファイルは以下のとおりです。

```
ai-team-setup.md
ai-team-run.md
ai-team-watch.md
ai-team-resume.md
ai-team-ticket.md
ai-team-gallery.md
ai-team-install.md
ai-team-configure.md
ai-team-create.md
```
