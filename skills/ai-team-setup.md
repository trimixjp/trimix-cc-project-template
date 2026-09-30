---
name: ai-team-setup
description: AIチームをプロジェクトにセットアップするウィザード。.claude/ディレクトリにエージェント定義・ワークフロー・設定ファイルを配置し、チケット用ラベルを作成します（ticket_backend: github の場合）。
model: opus
effort: high
model_role: leader
---

# /ai-team-setup — AIチーム セットアップウィザード

あなたはセットアップウィザードです。以下の手順でAIチームをプロジェクトに導入してください。

## ステップ1: 現状確認

まず以下を確認してください：

1. 現在の作業ディレクトリを確認する（`pwd`）
2. `.claude/` ディレクトリが存在するか確認する
3. 既存の `.claude/teams/` があれば、すでにセットアップ済みのチームを確認する

## ステップ1.5: 再セットアップ（既存環境）の分岐

`.claude/ai-team-config.yml` が既にある場合、最初に次を確認してください（`AskUserQuestion`）:

- **フルセットアップ**: チーム選択からやり直し（従来どおり）
- **設定の切替のみ（runtime / model / effort / advisor）**: ファイル再配置は最小限。プロファイル再適用・config 更新・advisor のモデル設定のみ
- **キャンセル**

**設定の切替のみ**を選んだ場合の手順:

1. 下記 **質問0（runtime）**・**質問5（性能）**・**質問6（effort）**・**質問7（advisor のモデル）** だけを聞く（質問7 は runtime が `claude-code` のときだけ）
2. `.claude/ai-team-config.yml` の `runtime` / `model_performance` / `effort_depth` を更新
3. 反映コマンドを実行:

```bash
node <パッケージルート>/bin/lib/apply-model-profile.js \
  --runtime <claude-code|grok> \
  --profile <balance|high-performance|low-cost> \
  --effort <normal|deep|light> \
  --dir .claude
```

4. `runtime=grok` のときは同じコマンドが `.grok/agents` と `.grok/commands` へミラーする（自動）
5. **指示書・hooks の runtime 差分を埋める**（欠けていれば）:
   - grok へ切替: ルート `AGENTS.md` に `templates/_shared/project-rules/ai-team-rules.md` を追記（未追記時）。hooks 利用中なら `.grok/hooks/ensure-issue.json` を配置
   - claude-code へ戻す: `.claude/CLAUDE.md` に同ルールがあることを確認（通常は既存のまま）
6. **質問7 の反映**（runtime が `claude-code` のときだけ）: 下記ステップ3「advisor のモデル設定（質問7）」の手順を実行する。性能（質問5）を今回変えていなければ、現在の `.claude/ai-team-config.yml` の `model_performance` を性能として扱う
7. 完了報告して終了（ラベル作成やチーム再配置はスキップ）
## ステップ2: 導入チームと運用モードの選択

ユーザーに以下を確認してください（`AskUserQuestion` ツールを使用）：

**質問0**: 実行基盤（runtime）を選択してください（`AskUserQuestion`）

エージェント / スキルの `model` / `effort` は runtime ごとに異なります。**あとから本コマンドで切り替え可能**です。

- **Claude Code（既定）**: Anthropic Claude Code。`fable` / `opus` / `sonnet` / `haiku`、effort に `xhigh` 可
- **Grok Build**: xAI Grok Build。`grok-4.5` / `grok-composer-2.5-fast`。スキルは `.claude/commands` 互換 + `.grok/` ミラー

**質問1**: 導入するチームを選択してください（複数選択可）

> ⚠️ `AskUserQuestion` の選択肢は最大4つです。6チームを2回に分けて確認します。

**質問1a**（`AskUserQuestion` / multiSelect: true）: エンジニアリング・コンテンツ系チームを選択してください（複数選択可）
- バックエンドチーム（コード実装・レビュー・PR作成）
- フロントエンドチーム（UI実装・コンポーネント開発・アクセシビリティ）
- インフラチーム（クラウド構成・ネットワーク・セキュリティ）
- コンテンツチーム（記事・ドキュメント作成）

**質問1b**（`AskUserQuestion` / multiSelect: true）: マーケティング・メディア系チームを選択してください（複数選択可）
- SNS運用チーム（X・Instagram の投稿戦略・執筆・公開指示）
- YouTube動画制作チーム（企画・台本・生成・公開・収益最大化。QA層・複数チャンネル対応）
- 追加しない

両質問の回答をまとめて「導入するチーム一覧」として扱います。

**質問2**: 運用モードを選択してください（`AskUserQuestion` ツールを使用）
- **マルチユーザーモード**: 担当者が `/ai-team-run <チケット>` を実行して処理を開始します。複数人チームに適しています
- **ソロモード**: `/ai-team-watch` を起動すると新しいチケットを自動検出して処理します。1人での運用に適しています

**質問3**: バージョン管理の方法を選択してください（`AskUserQuestion` ツールを使用）
- **自動インクリメント（auto）**: Reviewer 合格後に conventional commit に基づき `package.json` のバージョンを自動更新します。ソロ運用・小規模チームに適しています
- **手動管理（manual）**: バージョンアップはワークフロー外で人間が管理します。Version-Bumper ステップは残り、スキップ報告だけを行います。チーム開発・独自リリースフロー・monorepo に適しています
- **使わない（none）**: バージョン管理をワークフローから完全に外します。version-bumper ステップ自体を削除するため、Reviewer 合格後は直接 Tech-Writer に引き継がれます。バージョン概念のないリポジトリ（アプリ運用・ドキュメント等）に適しています

**質問4**: チケット管理方式を選択してください（`AskUserQuestion` ツールを使用）

- **GitHub Issues（既定・エンジニア向け）**: 既存どおり `gh` 経由。協業・PR 連携向き
- **ローカル Markdown（Obsidian 推奨・非エンジニア向け）**: プロジェクト内 `tickets/*.md` で完結。プライベート GitHub 不要。人間は Obsidian で `tickets/` を vault として開く運用を推奨（エージェントはファイル + CLI のみ）

**質問4b**: チケット / チケット強制チェックの方法を選択してください（`AskUserQuestion` ツールを使用）

ファイル変更を伴う指示はチケットを起点にすることで、インシデント記録・ラベル管理・作業履歴が機能します。チェック方法を選択してください。

- **CLAUDE.md のみ（推奨）**: タスク受付ルールを CLAUDE.md に記載します。Claude が内容を判断してチケット経由を促します
- **hooks で強制**: `UserPromptSubmit` フックを設定します（チケット 番号 / ローカル番号の検出。local 時は数字 ID も可）

**質問4c**: AI が作業する「場所」を選択してください（`AskUserQuestion` ツールを使用）

質問の前に、以下の説明をそのままユーザーに提示してください（専門用語だけを並べない）。

> AI がコードを書くとき、あなたが開いているファイルと混ざらないよう、作業する場所を分けます。分け方が2通りあります。
>
> - **ブランチ方式** — いまのフォルダの中で、履歴だけを切り替えて作業します。準備が要らず、Git に詳しくなくてもそのまま使えます。ただし AI が作業している間、そのフォルダは AI のものになります（あなたが同時に別の編集をすると混ざります）。
> - **ワークツリー方式** — プロジェクトの複製フォルダ（`.claude/worktrees/issue-123/` など）を作り、その中だけで作業します。あなたの手元のファイルは一切変わりません。AI が作業している最中でも、あなたは普段どおり自分のコードを触れます。複数のチケットを同時に走らせることもできます。代わりに、複製ぶんのディスクを使います。

- **ブランチ（推奨・デフォルト）**: 迷ったらこちら。ひとりで、チケットを1件ずつ順番に処理する使い方に向いています
- **ワークツリー**: AI に任せている間に自分も別の作業をしたい人、複数チケットを並行して流したい人に向いています

**おすすめの決め方**（ユーザーが迷った場合はこの基準を伝えて選ばせてください）:

| こういう人 | おすすめ |
|---|---|
| Git のブランチ操作に慣れていない | **ブランチ** |
| AI が作業している間は、自分は手を止めて待つ | **ブランチ** |
| AI に任せつつ、自分も同じプロジェクトを触りたい | **ワークツリー** |
| チケットを2件以上、同時に走らせたい | **ワークツリー** |
| ディスク容量に余裕がない | **ブランチ** |

いずれを選んでも後から変更できます。`/ai-team-setup` を再実行して既定を切り替えられるほか、チケットに `workspace:worktree` / `workspace:branch` ラベルを貼れば、そのチケットだけ方式を上書きできます（ラベルが無いときの既定値を、ここで決めています）。

**質問5**: モデル性能プロファイルを選択してください（`AskUserQuestion` ツールを使用）

各エージェント・スキルの frontmatter（`model`）に、役割（設計 / 検証 / 実装 / 単純作業）ごとのモデルを一括反映します。

- **バランス（推奨・デフォルト）**: 設計 `opus`、検証 `opus`、実装 `sonnet`、単純作業 `haiku`
- **ハイパフォーマンス**: 設計 `fable`、検証 `opus`、実装 `opus`、単純作業 `sonnet`（高品質優先）
- **低コスト**: 設計 `sonnet`、検証 `sonnet`、実装 `sonnet`、単純作業 `haiku`（コスト優先）

**質問6**: effort（推論の深さ）を選択してください（`AskUserQuestion` ツールを使用）

各エージェント・スキルの frontmatter（`effort`）に、選択した深さを一括反映します。

- **普通（推奨・デフォルト）**: 全て `high`
- **深く**: 全て `xhigh`（難しい設計・大規模タスク向け）
- **軽く**: 全て `medium`（高速・低コスト向け。high 未満）

> **細かい設定は md ファイルの直接編集で可能です。** setup 後に個別エージェントだけモデルを変えたい場合は、`.claude/teams/<team>/agents/*.md` や `.claude/commands/*.md` の `model` / `effort` を編集してください（バージョン固定のモデル ID は禁止。エイリアス `fable` / `opus` / `sonnet` / `haiku` のみ）。

**質問7**: advisor のモデルを選択してください（`AskUserQuestion` ツールを使用。**runtime が `claude-code` のときだけ聞く**。`grok` のときは聞かず、関連ファイルにも触れない。advisor は Claude Code の機能のため）

advisor は、実装エージェントが判断に迷ったときに相談する、より強いモデルです。**エージェント・スキルごとには指定できません**（frontmatter に advisor 用のキーが無く、Claude Code の設定 `advisorModel` だけで指定します）。setup は個人設定 `.claude/settings.local.json` に書き込みます（本人にだけ効き、チームの他のメンバーには影響しません）。

**質問の前に**、現在の状態を確認して利用者に見せます（何も書き込まない）:

```bash
# <パッケージルート> は npm なら node_modules/@trimix/ai-team、ソースならリポジトリルート
# <performance> = 質問5 の選択の**内部 ID**（`balance` / `high-performance` / `low-cost`。表示名や打ち間違いは終了コード2）
#   再 setup で質問5 を聞かないときは、現在の config の値（`--profile` を省くと config から読む）
node <パッケージルート>/bin/setup.js advisor check --profile <performance>
```

出力の「実効値」と、`advisorModel` が見つかった場所（R1〜R4）を、そのまま利用者に伝えてください。選択肢（先頭が推奨）:

1. **fable（推奨）**: 設計・検証を強いモデルに任せる方針の既定値。事前に Claude Code で `/model fable` を実行し、利用クレジットへの同意が必要です（プランによる）。未同意の間は、公式ドキュメントによればエラーにならず advisor なしで動き、通知が出ます。サブエージェントにも引き継がれます
2. **opus**: 本体が fable のセッションには付きません。**質問5 が「ハイパフォーマンス」（本体の設計役が fable）のときは、この選択肢を出さない**
3. **設定しない**: どのファイルも変えません（既存の値も消しません）
4. **解除**: `check` の R1（`.claude/settings.local.json`）に `advisorModel` があるときだけ出す。そのキーだけを削除します（共有プロジェクト設定・ユーザー設定は変えません）

伝える注意（選択肢の説明に必ず含める）:

- ここで選んだ値は、このプロジェクトでは `/advisor` コマンドの選択より優先されます。**変更は `/ai-team-setup` の「設定の切替のみ」か `.claude/settings.local.json` の編集で行ってください**
- Amazon Bedrock・Claude Platform on AWS では advisor は使えず、設定しても効果はありません（公式ドキュメントの記述による。未同意環境・Bedrock での実挙動は実測していません）
- 環境変数 `CLAUDE_CODE_DISABLE_ADVISOR_TOOL` や、組織の管理設定（managed settings）がある場合は、これらが優先されて効かないことがあります

### 質問5・6 の選択肢マッピング（決定表）

| ユーザー選択 | 内部 ID（config に記録） | 反映内容 |
|-------------|--------------------------|----------|
| バランス | `model_performance: balance` | leader=opus, verifier=opus, worker=sonnet, simple=haiku |
| ハイパフォーマンス | `model_performance: high-performance` | leader=fable, verifier=opus, worker=opus, simple=sonnet |
| 低コスト | `model_performance: low-cost` | leader=sonnet, verifier=sonnet, worker=sonnet, simple=haiku |
| 普通 | `effort_depth: normal` | 全ファイル `effort: high` |
| 深く | `effort_depth: deep` | 全ファイル `effort: xhigh` |
| 軽く | `effort_depth: light` | 全ファイル `effort: medium` |

## ステップ3: ファイルの配置

選択されたチームに基づいて、このパッケージの `templates/` から以下をコピーしてください。

**コピー手順（各行共通）:** 配置先ディレクトリを `mkdir -p` で作成してから `cp` を実行します。コピー元はパッケージのルート（ソースリポジトリならカレント、npm 経由なら `node_modules/@trimix/ai-team/`）を基準にします。

```bash
# 例: 単一ファイルの行
mkdir -p .claude/agents
cp <パッケージルート>/templates/_shared/agents/contributor.md .claude/agents/contributor.md

# 例: ワイルドカード（*.md）の行
mkdir -p .claude/teams/backend/agents
cp <パッケージルート>/templates/teams/backend/agents/*.md .claude/teams/backend/agents/
```

### 必須（全チーム共通）

```
templates/_shared/agents/contributor.md     → .claude/agents/contributor.md
templates/_shared/agents/dispatcher.md      → .claude/agents/dispatcher.md
templates/_shared/agents/human-escalator.md → .claude/agents/human-escalator.md
templates/_shared/escalation-rules.yml      → .claude/escalation-rules.yml
templates/_shared/model-profiles.yml        → .claude/model-profiles.yml
templates/_shared/dod/incident.md           → .claude/dod/incident.md
templates/_shared/dod/README.md             → .claude/dod/README.md
templates/incidents/index.yml               → .claude/incidents/index.yml
templates/incidents/TEMPLATE.md             → .claude/incidents/TEMPLATE.md
templates/incidents/README.md               → .claude/incidents/README.md
templates/docs/workflow-guide.md            → .claude/docs/workflow-guide.md
templates/docs/agent-writing-guide.md      → .claude/docs/agent-writing-guide.md
templates/docs/domain-workflow-guide.md    → .claude/docs/domain-workflow-guide.md
templates/docs/quickstart-by-domain.md    → .claude/docs/quickstart-by-domain.md
templates/docs/local-tickets.md            → .claude/docs/local-tickets.md
# 運用モード設定（選択したモードを記録）
→ .claude/ai-team-config.yml（内容は下記）
```

### ローカルチケット（質問4で local を選んだ場合）

```
templates/tickets/README.md              → tickets/README.md
templates/tickets/_templates/ticket.md   → tickets/_templates/ticket.md
templates/tickets/open/.gitkeep          → tickets/open/.gitkeep
templates/tickets/closed/.gitkeep        → tickets/closed/.gitkeep
```

`ticket_backend: local` のときはステップ4（GitHub ラベル作成）をスキップしてよい旨をユーザーに伝えます。

ステップ2で選択した運用モード・作業空間の方式（質問4c）・モデル設定に応じて、以下の内容で `.claude/ai-team-config.yml` を生成してください（質問4c で **ワークツリー** を選んだ場合は `workspace.strategy` を `worktree` にする）：

```yaml
# @trimix/ai-team 運用設定
mode: multi-user  # または solo

# バージョン管理設定
# auto:   Reviewer合格後にconventional commitに基づきpackage.jsonを自動インクリメント（ソロ・小規模チーム向け）
# manual: バージョンアップはワークフロー外で人間が管理（チーム開発・独自リリースフロー向け）
# none:   バージョン管理を使わない（セットアップ時に version-bumper ステップをワークフローから削除）
version_management: auto  # または manual / none

# AI が作業する場所（質問4c。チケットの workspace:* ラベルで個別に上書き可能）
# branch:   いまのフォルダで履歴だけ切り替えて作業する。準備不要。作業中はフォルダが AI のものになる
# worktree: 複製フォルダ（worktree_dir/issue-<番号>）を作り、その中だけで作業する。
#           手元のファイルは変わらないので、AI の作業中も自分の作業を続けられる。複数チケットの並行も可能
workspace:
  strategy: branch          # または worktree
  worktree_dir: .claude/worktrees

# モデル性能プロファイル（質問5）
# high-performance: leader=fable, verifier=opus, worker=opus, simple=sonnet
# balance:          leader=opus,  verifier=opus, worker=sonnet, simple=haiku（デフォルト）
# low-cost:         leader=sonnet, verifier=sonnet, worker=sonnet, simple=haiku
model_performance: balance  # または high-performance / low-cost

# effort 深度（質問6）
# deep:   全て xhigh
# normal: 全て high（デフォルト）
# light:  全て medium
effort_depth: normal  # または deep / light

# チケット管理方式（質問4）
# github: GitHub Issues（既定）
# local:  リポジトリ内 Markdown（tickets/）。Obsidian 推奨 UI
ticket_backend: github  # または local

# local 時のみ有効
local_tickets:
  dir: tickets
  id_prefix: ""

# 実行基盤（質問0）— 再 setup で切替可
# claude-code: Claude Code 向け model/effort
# grok:        Grok Build 向け model/effort（.grok/ へエージェント・スキルをミラー）
runtime: claude-code  # または grok

# solo モードの設定（mode: solo の場合のみ有効）
solo:
  poll_interval_minutes: 5      # チケット監視の間隔（分）
  target_labels:                # 処理対象とするラベル（いずれか1つでも付いていれば対象）
    - dispatcher
    - backend:tech-lead
    - frontend:designer
    - content:editor-in-chief
    - infra:infra-lead
    - sns:strategist
    - youtube:director
  skip_labels:                  # このラベルが付いていれば処理済みとしてスキップ
    - ai-team:in-progress
    - escalated:human
    - contributor:ready

# 委託監視（点呼・ウォッチドッグ。Issue #99）— キー不在時は下記既定値で動作する
# Opus/Sonnet をオーケストレーターにした場合でも、サブエージェントの無音停止を
# bin/watchdog.js が機械的に検知し、自動再委託・エスカレーションにつなげる設定
delegation_watchdog:
  stall_threshold_minutes: 10   # heartbeat 5分間隔義務 × 2回欠落 = 憲法第6条「2回連続無応答」に対応
  max_redelegations: 2          # rework_limit と同じ思想（3回目は人間へエスカレーション）
```

### モデル・effort の一括反映（質問5・6 の後、ファイル配置直後に必ず実行）

テンプレートをコピーしただけでは、テンプレート既定（balance / normal）の `model` / `effort` が残ります。選択したプロファイルを **配置済みの `.claude/` と `.claude/commands/`** に反映してください。

**方法A（推奨）: パッケージ同梱スクリプト**

```bash
# <パッケージルート> は npm なら node_modules/@trimix/ai-team、ソースならリポジトリルート
# <performance> = balance | high-performance | low-cost
# <effort>      = normal | deep | light

# <runtime> = claude-code | grok（質問0）
node <パッケージルート>/bin/lib/apply-model-profile.js \
  --runtime <runtime> \
  --profile <performance> \
  --effort <effort> \
  --dir .claude

# スキル（commands）にも同様に反映
node <パッケージルート>/bin/lib/apply-model-profile.js \
  --runtime <runtime> \
  --profile <performance> \
  --effort <effort> \
  --dir .claude/commands \
  --skills-only
```

`runtime=grok` の場合、上記 apply は `.grok/agents/` と `.grok/commands/` へのミラーも行います（Grok Build がエージェント定義を読むため）。

**方法B: スクリプトが使えない場合**

`.claude/model-profiles.yml` と `bin/lib/model-profiles.js` の role 対応に従い、各エージェント / スキル md の frontmatter に `model` と `effort` を手書きで upsert する。

**反映後の検証（必須）:**

```bash
# leader の1体（例: tech-lead）と simple の1体（例: pr-creator）を spot チェック
head -8 .claude/teams/backend/agents/tech-lead.md
head -8 .claude/teams/backend/agents/pr-creator.md
head -8 .claude/commands/ai-team-run.md
```

| 選択 | tech-lead の model | pr-creator の model | effort |
|------|-------------------|---------------------|--------|
| balance + normal | opus | haiku | high |
| high-performance + deep | fable | sonnet | xhigh |
| low-cost + light | sonnet | haiku | medium |

> **再設定**: プロファイルを後から変える場合も、同じスクリプトを `.claude` に対して再実行できます。個別 md の手動調整は再実行で上書きされる点に注意してください。

### advisor のモデル設定（質問7・runtime が claude-code のときだけ）

JSON の読み書きはコードで行います（既存キーを壊さない・同じ操作を繰り返しても結果が変わらない・黙って上書きしない、をコード側で保証するため）。`.claude/settings.local.json` を手で編集せず、必ず次のコマンドを使ってください。

```bash
# <model> = fable | opus | unset（unset は質問7 の「解除」）。質問7 で「設定しない」を選んだときは apply を実行しない
node <パッケージルート>/bin/setup.js advisor apply --model <model> --profile <performance>

# 「設定しない」を選んだが .gitignore の追記に同意したとき（決定7）だけ、advisorModel を書かずに追記する
node <パッケージルート>/bin/setup.js advisor gitignore
```

書き込み先は **git リポジトリのルート**（worktree では本体側のルート）の `.claude/settings.local.json` です（公式ドキュメントの読み取り位置に合わせるため。git 外では実行フォルダ）。ファイルが無ければ作成し、あれば既存のキーを保ったまま `advisorModel` だけを設定します。

終了コードごとの扱い:

| 終了コード | 意味 | 次の動作 |
|-----------|------|----------|
| 0 | 成功、または変更なし | 出力（変更内容・残っている他の設定の値と場所）を利用者に伝える |
| 2 | 引数誤り、または性能 high-performance で opus を選んだ | 選び直しを案内する |
| 3 | 既存の `advisorModel` があり、選んだ値と違う（または他の設定ファイルを確認できない） | 出力された**値と場所**を示し、上書きするかを `AskUserQuestion` で尋ねる。はいなら `--overwrite` を付けて再実行、いいえなら何も書かない。**黙って上書きしない** |
| 4 | 書き込み拒否（壊れた JSON・シンボリックリンク・ハードリンク・通常ファイルでない実体など）。**何も書いていない** | 「コマンド失敗時のフォールバック」に従い、理由とコマンドを示して停止する |
| 5 | 想定外の例外、または書き込みの失敗。**出力の「状態」に、どこまで書いたか**（何も書いていない／`.gitignore` は追記済みで個人設定は未書き込み）が書かれる | エラー出力を、その「状態」とあわせて利用者に示す。`advisor check` で実際の状態を確かめてから停止する（黙って再実行しない） |

通常ファイルでない実体（FIFO など）が設定ファイルの場所にあるときは、読まずに「確認できません」と表示します（`check` は終了コード0、`apply` は R1 なら 4、R2〜R4 なら 3）。

- `--overwrite` でも、共有プロジェクト設定（`.claude/settings.json`）とユーザー設定（`CLAUDE_CONFIG_DIR` があればその下、無ければ `~/.claude/settings.json`）は変更しません。個人設定の値が優先されて隠れるだけです。その旨を伝えてください
- **「設定しない」を選んでも、既存の値が問題になる場合がある**: 性能を high-performance にする（またはすでにそうである）状態で、`check` の実効値が `opus`（完全なモデル ID を含む）のとき（`check` の出力に「注意: high-performance では本体が fable のため、opus の advisor は付きません」が出る。`--json` では `profileConflict` が `true`）は、黙って放置せず、値と場所を示して「fable に変更 / そのまま残す / 解除（R1 にあるときだけ）」を尋ねる（決定3と同じ扱い）。変更を選んだ場合は `apply --model fable --overwrite`（解除なら `--model unset`）を実行する
- **Git 管理外の確認**: `check` の「git 状態」が `not-ignored` なら、`.gitignore` への追記（`.claude/settings.local.json`）を利用者に提案する。追記は同意したときだけ行う。
  - fable / opus / 解除を選んだとき: はいなら `apply` に `--gitignore` を付ける（R1 を新しく作る場合も提案する）
  - **「設定しない」を選んだとき（決定7）**: `check` の R1（`.claude/settings.local.json`）が**すでにあり**、git 状態が `not-ignored` のときだけ提案する（R1 が無ければ提案しない。個人設定がコミットされる危険は「設定しない」でも変わらないため）。はいなら `advisor gitignore` を実行する（`advisorModel` は書かず、R1 も変えない。R1 が無いときはコマンド側でも何もしない）。いいえなら何もしない
  - `tracked`（すでに Git が追跡している）なら追記しても外れないので、警告だけを伝え、`git rm --cached` は利用者の判断に任せる。`not-git` なら何もしない
- 実行フォルダとルートが違う場合（サブフォルダ・worktree）は、`.claude/`（実行フォルダ）と `settings.local.json`（ルート）の場所が分かれることを伝える

### ソロモード（選択時）

```
skills/ai-team-watch.md → .claude/commands/ai-team-watch.md
```

### チケット強制チェック（hooks を選択した場合）

#### フックスクリプトの配置（runtime 共通）

スクリプト本体は **常に** `.claude/hooks/` に置きます（単一の実装・両 runtime から参照）。

```
templates/_shared/hooks/ensure-issue.sh → .claude/hooks/ensure-issue.sh
```

```bash
chmod +x .claude/hooks/ensure-issue.sh
```

#### runtime 別のフック登録

| runtime | 登録先 | 備考 |
|---------|--------|------|
| `claude-code` | `.claude/settings.json` の `hooks.UserPromptSubmit` | Claude Code 標準。exit 2 でブロック可 |
| `grok` | 上記 **に加えて** `.grok/hooks/ensure-issue.json` | Grok ネイティブ。Grok は `.claude/settings.json` も互換読込する |

**Claude Code（`.claude/settings.json`）:** 存在する場合は `hooks` キーをマージし、無い場合は新規作成。

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "bash .claude/hooks/ensure-issue.sh"
          }
        ]
      }
    ]
  }
}
```

**マージ規則:**

- `hooks.UserPromptSubmit` 配列が既にある場合は要素を**追加**（配列ごと置き換えない）
- 同一 `command` が既にある場合はスキップ
- `hooks` 以外の既存キーは変更しない

**Grok（`runtime=grok` のとき追加）:**

```
templates/_shared/hooks/ensure-issue.grok.json → .grok/hooks/ensure-issue.json
```

```bash
mkdir -p .grok/hooks
cp <パッケージルート>/templates/_shared/hooks/ensure-issue.grok.json .grok/hooks/ensure-issue.json
```

> **Grok の注意**: `UserPromptSubmit` は Grok では非ブロッキングのイベントです。強制ブロックより **AGENTS.md のタスク受付ルール**が主防衛線になります。`.claude/settings.json` も Grok 互換で読まれますが、明示的に `.grok/hooks/` にも置くことで runtime 切替後も分かりやすくします。初回は `/hooks-trust` でプロジェクトを信頼してください。
### バックエンドチーム（選択時）

```
templates/teams/backend/agents/*.md       → .claude/teams/backend/agents/
templates/teams/backend/workflow.yml      → .claude/teams/backend/workflow.yml
templates/teams/backend/review-config.yml → .claude/teams/backend/review-config.yml
templates/teams/backend/dod/*.md          → .claude/teams/backend/dod/
# tech-writer.md・documentation.md は上記ワイルドカードに含まれます
```

#### バージョン管理「使わない（none）」選択時の追加編集（バックエンドチーム配置後に実施）

質問3で **使わない（none）** を選択した場合は、配置したファイルに以下の編集を加えて、ワークフローからバージョンアップを外してください。

1. **`.claude/teams/backend/workflow.yml` から version-bumper ステップを削除する**
   - `- id: version-bumper` のステップブロック全体（直前の説明コメント4行を含む）を削除する
   - `reviewer` と `cross-review` の `on_complete` にある `next: version-bumper` を `next: tech-writer` に付け替える

   ```yaml
   # 編集前（reviewer / cross-review の2箇所。condition 行は変更しない）
   on_complete:
     condition: 合格
     next: version-bumper

   # 編集後（next のみ付け替える）
   on_complete:
     condition: 合格
     next: tech-writer
   ```

   - `labels.examples` の `"backend:version-bumper"` の行を削除する
   - 編集後に `grep -c "version-bumper" .claude/teams/backend/workflow.yml` を実行し、出力が `0` であることを確認する

2. **`.claude/teams/backend/agents/version-bumper.md` を削除する**（ワークフローから参照されなくなるため）

3. **reviewer 系エージェント定義の引き継ぎ先ラベルを置換する**
   - 対象: `.claude/teams/backend/agents/reviewer.md`・`reviewer-a.md`・`reviewer-b.md`
   - `backend:version-bumper` をすべて `backend:tech-writer` に置換する

4. **DOD のバージョン管理セクション**（`.claude/teams/backend/dod/feature.md`・`bugfix.md`）
   - 「✅ バージョン管理」セクションを削除する（none ではチェック対象外）

> ⚠️ auto / manual を選択した場合はこの編集は不要です（manual はステップが残り、Version-Bumper がスキップ報告します）。

### フロントエンドチーム（選択時）

```
templates/teams/frontend/agents/*.md          → .claude/teams/frontend/agents/
templates/teams/frontend/workflow.yml         → .claude/teams/frontend/workflow.yml
templates/teams/frontend/review-config.yml    → .claude/teams/frontend/review-config.yml
templates/teams/frontend/dod/*.md             → .claude/teams/frontend/dod/
```

### コンテンツチーム（選択時）

```
templates/teams/content/agents/*.md           → .claude/teams/content/agents/
templates/teams/content/workflow.yml          → .claude/teams/content/workflow.yml
templates/teams/content/dod/*.md              → .claude/teams/content/dod/
templates/teams/content/compliance-rules/*.md → .claude/teams/content/compliance-rules/
```

### インフラチーム（選択時）

```
templates/teams/infra/agents/*.md  → .claude/teams/infra/agents/
templates/teams/infra/workflow.yml → .claude/teams/infra/workflow.yml
templates/teams/infra/dod/*.md     → .claude/teams/infra/dod/
```

### SNS運用チーム（選択時）

```
templates/teams/sns/agents/*.md  → .claude/teams/sns/agents/
templates/teams/sns/workflow.yml → .claude/teams/sns/workflow.yml
templates/teams/sns/dod/*.md     → .claude/teams/sns/dod/
```

### YouTube動画制作チーム（選択時）

```
templates/teams/youtube/agents/*.md         → .claude/teams/youtube/agents/
templates/teams/youtube/workflow.yml        → .claude/teams/youtube/workflow.yml
templates/teams/youtube/dod/*.md            → .claude/teams/youtube/dod/
templates/teams/youtube/PRODUCTION-GUIDE.md → .claude/teams/youtube/PRODUCTION-GUIDE.md
```

### チケットテンプレート（常に配置）

```
templates/.github/ISSUE_TEMPLATE/*.yml → .github/ISSUE_TEMPLATE/
```

### .gitignore への追記（常に実行）

AIチームの設定ファイルは各自の環境で `/ai-team-setup` を実行してセットアップするため、Git 管理から除外します。**追記前に `grep` で追記済みかを確認**し、未追記の場合のみ以下を実行してください（再実行しても重複しません）：

```bash
# 追記済み判定（この見出し行があれば追記しない）→ 未追記なら追記を実行
grep -qF "# @trimix/ai-team - AIチーム設定" .gitignore 2>/dev/null || cat >> .gitignore << 'EOF'

# @trimix/ai-team - AIチーム設定（各自の環境で /ai-team-setup を実行してください）
.claude/teams/
.claude/agents/
.claude/dod/
.claude/docs/
.claude/commands/
.claude/hooks/
.claude/ai-team-config.yml
.claude/escalation-rules.yml
.claude/model-profiles.yml

# @trimix/ai-team - チケット テンプレート
.github/ISSUE_TEMPLATE/
EOF
```

> **マルチユーザーモードで設定を共有する場合:**
>
> チーム全員が同じエージェント定義・ワークフローを使う場合は、`.gitignore` 追記後に `git add -f` で強制追加してください：
>
> ```bash
> git add -f .claude/teams/ .claude/agents/ .claude/dod/ .claude/docs/ \
>            .claude/ai-team-config.yml .claude/escalation-rules.yml \
>            .github/ISSUE_TEMPLATE/
> git commit -m "chore: AIチーム設定を追加"
> ```
>
> 以降は通常通り `git add` / `git commit` で変更を管理できます。
> 個人環境でのみ使う設定（`hooks/` など）は引き続き `.gitignore` で除外してください。

### 作業空間が worktree の場合の .gitignore 追記（質問4c で worktree を選択したときのみ）

質問4c で **ワークツリー** を選択した場合は、Implementer が生成する分離ワークツリー（`.claude/worktrees/`）を Git 管理から除外するため、`.gitignore` に追記します。**追記前に `grep` で追記済みかを確認**し、未追記の場合のみ実行してください（冪等。既に存在すれば何もしません）。ブランチ方式を選択した場合はこの追記は不要です。

```bash
grep -qxF ".claude/worktrees/" .gitignore 2>/dev/null || printf '\n# @trimix/ai-team - worktree 作業ディレクトリ\n.claude/worktrees/\n' >> .gitignore
```

## ステップ4: ラベルの作成（ticket_backend: github の場合）

### 4-1: リポジトリの確認

まず現在のディレクトリにGitHubリポジトリが設定されているか確認してください：

```bash
gh repo view --json nameWithOwner -q .nameWithOwner
```

**リポジトリが見つからない場合（エラーが出た場合）:**

以下のメッセージをユーザーに表示して、ラベル作成をスキップしてください：

```
⚠️  GitHubリポジトリが設定されていません

ラベルの作成をスキップします。
リポジトリを用意した後、以下のいずれかの方法でラベルを作成してください：

  A) 既存リポジトリを紐付ける場合:
     git remote add origin https://github.com/<org>/<repo>.git
     その後、/ai-team-setup を再実行してください

  B) 新しいリポジトリを作成する場合:
     gh repo create <repo-name> --public  （または --private）
     その後、/ai-team-setup を再実行してください
```

ラベル作成をスキップしてステップ5に進んでください。

**リポジトリが見つかった場合:** 4-2 に進みます。

### 4-2: 認証状態の確認

```bash
gh auth status
```

認証されていない場合はユーザーに `gh auth login` の実行を案内し、完了後に続けてください。

### 4-3: ラベル作成の確認

`AskUserQuestion` ツールを使い、以下を確認してください：

**質問**: チケット用ラベルを GitHub に作成しますか？（local のみ運用ならスキップ可）
- はい、今すぐ作成する（選択したチームに対応するラベルを一括作成）
- いいえ、スキップする（後で手動作成するか、/ai-team-setup を再実行して作成できます）

「いいえ」を選択した場合はステップ5に進んでください。

### 4-4: ラベルの作成

### 共通ラベル（常に作成）

```bash
gh label create "contributor:ready"   --color "0075ca" --description "Contributorが完了確認中"          --force
gh label create "escalated:human"     --color "d93f0b" --description "人間の判断が必要"                 --force
gh label create "epic"                --color "7057ff" --description "複数チームにまたがる大規模タスク"  --force
gh label create "dispatcher"          --color "7057ff" --description "Dispatcherが自動分解中"           --force
gh label create "incident"            --color "b60205" --description "インシデント報告"                 --force
gh label create "ai-team:in-progress" --color "fbca04" --description "AIエージェントが処理中（二重実行防止）" --force
gh label create "workspace:branch"    --color "006b75" --description "Implementerはブランチ方式で作業（既定の上書き）" --force
gh label create "workspace:worktree"  --color "006b75" --description "Implementerはワークツリー方式で作業（既定の上書き）" --force
```

> `workspace:branch` / `workspace:worktree` は Implementer の作業方式をチケット単位で上書きするためのラベルです（未付与時は `ai-team-config.yml` の `workspace.strategy` に従う）。両方を同時に付与すると矛盾としてエスカレーションされます。

### バックエンドチーム（選択時）

> ⚠️ 質問3で **使わない（none）** を選択した場合は、`backend:version-bumper` の行をスキップしてください（ワークフローにステップが存在しないため）。

```bash
gh label create "backend:tech-lead"      --color "1d76db" --description "Tech-Leadが要件分析・設計中"        --force
gh label create "backend:implementer"    --color "1d76db" --description "Implementerが実装中"                --force
gh label create "backend:reviewer"       --color "1d76db" --description "Reviewerがレビュー中"                --force
gh label create "backend:reviewer-a"     --color "1d76db" --description "Reviewer-Aがレビュー中"             --force
gh label create "backend:reviewer-b"     --color "1d76db" --description "Reviewer-Bがレビュー中"             --force
gh label create "backend:cross-review"   --color "1d76db" --description "クロスレビューで合意形成中"          --force
gh label create "backend:version-bumper" --color "1d76db" --description "Version-Bumperがバージョン更新中"   --force
gh label create "backend:tech-writer"    --color "1d76db" --description "Tech-Writerがドキュメント更新中"     --force
gh label create "backend:pr-creator"     --color "1d76db" --description "PR-CreatorがPR作成中"               --force
```

### フロントエンドチーム（選択時）

```bash
gh label create "frontend:designer"      --color "f9a825" --description "Designerがデザイン仕様策定中" --force
gh label create "frontend:frontend-lead" --color "f9a825" --description "Frontend-Leadが設計中"       --force
gh label create "frontend:developer"     --color "f9a825" --description "Developerが実装中"           --force
gh label create "frontend:reviewer"      --color "f9a825" --description "Reviewerがレビュー中"         --force
gh label create "frontend:reviewer-a"    --color "f9a825" --description "Reviewer-Aがレビュー中"      --force
gh label create "frontend:reviewer-b"    --color "f9a825" --description "Reviewer-Bがレビュー中"      --force
gh label create "frontend:cross-review"  --color "f9a825" --description "クロスレビューで合意形成中"   --force
gh label create "frontend:pr-creator"    --color "f9a825" --description "PR-CreatorがPR作成中"        --force
```

### コンテンツチーム（選択時）

```bash
gh label create "content:editor-in-chief" --color "e4e669" --description "Editor-in-Chiefが方針決定中" --force
gh label create "content:researcher"      --color "e4e669" --description "Researcherが調査中"           --force
gh label create "content:writer"          --color "e4e669" --description "Writerが執筆中"               --force
gh label create "content:compliance"      --color "e4e669" --description "Complianceがチェック中"       --force
```

### インフラチーム（選択時）

```bash
gh label create "infra:infra-lead"        --color "0e8a16" --description "Infra-Leadが設計中"            --force
gh label create "infra:network-engineer"  --color "0e8a16" --description "Network-Engineerが実装中"      --force
gh label create "infra:infra-specialist"  --color "0e8a16" --description "Infra-Specialistが実装中"      --force
gh label create "infra:security-engineer" --color "0e8a16" --description "Security-Engineerがレビュー中" --force
gh label create "infra:architect"         --color "5319e7" --description "Architectが助言中（依頼時のみ）" --force
```

### SNS運用チーム（選択時）

```bash
gh label create "sns:strategist" --color "e91e63" --description "Strategistが戦略策定中"          --force
gh label create "sns:researcher" --color "e91e63" --description "Researcherが調査中"              --force
gh label create "sns:writer"     --color "e91e63" --description "Writerが投稿文執筆中"            --force
gh label create "sns:operator"   --color "e91e63" --description "Operatorがガイドライン確認中"    --force
```

### YouTube動画制作チーム（選択時）

```bash
gh label create "youtube:director"             --color "c4302b" --description "Directorが統括・タスク判定中"          --force
gh label create "youtube:market-analyst"       --color "c4302b" --description "Market-Analystが市場・ジャンル戦略を分析中" --force
gh label create "youtube:channel-producer"     --color "c4302b" --description "Channel-Producerがチャンネル設計・編成中"   --force
gh label create "youtube:scriptwriter"         --color "c4302b" --description "Scriptwriterが台本を執筆中"             --force
gh label create "youtube:editor"               --color "c4302b" --description "Editorがレンダ（動画生成）を実行中"      --force
gh label create "youtube:growth-strategist"    --color "c4302b" --description "Growth-Strategistがパッケージング設計中" --force
gh label create "youtube:affiliate"            --color "c4302b" --description "Affiliateがアフィリ収益設計中"          --force
gh label create "youtube:publisher"            --color "c4302b" --description "Publisherが公開・字幕登録中"            --force
gh label create "youtube:sns-distributor"      --color "c4302b" --description "SNS-DistributorがSNS拡散を設計中"       --force
gh label create "youtube:monetizer"            --color "c4302b" --description "Monetizerが収益最大化施策を提案中"       --force
gh label create "youtube:script-qa"            --color "c4302b" --description "Script-QAが台本成果物をQA中"            --force
gh label create "youtube:render-reviewer"      --color "c4302b" --description "Render-Reviewerがレンダ成果物をQA中"     --force
gh label create "youtube:growth-qa"            --color "c4302b" --description "Growth-QAがパッケージング成果物をQA中"   --force
gh label create "youtube:affiliate-qa"         --color "c4302b" --description "Affiliate-QAがアフィリ成果物をQA中"      --force
gh label create "youtube:publish-qa"           --color "c4302b" --description "Publish-QAが公開成果物をQA中"           --force
gh label create "youtube:sns-qa"               --color "c4302b" --description "SNS-QAがSNS拡散成果物をQA中"            --force
gh label create "youtube:monetizer-qa"         --color "c4302b" --description "Monetizer-QAが収益施策成果物をQA中"      --force
gh label create "youtube:channel-producer-qa"  --color "c4302b" --description "Channel-Producer-QAが企画/編成成果物をQA中" --force
```

`--force` オプションにより既存ラベルは上書き更新されます。

## ステップ5: プロジェクト指示書への追記（runtime 別）

指示本文の SSOT はパッケージの次ファイルです（コピペ元）:

```
templates/_shared/project-rules/ai-team-rules.md
```

有効チーム名を `### 有効なチーム` に埋めたうえで、**runtime に応じて次の場所へ追記**してください。

| runtime | 必須の配置 | 理由 |
|---------|-----------|------|
| `claude-code` | `.claude/CLAUDE.md`（無ければ作成、あれば末尾追記） | Claude Code のプロジェクトメモリ |
| `grok` | **両方**: ルートの `AGENTS.md`（無ければ作成、あれば末尾追記） **および** `.claude/CLAUDE.md` | Grok は `AGENTS.md` を第一に読む。`.claude/CLAUDE.md` も互換で読むため両方置く |

> Grok は `CLAUDE.md` / `.claude/CLAUDE.md` も互換ロードしますが、**Grok 向けの正規は `AGENTS.md`** です。runtime 切替時（再 setup）も欠けていれば追記してください。

#### 配置コマンド例（runtime=grok）

```bash
# 指示本文を一時ファイル化してから追記（重複見出しがある場合はスキップ）
RULES=<パッケージルート>/templates/_shared/project-rules/ai-team-rules.md

# Claude 互換
mkdir -p .claude
grep -qF "## AIチーム設定" .claude/CLAUDE.md 2>/dev/null || cat "$RULES" >> .claude/CLAUDE.md

# Grok 正規
grep -qF "## AIチーム設定" AGENTS.md 2>/dev/null || cat "$RULES" >> AGENTS.md
```

#### runtime 別の主なパス一覧（setup 全体）

| 用途 | claude-code | grok（追加・主） |
|------|-------------|------------------|
| プロジェクト指示 | `.claude/CLAUDE.md` | `AGENTS.md` + `.claude/CLAUDE.md` |
| エージェント定義 | `.claude/agents/` / `.claude/teams/*/agents/` | 左記 + ミラー `.grok/agents/` |
| スキル（コマンド） | `.claude/commands/` | 左記 + ミラー `.grok/commands/` |
| チケット強制フック本体 | `.claude/hooks/ensure-issue.sh` | 同じ（共有） |
| フック登録 | `.claude/settings.json` | 左記 + `.grok/hooks/ensure-issue.json` |
| 運用設定 | `.claude/ai-team-config.yml`（`runtime` キー） | 同じ |

## ステップ5.5: baseline の記録（すべての配置・プロファイル適用の後に必ず実行）

`upgrade` は「前回このツールが配置した内容（baseline）」と現物のハッシュを照合して、ユーザーが手編集したファイルを保護します。セットアップの最後に、**配置済みの全ファイルを baseline として記録**してください。これをしないと、`upgrade` が「記録が無い＝判定不能」として全ファイルを安全側で保護し、更新できなくなります。

**必ず、ファイル配置（ステップ3）とモデル・effort の反映が完了した後に**、次を実行します。

```bash
# <パッケージルート> は npm なら node_modules/@trimix/ai-team、ソースならリポジトリルート
node <パッケージルート>/bin/setup.js baseline record --force
```

`--force` を付けるのは、プロファイル適用（`apply-model-profile.js`）が変更ファイル分の baseline を先に作っている場合があり、それを完全な内容で確実に再確立するためです（セットアップ直後＝ユーザー編集前のこの時点でのみ安全に上書きできます）。以後、ユーザーが手編集したファイルは `upgrade` で自動的に保護されます。

## コマンド失敗時のフォールバック

`gh` コマンドやファイル操作（`cp` / `mkdir` 等）が失敗した場合は、失敗を無視して先に進んではいけません。

1. **1回だけリトライする**（一時的な失敗の可能性があるため）
2. リトライでも失敗した場合は、**実行すべきコマンドをそのままユーザーに提示して停止**する

## 報告前チェック

完了報告の前に以下を確認してください。

- [ ] 配置したファイルが実在する（`ls .claude/agents/ .claude/teams/<選択チーム>/` で確認）
- [ ] `.claude/ai-team-config.yml` に選択した `mode` / `version_management` / `workspace.strategy` / `model_performance` / `effort_depth` / `runtime` が記録されている
- [ ] `.claude/ai-team-config.yml` に `delegation_watchdog`（`stall_threshold_minutes` / `max_redelegations`）が記録されている（Issue #99。キー不在でも既定値で動作するが、setup が生成する config には明記する）
- [ ] 質問4c で worktree を選んだ場合、`.gitignore` に `.claude/worktrees/` が追記されている（`grep -qxF ".claude/worktrees/" .gitignore`）
- [ ] モデル・effort プロファイルを配置済み md に反映済み（tech-lead / pr-creator / ai-team-run の frontmatter を spot チェック）
- [ ] `.claude/model-profiles.yml` が配置されている
- [ ] runtime=claude-code のとき、質問7 の結果が `node <パッケージルート>/bin/setup.js advisor check --profile <performance>` の実効値と一致している（「設定しない」を選んだ場合は `.claude/settings.local.json` が実行前と同じ。ただし、決定7 の `.gitignore` 追記に同意したときは `.gitignore` だけが変わる）。`.gitignore` の追記を提案した／した結果（追記した・断られた・追跡中で警告・対象外）を確認した。runtime=grok なら質問7 を聞いていない
- [ ] プロジェクト指示: `claude-code` なら `.claude/CLAUDE.md`、`grok` なら `AGENTS.md` と `.claude/CLAUDE.md` の両方に AIチーム設定がある
- [ ] `runtime=grok` なら `.grok/agents/` にエージェントがミラーされている
- [ ] hooks 選択時: `.claude/hooks/ensure-issue.sh` があり、`grok` なら `.grok/hooks/ensure-issue.json` もある
- [ ] `.gitignore` に追記済みである（`grep -F "@trimix/ai-team" .gitignore`）
- [ ] baseline を記録済みである（`.claude/.template-baseline.json` が存在する。無ければ `node <パッケージルート>/bin/setup.js baseline record --force` を実行）
- [ ] ラベルを作成した場合、実行した `gh label create` がすべて成功した
- [ ] 質問3で none を選択した場合、`grep -c "version-bumper" .claude/teams/backend/workflow.yml` の出力が `0` である

## ステップ6: 完了報告

**[件数] の数え方:**
- 作成ラベル数 = 実行に成功した `gh label create` コマンドの本数
- 配置ファイル数 = ステップ3でコピー・生成したファイルパスの数（ワイルドカード行は展開後の実ファイル数を数える）

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: [チーム名一覧]
- 実行基盤 runtime: [claude-code / grok]
- 作成ラベル数: [件数]件
- 配置ファイル数: [件数]件
- モデル性能: [balance / high-performance / low-cost]
- effort 深度: [normal / deep / light]
- advisor のモデル: [fable / opus / 設定しない / 解除 / 対象外（grok）]（実効値と、その値がある場所。書き込み先の絶対パス）
- `.gitignore` への追記: [追記した / 断られた / すでに管理外 / 追跡中（警告のみ） / git 外 / 提案不要（設定しない・R1 なし）]

## 次のステップ
1. プロジェクト指示を確認・カスタマイズ（claude-code: `.claude/CLAUDE.md` / grok: `AGENTS.md` と `.claude/CLAUDE.md`）
2. チームメンバーに `npm install --save-dev ./trimix-ai-team-x.x.x.tgz` を実行してもらいます
3. チケットを作成し `/ai-team-run <番号>` でワークフローを開始します
4. runtime 切替は `/ai-team-setup` の「設定の切替のみ」または `apply-model-profile.js --runtime ...`
5. advisor のモデルの変更は `/ai-team-setup` の「設定の切替のみ」で行う（`/advisor` の選択より個人設定が優先されるため、`/advisor` では変わりません）

## カスタマイズ
- エージェント定義: `.claude/teams/<チーム>/agents/`（grok 時は `.grok/agents/` も）
- ワークフロー: `.claude/teams/<チーム>/workflow.yml`
- DOD: `.claude/teams/<チーム>/dod/`
- **モデル / effort の個別調整**: 各 md の `model` / `effort` を直接編集
- **プロファイルの一括変更**: `node <パッケージルート>/bin/lib/apply-model-profile.js --runtime <claude-code|grok> --profile <id> --effort <id> --dir .claude`

## 運用モードについて
- **マルチユーザーモード**: チケットを作成し、担当者をアサインしたら `/ai-team-run <チケットのURL>` でワークフローを開始します
- **ソロモード**: `/ai-team-watch` を実行すると新しいチケットの自動監視が始まります。停止するまでバックグラウンドで動作します
```
