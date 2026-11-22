# /ai-team-gallery — ワークフローギャラリー

インストール可能なワークフロープラグイン（チーム）の一覧を表示します。

> **スキル定義**: `skills/ai-team-gallery.md`

---

## 使い方

```
/ai-team-gallery
```

引数はありません。プロジェクトルートで実行してください。

---

## ステップ 1: ギャラリー表示

スキルは実行環境を自動判定し、次の順序でコマンドを試みます。

**① ソースリポジトリの場合（最優先）**

`package.json` の `name` が `@trimix/ai-team` であれば `node bin/setup.js gallery` を直接実行します。`@trimix/ai-team` 自体の開発・動作確認環境で有効です。

**② コンシューマープロジェクト（グローバル or npx 経由）**

```bash
npx @trimix/ai-team gallery
```

**③ コンシューマープロジェクト（ローカルインストール）**

```bash
node node_modules/@trimix/ai-team/bin/setup.js gallery
```

このコマンドは `bin/lib/gallery.js` の `showGallery` 関数で実装されており、パッケージ内の `registry.json` をもとに利用可能なプラグイン一覧を表示します。

---

## 表示内容

`registry.json` で定義されているチームが表示されます。

| ID | チーム | 説明 | カテゴリ | タグ |
|----|--------|------|---------|------|
| `trimix-backend` | バックエンドチーム | コード実装・レビュー・PR作成ワークフロー | engineering | code, review, pr, backend |
| `trimix-frontend` | フロントエンドチーム | UI実装・コンポーネント開発・アクセシビリティ対応ワークフロー | engineering | ui, component, accessibility |
| `trimix-content` | コンテンツチーム | 記事・ドキュメント・コンテンツ作成ワークフロー | content | writing, documentation, compliance |
| `trimix-infra` | インフラチーム | クラウド構成・ネットワーク・セキュリティワークフロー | infrastructure | terraform, kubernetes, security |
| `trimix-sns` | SNS運用チーム | X・Instagram の投稿戦略・調査・執筆・公開指示ワークフロー | marketing | sns, twitter, instagram, marketing |
| `trimix-youtube` | YouTube動画制作チーム | YouTube動画の企画・台本・生成・公開・収益最大化を一貫して行うワークフロー | content | youtube, video, script, monetization, affiliate, shorts, localization, tiktok |

インストール済みのプラグインは強調表示されます（`ai-team-plugins.json` の `installed` から判定）。

### テンプレート同梱チームの区別表示（v0.23.0）

`registry.json` で `distribution: "template"` と定義されているチーム（SNS運用チーム・YouTube動画制作チーム）は、プラグインパッケージとしては配布されていません。ギャラリーでは「インストール可能なプラグイン」の一覧とは別に、次のように **テンプレート同梱** セクションとして区別表示されます。

```
[テンプレート同梱（/ai-team-setup で追加）]
  📁 sns          SNS運用チーム         v1.0.0  X・Instagram の投稿戦略・調査・執筆・公開指示ワークフロー
  📁 youtube      YouTube動画制作チーム  v1.6.0  YouTube動画の企画・台本・生成・公開・収益最大化を一貫して行うワークフロー…
```

これらのチームは `/ai-team-install` ではなく `/ai-team-setup` で導入します。

---

## ステップ 2: 結果報告

表示された内容をユーザーに分かりやすく報告します。

- インストール済みプラグインを強調
- 未インストールのプラグインはインストール方法を案内

---

## ステップ 3: 次のアクション案内

ユーザーの興味に合わせて以下を案内します。

- **インストール**: `/ai-team-install <team_id>`
- **詳細確認**: 各プラグインの概要説明

---

## インストール済みプラグインの確認

ギャラリーではなくインストール済みプラグインのみを確認したい場合は、直接 CLI を使用します。

```bash
npx @trimix/ai-team list
```

`bin/lib/gallery.js` の `listPlugins` 関数が `ai-team-plugins.json` の内容を整形して表示します。

---

## 注意事項

- このスキルはプロジェクトルートで実行してください
- `@trimix/ai-team` がインストールされていない場合は先に `npm install` が必要です
- 将来的に `registry_url` を経由したリモートレジストリ対応が予定されていますが、v0.9.0 ではローカルの `registry.json` のみを参照します

---

## 関連ドキュメント

- [ai-team-install](install.html) — プラグインのインストール
- [チーム概要](../teams/overview.html) — 各チームの詳細
