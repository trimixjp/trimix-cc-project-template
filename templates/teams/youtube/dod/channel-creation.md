# DOD（Definition of Done）— チャンネル立ち上げ

> **対象**: 新規チャンネルの立ち上げ
> **Contributor がクローズ前にこのチェックリストで完了を判断します**

---

## ✅ 市場・ジャンル戦略（market-analyst・ジャンル/方向性を新規に決める場合）

- [ ] ターゲット視聴国/言語圏を戦略入力（channel.yaml or Issue）から確定し、**geo_mix を最優先軸**として扱った
- [ ] ジャンル候補を 15〜30 列挙し、7 指標（demand/competition/cpm/geo_mix/jp_edge/faceless_fit/authenticity_risk）で正規化・重み付き合成して `total` を算出した
- [ ] 競合度を**一次スクリーニング（結果1万件未満）＋実測検証ゲート（CTR>4%・視聴維持率>50%）併用**で設計した
- [ ] `authenticity_risk`（inauthentic content ポリシー 2025-07-15）を減点指標として明示的に組み込んだ
- [ ] 推奨 3 案を、スコア内訳・根拠・**出典・確信度・出典時期**付きで提示した（確信度の低い数値は使っていない）
- [ ] **最終ジャンル決定は人間ゲート**であることを明記し、market-analyst が決定していない

> 既存ジャンルの設定変更のみで方向性を決め直さない場合は本セクションを「該当なし」とする。

## ✅ チャンネル設定

- [ ] `channel.yaml` がスキーマ検証（Zod, render --dry-run）を通る
- [ ] `voice-guide.md` を作成済み
- [ ] `glossary.yaml` を作成済み
- [ ] `BRAND.md` を作成済み
- [ ] `ROADMAP.md` を作成済み
- [ ] `youtube-channel.md` を作成済み

## ✅ 企画・配信計画

- [ ] 初期トピックバックログ10本を作成済み
- [ ] 月次配信プラン（plans/YYYY-MM）を作成済み
- [ ] 字幕言語（targets）を決定済み
- [ ] テンプレ（配色 theme）を決定済み

## ✅ 公開設定

- [ ] privacy:private を明記済み
- [ ] ai_disclosure の既定を明記済み
- [ ] **多言語メタ（localizations）の前提**: `subtitles.targets`（既定8言語）が公開時のタイトル/説明欄の多言語化対象になることを把握済み

## ✅ 新機構の有効化（config-driven・任意・後方互換／使わないなら未設定でよい）

- [ ] **縦 Shorts 自動 UP** を使う場合のみ `upload.shorts_upload` を設定済み（未設定なら Shorts は生成・UP されない）
- [ ] **X 配信** を使う場合のみ `social.enabled` を設定済み（未設定なら X 下書き生成・送信を行わない）
- [ ] **TikTok 配信** を使う場合のみ `social.tiktok.enabled` を設定済み（未設定なら TikTok 送信を行わない）

## ✅ 人間残作業の提示

- [ ] YouTube Studio 手動設定をチェックリストで提示済み
- [ ] OAuth トークンの用意をチェックリストで提示済み
- [ ] 声の用意をチェックリストで提示済み

---

**完了判定**: 上記すべての項目が ✅ であることを Contributor が確認してから Issue をクローズします。
