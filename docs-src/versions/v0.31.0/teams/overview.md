# チーム概要

`@trimix/ai-team` は 6 つの専門チームを提供します。各チームは独自のワークフロー定義（`workflow.yml`）とエージェント群を持ち、担当する チケットの種類に応じて自律的に処理を進めます。

---

## チーム比較表

| 項目 | バックエンド | フロントエンド | インフラ | コンテンツ | SNS運用 | YouTube動画制作 |
|------|------------|--------------|---------|-----------|--------|--------------|
| **team_id** | `backend` | `frontend` | `infra` | `content` | `sns` | `youtube` |
| **ラベル色** | 青（`1d76db`） | 黄（`f9a825`） | 緑（`0e8a16`） | 薄黄（`e4e669`） | ピンク（`e91e63`） | 未確認（テンプレートに色定義なし） |
| **対象** | API・サーバーコード・テスト | UI・コンポーネント・アクセシビリティ | クラウド・ネットワーク・セキュリティ | 記事・ドキュメント・コンテンツ | X・Instagram の投稿運用 | YouTube 動画の企画・台本・生成・公開・収益化 |
| **エージェント数** | 8 | 7 | 5 | 4 | 4 | 18 |
| **リーダー** | tech-lead | frontend-lead | infra-lead | editor-in-chief | strategist | director |
| **実装担当** | implementer | developer | network-engineer / infra-specialist | writer | writer | scriptwriter / editor |
| **レビュー方式** | シングル / ダブル（自動判断） | シングル / ダブル（自動判断） | security-engineer による単独レビュー | compliance による単独レビュー | operator によるガイドライン確認 | editor による台本品質ゲート＋プレビュー承認（人間ゲート） |
| **ドキュメント自動更新** | あり（tech-writer） | なし | なし | なし | なし | なし |
| **PR 作成** | あり（pr-creator） | あり（pr-creator） | なし（直接適用） | なし | なし（人間が公開） | なし（人間が公開） |
| **特殊エージェント** | tech-writer | designer（最初のステップ） | architect（依頼時のみ） | researcher（依頼時のみ） | researcher（依頼時のみ） | affiliate / monetizer / sns-distributor |
| **典型的な DOD** | feature / bugfix / refactor / review / documentation | feature / component / bugfix | infrastructure-change / network-change / security-review | article / document / revision | post / campaign / analysis | channel-creation / episode-production / growth |

---

## どのチームを使うべきか

### バックエンドチーム

- API エンドポイントを追加・変更したい
- データベース処理を実装したい
- バックエンドのロジック・テストを書きたい
- PR を作成して人間にマージしてもらいたい

→ [バックエンドチーム詳細](backend.html)

### フロントエンドチーム

- 新しい UI コンポーネントを作りたい
- ページレイアウトを変更したい
- アクセシビリティ対応を強化したい
- デザイン仕様を策定したい（Designer エージェント）

→ [フロントエンドチーム詳細](frontend.html)

### インフラチーム

- Terraform / Kubernetes の設定を変更したい
- ネットワーク（VPC・DNS・LB）の構成を変えたい
- セキュリティ監査を実施したい
- CI/CD パイプラインを変更したい

→ [インフラチーム詳細](infra.html)

### コンテンツチーム

- ブログ記事を書きたい
- ドキュメント・マニュアルを更新したい
- コンプライアンスチェック付きで記事を公開したい
- 統計データに基づいた記事を作成したい（Researcher エージェント）

→ [コンテンツチーム詳細](content.html)

### SNS運用チーム

- X（Twitter）・Instagram に投稿したい
- トレンド・競合分析をもとにコンテンツを企画したい
- masterclass セミナーの知見を SNS 運用に反映したい
- 投稿スケジュールを管理したい
- キャンペーン・連載シリーズを企画したい

→ [SNS運用チーム詳細](sns.html)

### YouTube動画制作チーム

- YouTube 動画の企画・台本作成から生成・公開までを一貫して進めたい
- タイトル・説明欄を多言語化してグローバル視聴者にリーチしたい
- 本編から縦型 Shorts を自動で切り出してアップロードしたい
- X・TikTok への配信は人間の承認を挟んだうえで運用したい
- 動画の収益化（アフィリエイト・モネタイズ）を意識した運用をしたい

→ [YouTube動画制作チーム詳細](youtube.html)

---

## 共通の構成要素

全チームで共通する要素は以下です。

### 共通エージェント（`.claude/agents/`）

| エージェント | 役割 |
|------------|------|
| `dispatcher` | Epic チケットを サブチケットに分解 |
| `human-escalator` | 判断不能事項を人間にエスカレーション |
| `contributor` | 全体管理・DOD 確認・チケットクローズ・インシデント記録 |

### 共通ラベル

| ラベル | 用途 |
|--------|------|
| `epic` | 複数チームにまたがる大規模タスク |
| `dispatcher` | Dispatcher が自動分解中 |
| `incident` | インシデント報告 |
| `escalated:human` | 人間の判断が必要（処理停止中） |
| `contributor:ready` | Contributor が完了確認中 |
| `ai-team:in-progress` | AI エージェントが処理中（二重実行防止） |

### 共通の DOD（`.claude/dod/`）

| DOD | 用途 |
|-----|------|
| `incident.md` | 本番障害・セキュリティインシデント対応 |
| `README.md` | DOD テンプレート選択ガイド |

---

## ワークフローのカスタマイズ

各チームのワークフローはプロジェクト固有にカスタマイズできます。

| カスタマイズ対象 | 方法 |
|----------------|------|
| ステップの追加・変更・削除・並び替え | `/ai-team-configure <team_id>` で対話的に編集 |
| エージェントの動作変更 | `.claude/teams/<team_id>/agents/*.md` を直接編集 |
| レビュー基準の変更 | `.claude/teams/<team_id>/review-config.yml` を編集 |
| DOD のカスタマイズ | `.claude/teams/<team_id>/dod/*.md` を編集・新規追加 |

詳細は [ワークフロー定義](../reference/workflow.html) を参照してください。

---

## ラベル命名規則

各チームのエージェントには `<team_id>:<agent_name>` 形式のラベルが対応します。

```
backend:tech-lead       backend:implementer       backend:reviewer
backend:reviewer-a      backend:reviewer-b        backend:tech-writer
backend:pr-creator

frontend:designer       frontend:frontend-lead    frontend:developer
frontend:reviewer       frontend:reviewer-a       frontend:reviewer-b
frontend:pr-creator

infra:infra-lead        infra:network-engineer    infra:infra-specialist
infra:security-engineer infra:architect

content:editor-in-chief content:researcher
content:writer          content:compliance

sns:strategist          sns:researcher
sns:writer              sns:operator

youtube:director          youtube:channel-producer  youtube:scriptwriter
youtube:editor            youtube:growth-strategist youtube:affiliate
youtube:publisher         youtube:sns-distributor   youtube:monetizer
```

チケットにこれらのラベルを付与すると、対応するエージェントが処理を開始します。
