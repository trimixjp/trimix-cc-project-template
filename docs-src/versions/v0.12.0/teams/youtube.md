# YouTube動画制作チーム

YouTube動画制作チームは、チャンネルの立ち上げから動画の企画・台本・生成・公開・収益最大化までを一貫して行う AI チームです。台本を「最終動画のタイムライン」として扱う制作思想と、外部公開の前に必ず人間の承認を挟む安全設計が特徴です。ワークフロープラグイン（配布テンプレート）として提供され、`/ai-team-install youtube` で導入します。

> **ワークフロー定義**: `.claude/teams/youtube/workflow.yml`
> **エージェント定義**: `.claude/teams/youtube/agents/*.md`
> **制作憲法**: `.claude/teams/youtube/PRODUCTION-GUIDE.md`
> **DOD テンプレート**: `.claude/teams/youtube/dod/*.md`

---

## エージェント一覧

YouTube動画制作チームは 9 体のエージェントで構成されます。リーダーである `director` は自分では制作せず、タスク種別を判定して各専門エージェントに委譲します。

| エージェント | 役割の一言定義 | ラベル |
|------------|-------------|--------|
| `director` | 統括リーダー。Issue を分析しタスク種別を 3 分岐判定し、各エージェントへ委譲する | `youtube:director` |
| `channel-producer` | チャンネルの「箱」（趣旨・言語・字幕・配色・配信計画）と「編成」（トピック選定・重複防止・月次プラン）を担う | `youtube:channel-producer` |
| `scriptwriter` | 台本ライター。リサーチと執筆を担い、台本を最終動画のタイムラインとして仕上げる | `youtube:scriptwriter` |
| `editor` | 台本品質ゲートと動画生成（レンダ）＋自己検証を担う。情報を主・デザインを従とする | `youtube:editor` |
| `growth-strategist` | グロース担当。CTR タイトル・サムネ・タグ・章設計・視聴維持の「見てもらう」設計を行う | `youtube:growth-strategist` |
| `affiliate` | アフィリエイト各社の選定・説明欄リンク生成・開示文（FTC／景表法）を決定論で作成する | `youtube:affiliate` |
| `publisher` | 公開担当。private 起点アップロード・予約公開・多言語字幕・多言語メタ・Shorts UP・予約再同期を担う | `youtube:publisher` |
| `sns-distributor` | 拡散担当。Shorts／切り抜き案を提示し、X・TikTok は決定論で下書きを生成して人間ゲートで配信する | `youtube:sns-distributor` |
| `monetizer` | 収益最大化担当。CPM／RPM・横断送客・スポンサー・収益源多様化の観点で施策を提案する | `youtube:monetizer` |

各エージェントは明確な責任範囲を持ち、**担当しないこと**を明示することで役割の重複を防いでいます。

---

## ワークフロー全体フロー

`director` が Issue を分析し、タスク種別を「チャンネル立ち上げ」「エピソード制作」「グロース単発」の 3 つに分岐させます。エピソード制作では、台本の品質ゲート（`editor-review`）、プレビュー承認（`human-picture-lock`）、レンダ（`editor-render`）、公開（`publisher`）、拡散（`sns-distributor`）、収益最適化（`monetizer`）の順に進みます。

| step id | agent | label | 概要 |
|---------|-------|-------|------|
| `director-planning` | director | `youtube:director` | Issue 分析・インシデント確認・タスク種別の 3 分岐判定 |
| `channel-producer-setup` | channel-producer | `youtube:channel-producer` | チャンネル作成（channel.yaml・glossary・配色・配信計画・初期トピックバックログ） |
| `director-channel-review` | director | `youtube:director` | チャンネル設定の完成確認・人間の残作業（Studio 手動設定・OAuth・声）の整理 |
| `human-channel-setup` | human-escalator | `escalated:human` | YouTube Studio 手動設定・OAuth・声の用意を人間に依頼 |
| `channel-producer-planning` | channel-producer | `youtube:channel-producer` | トピック選定・重複防止・月次プラン組込・エピソードスタブ作成 |
| `scriptwriter` | scriptwriter | `youtube:scriptwriter` | リサーチと台本執筆（構造規約に沿った台本＝タイムライン） |
| `editor-review` | editor | `youtube:editor` | 台本品質ゲート（編集文法・10 型整合・権利安全・写真照合・機械検証・有益性） |
| `growth-strategist` | growth-strategist | `youtube:growth-strategist` | CTR タイトル案・サムネ指示・タグ・章設計・視聴維持の設計 |
| `affiliate` | affiliate | `youtube:affiliate` | アフィリエイト各社の選定・説明欄リンク・開示文の生成 |
| `human-picture-lock` | human-escalator | `escalated:human` | プレビュー承認ゲート（必須・人間ゲート）。`preview.html` をユーザーが承認 |
| `editor-render` | editor | `youtube:editor` | 動画生成（セクション単位レンダ・縦 Shorts 自動切り出し）＋自己検証 |
| `publisher` | publisher | `youtube:publisher` | private 起点アップロード・予約公開・多言語字幕／メタ投入・Shorts UP・予約再同期・API 検証 |
| `sns-distributor` | sns-distributor | `youtube:sns-distributor` | 公開後の拡散。X・TikTok の決定論下書き生成と人間ゲート配信 |
| `monetizer` | monetizer | `youtube:monetizer` | 収益最適化レビュー（CPM・横断送客・スポンサー・次アクション提案） |
| `growth-standalone` | growth-strategist | `youtube:growth-strategist` | 既存動画の改善・拡散・収益化を提案するグロース単発タスク |
| `human-escalator` | human-escalator | `escalated:human` | 判断できない事項を人間にエスカレーション |
| `contributor-close` | contributor | `contributor:ready` | DOD 確認・コメント品質チェック・Issue クローズ・インシデント調査 |

同一 Issue でレビューが繰り返し差し戻されることを防ぐため、`rework_limit: 2`（3 回目の不合格は人間にエスカレーション）が設定されています。`editor-review`・`editor-render` の双方が差し戻し上限を超えると `human-escalator` へ遷移します。

---

## 自動運用の 3 原則

YouTube動画制作チームの新機構はすべて、次の 3 原則に従って設計されています。これは外部公開を伴う運用を安全に自動化するための土台です（`PRODUCTION-GUIDE.md` §1）。

| 原則 | 意味 | 運用者にとっての意味 |
|------|------|------------------|
| **人間ゲート** | 外部公開（publish / post / share）は必ず人間の判断を挟む | 本編公開・Shorts のアップロード・X／TikTok 投稿は、人間の明示的な承認（または `--send`・アプリでの公開操作）を経てから実行されます。AI は下書き・予約・登録までで止まり、不可逆な対外アクションを単独では行いません |
| **冪等性** | 同じ操作を何度繰り返しても結果が重複しない | 各機構は状態の真実源（manifest の投稿済みフラグや動画 ID 等）を持ち、処理済みのものは skip します。失敗時に再実行しても二重投稿・二重アップロードにはならず、再投稿ではなく再同期になります |
| **config-driven（後方互換）** | 新機構は `channel.yaml` の任意フィールドで有効化し、未設定なら何もしない | スイッチを設定したチャンネルだけが新しい挙動を得ます。既存チャンネルを壊さないため、アップグレードしても設定を変えなければ従来どおり動作します |

加えて、エピソード制作ではレンダに進む前に `preview.html` をユーザーが承認する**プレビュー承認ゲート**が必須であり、レンダは章を単位に品質管理する**セクション単位レンダ**で行われます。

---

## 新機構（テンプレート v1.1.0）

v1.1.0 で、ai-youtube の知見をもとに 6 つの機構が追加されました。これらはいずれも `channel.yaml` の任意フィールドで有効化する後方互換の設計で、有効化しなければ従来どおり動作します。

### ① タイトル・説明欄の多言語化（localizations）

動画内のセリフを翻訳する字幕（CC）とは別に、動画の「タイトル」と「説明欄」そのものを各言語版に持たせる機構です。YouTube が視聴者の言語設定に応じて表示を出し分けます。

- **翻訳する対象**: タイトル・章（Chapters）名・開示文などのプローズ（散文）のみ
- **翻訳しない対象**: URL・地図リンク・時刻表記・画像クレジットはそのまま保持します（崩すとリンク切れや誤情報になるため）。固有名詞は glossary で綴りを固定します
- **base 言語の扱い**: 本体のタイトル・説明欄がそのまま base となるため、localizations からは除外します（二重に入れない）
- **有効化条件**: `subtitles.targets`（既定 8 言語: EN・JA・KO・zh-CN・zh-TW・FR・IT・TH）に言語があれば対象になります。言語がなければ何もしません
- **失敗時の挙動**: 1 言語の投入が失敗しても警告にとどめ、本編アップロードは成功扱いとします。冪等なので次回の公開で再同期されます
- **担当**: `publisher`（本編の動画 ID 確定直後に冪等投入）

### ② gallery 型（視覚型を 9 型から 10 型へ）

`PRODUCTION-GUIDE.md` §6 の視覚・モーション型（`progressive` / `contrast` / `howto` / `list` / `stat` / `map` / `timeline` / `concept` / `warning`）に、10 型目として `gallery` が追加されました。

`gallery` 型は「ラーメンの種類」「桜の名所」のように、複数の対象を 1 枚ずつ写真で見せるトピック向けの型です。各アイテムの写真を中央フォーカスで順次表示し、進捗チップ（例: `3/6`）で何番目かを示します。

台本では `items: [{ label, photo }]` のスキーマで記述します。`label` は英語ラベル、`photo` は確定した写真の指定（`wikipedia:` / `commons:` / `file:`）または未確定の `query` です。一致する写真を確定できないアイテムは、無理に写真を当てず英語の `Reserved` タグで視覚化します（誤った写真は写真なしより悪い、という制作原則に基づきます）。台本作成は `scriptwriter`、レンダは `editor` が担当します。

### ③ 縦 Shorts の自動切り出し＋自動アップロード

本編のタイムラインから `hook` / `stat` / `contrast` / `warning` に該当する区間を決定論で抽出し、縦型の YouTube Shorts を自動生成・アップロードする機構です。

- **抽出方式**: 章の役割とテンプレート型を見て機械的に区間を選択します（生成 AI 任せにしません）
- **解像度・尺**: 縦 1080x1920・15〜45 秒。横から縦への変換は安全領域への再配置で行い、末尾に本編へ誘導する CTA カードを付けます
- **メタ**: 説明欄の先頭に本編 URL、タイトルに `#Shorts` を入れます
- **有効化スイッチ**: `channel.yaml` の `upload.shorts_upload`。未設定なら Shorts を作らずアップロードもしません（後方互換）
- **冪等の真実源**: `shorts-manifest.json`（生成済み・アップロード済みを管理。既アップロード分は skip）
- **予約**: `publish_at_offset`（既定 24 時間）だけ本編より後ろにずらして予約公開します（同時露出を避けるため）
- **担当**: 切り出し・縦レンダは `editor`、アップロード・予約は `publisher`（本編が API で成功してから冪等にアップロード）

なお、Shorts を含めるとクォータの都合で実質 1 日 1 本（本編のみなら 1 日 2 本）が目安になります。

### ④ X／TikTok の決定論下書き＋人間ゲート配信

公開済みの本編から X・TikTok 投稿の下書きを決定論で生成し、送信ゲートの手前まで自動で進める機構です。最終的な公開は必ず人間が行います。

- **X**: フック＋本編タイトル＋本編 URL＋ハッシュタグから本文を生成します（280 字厳守）。`social-manifest.json` に下書きとして保存し、実送信は `share-x --send` で行います（最終公開は人間）。有効化スイッチは `social.enabled`、冪等の真実源は `posted`
- **TikTok**: キャプション下書きを生成し、`share-tiktok --send` で inbox（下書き）に送るところまで行います。実際の公開は TikTok アプリで人間が行う二重ゲートです。送信動画は Shorts の `shorts/01.mp4` を前提とし、なければ skip します。有効化スイッチは `social.tiktok.enabled`、冪等の真実源は `tiktok.posted.publishId`
- **担当**: `sns-distributor`（下書き生成と `--send` まで）

Instagram・YouTube Community への展開は従来どおり設計提示のみで、実投稿は人間が行います。

### ⑤ yt-episode 統括フロー（プレビュー承認ゲート＋セクション単位レンダ）

エピソード制作を、台本から公開まで一連のゲート付きフローとして統括する機構です。

```
yt-script
  → 【プレビュー承認（必須・人間ゲート）】 preview.html をユーザーが承認
  → yt-render（セクション単位レンダ）
  → 【ユーザー確認（必須・人間ゲート）】 完成動画をユーザーが確認
  → yt-publish
```

- **章数の自動判定**: 台本 frontmatter の `sections` 配列長で自動判定します（章数を推測しません）
- **セクション単位レンダ**: 60 秒のチャンクに分割し、章（セクション）境界で自動分割します。章ごとに検証し、問題があった章だけ差分再レンダします（全体を一括で焼き直しません）
- **ゲート対応**: ワークフローの `human-picture-lock` → `editor-render` → `publisher` の流れと一致します。プレビュー承認なしにレンダへ、ユーザー確認なしに公開へは進みません
- **担当**: 統括は `director`（正しい順序とゲートで進むよう監督）、レンダは `editor`、公開は `publisher`、承認・確認は人間

### ⑥ update-meta による予約再スケジュール

アップロード済み動画の予約公開日時を、台本の `frontmatter.publish_at` に後から同期する機構です。配信計画を後ろ倒し・前倒しした際に、YouTube 側の予約を合わせます。

- **対象**: `privacy: private`（予約公開待ち）の動画のみ更新し、`public`（既公開）の動画には触れません（公開済み動画の公開日を動かさない）
- **冪等**: すでに `publish_at` と一致していれば何もしません
- **担当**: `publisher`（公開後の運用時のみ・任意）

---

## DOD（Definition of Done）

| ファイル | 用途 | 新機構に関する主なチェック項目 |
|---------|------|---------------------------|
| `dod/channel-creation.md` | チャンネル立ち上げ | Shorts／X／TikTok の各有効化スイッチ（`upload.shorts_upload`・`social.enabled`・`social.tiktok.enabled`）を使う場合のみ設定済みであること（未設定なら動作しない）。多言語メタが `subtitles.targets` 駆動であることの把握 |
| `dod/episode-production.md` | エピソード制作 | 多言語メタの冪等投入。プレビュー承認ゲート（人間ゲート）の通過。縦 Shorts・X・TikTok 配信が有効チャンネルのみ規定どおり実行されていること |
| `dod/growth.md` | グロース | Shorts／切り抜き案が根拠付きで提示されていること。X／TikTok 配信が `--send`（下書き・inbox 送信）まで提示され、最終公開が人間ゲートであること |

---

## このチームを使うとき

- YouTube 動画の企画・台本作成から生成・公開までを一貫して進めたい
- タイトル・説明欄を多言語化してグローバルな視聴者にリーチしたい
- 本編から縦型 Shorts を自動で切り出してアップロードしたい
- X・TikTok への配信を、人間の承認を挟んだうえで運用したい
- アフィリエイトや収益化を意識した動画運用をしたい

導入は `/ai-team-install youtube` で行います。詳細は [ai-team-install](../skills/install.html) と [チーム概要](overview.html) を参照してください。
