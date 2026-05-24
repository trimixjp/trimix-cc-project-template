# /ai-team-create — カスタムチーム作成ウィザード

> **対応バージョン**: v0.10.0 以降

対話形式でカスタムチームをゼロから作成します。チームID・エージェント構成・ワークフロー順序を質問形式で設計し、`.claude/teams/<team_id>/` 配下に必要なファイル一式を自動生成します。

---

## 引数

```
/ai-team-create [team_id]
```

`team_id` は省略可能です。省略した場合は対話で入力を求めます。

---

## 生成されるファイル

| ファイル | 内容 |
|---------|------|
| `.claude/teams/<team_id>/agents/<agent_id>.md` | 各エージェントの定義（担当・役割・成果物） |
| `.claude/teams/<team_id>/workflow.yml` | ワークフロー定義（ステップ順・条件分岐） |
| `.claude/teams/<team_id>/review-config.yml` | レビュー判定基準（シングル/ダブル） |
| `.claude/teams/<team_id>/dod/feature.md` | 完了判定チェックリスト（DOD） |

また、`.claude/ai-team-config.yml` の `solo.target_labels` に最初のエージェントのラベルが追記されます。

---

## 実行ステップ

### ステップ 0: 前提確認とチームIDの決定

- `.claude/` ディレクトリの存在を確認（なければ `/ai-team-setup` を案内して終了）
- チームIDの入力（英小文字・数字・ハイフンのみ）
- 既存チームとの重複チェック（`.claude/teams/` を参照）

### ステップ 1: チーム基本情報の収集

- **チーム名**（日本語可）: 例「営業チーム」「SNS運用チーム」
- **目的・担当領域**: 例「自社サービスの営業活動を自動化する」

### ステップ 2: エージェント構成の設計

- エージェント数（2〜6名）を選択
- 各エージェントのID（英小文字・ハイフン）・役割・担当成果物を入力
- ワークフロー実行順序を確認

### ステップ 3: ファイル生成

`templates/teams/_custom/` のテンプレートを参照しながら：

1. `agents/<agent_id>.md` を各エージェント分生成
2. `workflow.yml` にステップと `on_complete` を定義
3. `review-config.yml` をコピー・カスタマイズ
4. `dod/feature.md` をコピー

### ステップ 4: ai-team-config.yml の更新

`solo.target_labels` に最初のエージェントのラベル（`<team_id>:<first_agent_id>`）を追加します。

### ステップ 5: 完了報告

生成したファイル一覧・次のステップ（エージェント定義のカスタマイズ・GitHub ラベル作成）を表示します。

---

## テンプレートの場所

カスタムチームのベーステンプレートは `templates/teams/_custom/` に格納されています。

```
templates/teams/_custom/
├── agents/
│   └── _agent-template.md     # エージェント定義のひな形
├── workflow.yml                # ワークフロー定義のひな形
├── review-config.yml           # レビュー設定のひな形
└── dod/
    └── feature.md              # DOD チェックリストのひな形
```

---

## 注意事項

- **新規作成専用**: 既存チームの変更には `/ai-team-configure <team_id>` を使用してください
- **プロジェクトルートで実行**: `.claude/` が存在するディレクトリで実行してください
- **GitHub ラベルは手動作成**: ウィザードは `.claude/` 配下のファイルのみ生成します。GitHub ラベルは完了報告に記載されたコマンドで手動作成してください

---

## 使用例

```
/ai-team-create
→ チームIDを入力してください: sales
→ チーム名: 営業チーム
→ 目的: 自社サービスの新規顧客開拓を自動化する
→ エージェント数: 3
→ エージェント1 ID: lead-researcher   役割: 見込み顧客調査
→ エージェント2 ID: proposal-writer   役割: 提案書作成
→ エージェント3 ID: follow-up          役割: フォローアップ
→ ✅ チーム "営業チーム" を作成しました
```

```
/ai-team-create youtube
→ チームID: youtube（引数から取得）
→ チーム名: YouTubeチーム
...
```
