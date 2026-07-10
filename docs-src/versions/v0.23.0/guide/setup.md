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
    担当者が /ai-team-run <チケット> を実行して処理を開始します
    複数人チームに適しています
  ソロモード
    /ai-team-watch を起動すると新しいチケットを自動検出して処理します
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
  使わない（none）
    バージョン管理をワークフローから完全に外す
    バージョン概念のないリポジトリに適しています
```

**auto** を選択した場合: Reviewer 合格後に Version-Bumper エージェントが `package.json` のバージョンを自動インクリメントします。  
**manual** を選択した場合: `npm version patch|minor|major` で手動更新します。Version-Bumper ステップは残り、スキップ報告のみ行います。  
**none** を選択した場合（v0.23.0 で追加）: version-bumper ステップ自体が `workflow.yml` から削除され、Reviewer 合格後は直接 Tech-Writer に引き継がれます。アプリ運用・ドキュメントリポジトリなど、バージョン概念のないプロジェクトに適しています。

設定は `.claude/ai-team-config.yml` の `version_management` で変更できます。

### ステップ4: チケット強制チェックの設定

ファイル変更を伴う指示は チケットを起点にすることで、インシデント記録・ラベル管理・作業履歴が正しく機能します。チェック方法を選択します。

```
? チケット強制チェックの方法を選択してください
❯ CLAUDE.md のみ（推奨）
    タスク受付ルールを CLAUDE.md に記載します
    Claude が内容を判断して チケット経由を促します
    設定変更なしで導入できます
  hooks で強制
    UserPromptSubmit フックを設定します
    変更系キーワードを含む指示に チケット番号がない場合、スクリプトが自動でブロックします
    より確実に強制できますが、誤検知でブロックされる場合もあります
```

どちらを選択しても、`CLAUDE.md` にタスク受付ルールが追記されます。**hooks で強制** を選択した場合はさらに `.claude/hooks/ensure-issue.sh` が配置され、`.claude/settings.json` にフックが登録されます。

### ステップ4a: 実行基盤（runtime）

```
? 実行基盤を選択してください
❯ Claude Code（既定）
    model: fable / opus / sonnet / haiku
  Grok Build
    model: grok-4.5 / grok-composer-2.5-fast
    .grok/agents と .grok/commands にミラー
```

`runtime` は `.claude/ai-team-config.yml` に記録され、**再 setup で切り替え可能**です（「設定の切替のみ」モード）。

#### runtime 別の配置（指示書・hooks）

| 用途 | claude-code | grok |
|------|-------------|------|
| プロジェクト指示 | `.claude/CLAUDE.md` | **`AGENTS.md`（正規）** + `.claude/CLAUDE.md`（互換） |
| エージェント | `.claude/teams/*/agents/` 等 | 左記 + `.grok/agents/` ミラー |
| スキル | `.claude/commands/` | 左記 + `.grok/commands/` ミラー |
| チケット強制フック本体 | `.claude/hooks/ensure-issue.sh` | 同じスクリプトを共有 |
| フック登録 | `.claude/settings.json` | 左記 + `.grok/hooks/ensure-issue.json` |

Grok は Claude 互換で `.claude/` も読みますが、**指示の正規は `AGENTS.md`、フックの明示配置は `.grok/hooks/`** です。hooks 選択時は両方に登録します。

### ステップ4b: モデル性能と effort 深度

各エージェント定義・スキル（コマンド）の frontmatter に `model` / `effort` を一括反映します（割当は runtime 依存）。

```
? モデル性能プロファイルを選択してください
❯ バランス（推奨・デフォルト）
  ハイパフォーマンス
  低コスト

? effort（推論の深さ）を選択してください
❯ 普通（推奨・デフォルト）
  深く
  軽く
```

| 性能（Claude） | leader | worker | simple |
|----------------|--------|--------|--------|
| high-performance | fable | opus | sonnet |
| balance | opus | sonnet | haiku |
| low-cost | sonnet | sonnet | haiku |

| 性能（Grok） | leader | worker | simple |
|--------------|--------|--------|--------|
| high-performance / balance | grok-4.5 | grok-4.5 | grok-composer-2.5-fast |
| low-cost | grok-composer-2.5-fast | 同左 | 同左 |

**細かい設定は md ファイルの変更で可能です。** 一括再適用:

```bash
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime claude-code --profile balance --effort normal --dir .claude
# Grok 切替例
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime grok --profile balance --effort normal --dir .claude
```

定義の写しは `.claude/model-profiles.yml`、実装の SSOT は `bin/lib/model-profiles.js` です。

#### hooks の判定ロジック

| 条件 | 動作 |
|------|------|
| チケット番号（`#123`）または GitHub URL を含む | スルー |
| `/ai-team ` スキルを使用している | スルー |
| 「確認・調査・教えて」等の調査系で始まる | スルー |
| 「修正・実装・追加・fix・create」等の変更系キーワードを含む | **ブロック** → チケット作成を案内 |
| それ以外 | スルー |

### ステップ4c: AI が作業する「場所」

AI がコードを書くとき、あなたが開いているファイルと混ざらないよう、作業する場所を分けます。分け方は2通りです。

| 方式 | どういうことか | 向いている人 |
|---|---|---|
| **ブランチ**（既定） | いまのフォルダの中で、履歴だけを切り替えて作業する。準備が要らない | Git のブランチ操作に慣れていない人／AI の作業中は手を止めて待つ人／ディスク容量に余裕がない人 |
| **ワークツリー** | プロジェクトの複製フォルダ（`.claude/worktrees/issue-123/` など）を作り、その中だけで作業する。手元のファイルは変わらない | AI に任せつつ自分も同じプロジェクトを触りたい人／チケットを2件以上、同時に走らせたい人 |

**迷ったら「ブランチ」で構いません。**ひとりでチケットを1件ずつ順番に処理する使い方なら、これで十分です。

選んだ内容は `.claude/ai-team-config.yml` の `workspace.strategy` に保存されます。

```yaml
workspace:
  strategy: branch          # または worktree
  worktree_dir: .claude/worktrees
```

いずれを選んでも後から変更できます。

- **既定を変える**: `/ai-team-setup` を再実行する
- **このチケットだけ変える**: チケットに `workspace:worktree` または `workspace:branch` ラベルを貼る（ラベルが設定より優先されます）

ワークツリーを選んだ場合、setup は `.gitignore` に `.claude/worktrees/` を追記します（冪等）。ブランチ既定のままチケット単位でワークツリーに切り替えたときは、Implementer が同じ追記を行います。

どちらの方式で作業したかは、Implementer が完了報告に `作業方式:` と `作業ディレクトリ:` として必ず記録するため、後から追えます。

### ステップ5: GitHub ラベルの作成

選択したチームに対応するラベルを `gh label create` で一括作成するかどうか確認します。既存ラベルは `--force` オプションで上書き更新されます。

---

## セットアップ後のファイル構成

`/ai-team-setup` を完了すると、以下が生成されます（バックエンド + hooks 選択の例）。

```
.claude/
├── CLAUDE.md                       # タスク受付ルールを含む AIチーム設定
├── ai-team-config.yml              # 運用モード・バージョン管理・作業空間の方式・model/effort 設定
├── escalation-rules.yml            # エスカレーション条件
├── model-profiles.yml              # モデル・effort プロファイルの説明（人間可読）
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
