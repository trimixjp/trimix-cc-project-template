# AIチームのセットアップ

`/ai-team-setup` コマンドを実行すると、対話形式のウィザードが起動します。

---

## セットアップの流れ

### ステップ1: チームの選択

使用するチームを選択します。複数選択可能です。

```
? 導入するチームを選択してください（複数選択可）
❯ ◉ バックエンドチーム（コード実装・レビュー・PR作成）
  ◉ フロントエンドチーム（UI実装・コンポーネント開発・アクセシビリティ）
  ○ コンテンツチーム（記事・ドキュメント作成）
  ○ インフラチーム（クラウド構成・ネットワーク・セキュリティ）
  ○ SNS運用チーム（X・Instagram の投稿戦略・執筆・公開指示）
```

### ステップ2: 運用モードの選択

```
? 運用モードを選択してください
❯ マルチユーザーモード
    担当者が /ai-team run <Issue> を実行して処理を開始します
    複数人チームに適しています
  ソロモード
    /ai-team watch を起動すると新しいIssueを自動検出して処理します
    1人での運用に適しています
```

### ステップ3: バージョン管理の設定

`package.json` のバージョンを自動管理するか選択します。

```
? バージョン管理の方法を選択してください
❯ 自動インクリメント（auto）
    Reviewer 合格後に conventional commit に基づき自動更新
    ソロ運用・小規模チームに適しています
  手動管理（manual）
    バージョンアップはワークフロー外で人間が管理
    チーム開発・独自リリースフロー・monorepo に適しています
```

**auto** を選択した場合: Reviewer 合格後に Version-Bumper エージェントが `package.json` のバージョンを自動インクリメントします。  
**manual** を選択した場合: `npm version patch|minor|major` で手動更新します。

設定は `.claude/ai-team-config.yml` の `version_management` で変更できます。

### ステップ4: Issue 強制チェックの設定

ファイル変更を伴う指示は GitHub Issue を起点にすることで、インシデント記録・ラベル管理・作業履歴が正しく機能します。チェック方法を選択します。

```
? Issue 強制チェックの方法を選択してください
❯ CLAUDE.md のみ（推奨）
    タスク受付ルールを CLAUDE.md に記載します
    Claude が内容を判断して Issue 経由を促します
    設定変更なしで導入できます
  hooks で強制
    UserPromptSubmit フックを設定します
    変更系キーワードを含む指示に Issue 番号がない場合、スクリプトが自動でブロックします
    より確実に強制できますが、誤検知でブロックされる場合もあります
```

どちらを選択しても、`CLAUDE.md` にタスク受付ルールが追記されます。**hooks で強制** を選択した場合はさらに `.claude/hooks/ensure-issue.sh` が配置され、`.claude/settings.json` にフックが登録されます。

#### hooks の判定ロジック

| 条件 | 動作 |
|------|------|
| Issue 番号（`#123`）または GitHub URL を含む | スルー |
| `/ai-team ` スキルを使用している | スルー |
| 「確認・調査・教えて」等の調査系で始まる | スルー |
| 「修正・実装・追加・fix・create」等の変更系キーワードを含む | **ブロック** → Issue 作成を案内 |
| それ以外 | スルー |

### ステップ5: GitHub ラベルの作成

選択したチームに対応するラベルを `gh label create` で一括作成するかどうか確認します。既存ラベルは `--force` オプションで上書き更新されます。

---

## セットアップ後のファイル構成

`/ai-team-setup` を完了すると、以下が生成されます（バックエンド + hooks 選択の例）。

```
.claude/
├── CLAUDE.md                       # タスク受付ルールを含む AIチーム設定
├── ai-team-config.yml              # 運用モード・バージョン管理設定
├── escalation-rules.yml            # エスカレーション条件
├── agents/
│   ├── contributor.md
│   ├── dispatcher.md
│   └── human-escalator.md
├── teams/
│   └── backend/
│       ├── workflow.yml
│       ├── review-config.yml
│       ├── agents/
│       └── dod/
├── dod/
│   ├── README.md
│   └── incident.md
├── incidents/
│   ├── README.md
│   ├── TEMPLATE.md
│   └── index.yml
├── docs/
│   └── workflow-guide.md
├── hooks/                          # hooks 選択時のみ
│   └── ensure-issue.sh
└── commands/                       # postinstall で展開済み（変更不要）
    ├── ai-team-setup.md
    ├── ai-team-run.md
    └── ...
```

---

## 再セットアップ・設定変更

セットアップ後に設定を変更したい場合は、再度 `/ai-team-setup` を実行できます。  
`.claude/teams/` 配下のカスタマイズ済みファイルは `# customized: true` コメントがある場合は上書きされません。
