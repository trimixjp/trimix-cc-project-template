# エージェントのカスタマイズ

## エージェント定義ファイルとは

各エージェントの動作は `.claude/teams/{チーム}/agents/*.md` に配置された Markdown ファイルで定義されています。インストール時にパッケージ同梱のデフォルト定義が展開されますが、プロジェクトの運用ルールに合わせてファイルを直接編集することでエージェントの動作を変更できます。

---

## ファイルの基本構造

エージェント定義ファイルは YAML frontmatter と Markdown セクションで構成されます。

```markdown
---
name: エージェント名
description: 一行の説明
---

# エージェント名

## 役割
このエージェントが担当する責務を記述します。

## 起動条件
どのタイミングで起動されるかを記述します。

## 動作フロー
起動後にどのような手順で処理を進めるかを記述します。
チケットへのコメント投稿や次のエージェントへの引き継ぎ手順を含めます。

## チケットコメントフォーマット
このエージェントが チケットに投稿するコメントのテンプレートを記述します。

## エスカレーション条件
human-escalator を呼び出すべき状況を具体的に列挙します。

## 重要な原則
このエージェントが遵守すべきルールや制約を記述します。
```

frontmatter の `name` と `description` は Claude Code がエージェントを識別するために使用します。`description` は 1 行で簡潔に記述してください。

### モデル・effort 指定（カスタマイズ）

全エージェント定義とスキルは frontmatter で `model` / `effort` / `model_role` を明示します。  
**バージョン付きモデル ID（例: `claude-opus-4-7`）は禁止**です。runtime が解釈するエイリアスのみ使います。

```markdown
---
name: tech-lead
description: バックエンドチームのリーダーAI
model: opus
effort: high
model_role: leader
---
```

| frontmatter | 意味 |
|-------------|------|
| `model` | 実行モデルのエイリアス（runtime 依存） |
| `effort` | 推論深度（`low` / `medium` / `high` / `xhigh` / `max`。runtime・モデルにより利用可範囲が異なる） |
| `model_role` | プロファイル適用時の役割ヒント（`leader` / `worker` / `simple`） |

#### setup での一括設定

`/ai-team-setup` で次を選び、全エージェント・スキルへ反映します。**再 setup の「設定の切替のみ」でも変更可能**です。

1. **runtime** … `claude-code`（既定）または `grok`
2. **性能プロファイル** … ハイパフォーマンス / バランス / 低コスト
3. **effort 深度** … 深く / 普通 / 軽く

設定値は `.claude/ai-team-config.yml` の `runtime` / `model_performance` / `effort_depth` に記録されます。

#### Claude Code（`runtime: claude-code`）

| 性能 | leader | worker | simple |
|------|--------|--------|--------|
| ハイパフォーマンス | fable | opus | sonnet |
| バランス（デフォルト） | opus | sonnet | haiku |
| 低コスト | sonnet | sonnet | haiku |

| effort 深度 | effort 値 |
|------------|-----------|
| 深く | xhigh |
| 普通（デフォルト） | high |
| 軽く | medium |

#### Grok Build（`runtime: grok`）

| 性能 | leader | worker | simple |
|------|--------|--------|--------|
| ハイパフォーマンス / バランス | grok-4.5 | grok-4.5 | grok-composer-2.5-fast |
| 低コスト | grok-composer-2.5-fast | 同左 | 同左 |

| effort 深度 | effort 値 |
|------------|-----------|
| 深く / 普通 | high（Grok では xhigh を使わない） |
| 軽く | medium |

Grok 選択時は `.grok/agents/` と `.grok/commands/` にもエージェント・スキルがミラーされます。プロジェクト指示は **`AGENTS.md`（正規）** と `.claude/CLAUDE.md`（互換）の両方に配置します（詳細は [セットアップ](setup.md)）。

#### 役割（model_role）

| role | 例 | 期待 |
|------|-----|------|
| `leader` | dispatcher, tech-lead, frontend-lead | 次担当へ渡す チケットに**詳細な設計書**を書く |
| `worker` | implementer, developer, reviewer | リーダーの設計に従って実装・検証 |
| `simple` | pr-creator, version-bumper | 定型処理 |

#### 細かいカスタマイズ（md 直接編集）

**個別にモデルや effort だけ変えたい場合は、対象 md の frontmatter を直接編集してください。**

```bash
# 例: 実装者だけ sonnet → opus にしたい
# .claude/teams/backend/agents/implementer.md の model: を編集
```

一括でプロファイルを掛け直す場合（**個別編集は上書きされる**点に注意）:

```bash
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime claude-code \
  --profile balance \
  --effort normal \
  --dir .claude

# Grok に切替
node node_modules/@trimix/ai-team/bin/lib/apply-model-profile.js \
  --runtime grok \
  --profile balance \
  --effort normal \
  --dir .claude
```

定義の写し: `.claude/model-profiles.yml`  
実装の SSOT: `bin/lib/model-profiles.js`  
記述ルール詳細: プロジェクト内 `.claude/docs/agent-writing-guide.md` の §3-8

---

## 全エージェント共通の統一規約（v0.11.0）

v0.11.0 から、全エージェント定義は次の 3 つの規約に従います。`/ai-team-create`・`/ai-team-configure` が生成するエージェント定義もこの規約に対応しています。

### 1. 完了条件（exit criteria）チェックリスト

各エージェントの動作フローの末尾に、そのステップを「完了」とみなす条件をチェックリストで明記します。

```markdown
## 完了条件（exit criteria）

- [ ] 設計方針コメントを チケットに投稿した
- [ ] 参照したルール・仕様書を方針コメントに明記した
- [ ] 次のステップのラベル（`backend:implementer`）を付与した
```

1 つでも未充足の項目がある状態で次のステップへ引き継いではいけません。

### 2. 状態記録の原則

- ワークフローの状態は **チケットのラベルとコメントのみ**で表現する（エージェントの内部状態・会話コンテキストに依存しない）
- セッションが中断しても `/ai-team-resume` が**コメント履歴のみ**で状態を復元できる状態を常に保つ
- 判断・分岐を行った場合は、その根拠と参照ドキュメントを必ずコメントに残す

### 3. コメント必須 5 フィールド

各エージェントの完了報告コメントには、以下の 5 フィールドを必ず含めます。

| フィールド | 内容 |
|-----------|------|
| 実施内容 | このステップで何を行ったか |
| 成果物 | 作成・変更したファイル・PR・コメント等の一覧 |
| 判断根拠 | 分岐・選択を行った理由と参照したルール・ドキュメント |
| 完了条件チェック | 完了条件（exit criteria）の充足状況 |
| 次のアクション | 次に起動するステップ・付与するラベル（`⏭️ 次のアクション:` 行で明示） |

記述方法の詳細は `.claude/docs/agent-writing-guide.md`（エージェント定義ファイル記述ガイドライン）を参照してください。

### 4. モデル非依存の記述標準（v0.23.0）

v0.23.0 から、実行するモデルの推論能力に依存せず同等品質で動作させるための記述標準が追加されました（agent-writing-guide §9-5〜9-8）。全エージェント定義とカスタムチーム用のベーステンプレート（`_agent-template.md`）がこの標準に従います。

| 節 | 標準 | 内容 |
|----|------|------|
| §9-5 | 「失敗時挙動」セクションの必須化 | 前提が崩れた場合（ファイル欠落・コマンド失敗・0 件検出等）の対応を、全エージェントが「失敗時挙動」セクションとして明文で持つ。既定原則は「安全側に倒す」 |
| §9-6 | 機械的検証の原則 | 合否・分岐の判定は、コマンド出力・正規表現照合など機械的に再現できる基準で行う（人間の感覚・モデルの裁量に委ねない） |
| §9-7 | モデル非依存の原則 | 「適切に」「柔軟に」等、モデルの推論能力に依存する曖昧な指示を避け、決定表・手順として書き下す |
| §9-8 | 設定値のハードコード禁止 | しきい値・ラベル名等は設定ファイル（workflow.yml・review-config.yml 等）を単一情報源とし、エージェント本文に重複記載しない |

自前のエージェントを追加・編集する場合も、この標準に沿って「失敗時挙動」セクションと決定表による分岐判定を記述することを推奨します。

---

## 既存エージェントの変更方法

`.claude/teams/{チーム}/agents/` 配下の対象ファイルをテキストエディタで直接編集します。よく変更される箇所は以下のとおりです。

**動作フローを変更する場合**
`## 動作フロー` セクションの手順を書き換えます。たとえばテスト実施の基準を厳格化したい場合は、Implementer の動作フローにカバレッジ閾値の確認ステップを追記します。

**コメントフォーマットを変更する場合**
`## チケットコメントフォーマット` セクションのテンプレートを書き換えます。プロジェクト固有の情報（チケット番号形式・通知先など）を追加する場合に使います。

**エスカレーション条件を変更する場合**
`## エスカレーション条件` セクションの記述を変更します。AI に判断させる範囲を広げたい場合は条件を減らし、人間の承認を必須にしたい操作がある場合は条件を追加します。

---

## 新しいエージェントの追加方法

1. `.claude/teams/{チーム}/agents/` に新しい `.md` ファイルを作成し、上記の基本構造に従って定義を記述します。
2. `.claude/teams/{チーム}/workflow.yml` の `steps` リストに追加したエージェントのファイル名（拡張子なし）を記述します。

```yaml
steps:
  - agent: tech-lead
  - agent: implementer
  - agent: your-new-agent   # 追加したエージェント
  - agent: reviewer
```

追加後は `/ai-team-run` で動作を確認してください。

---

## 共通エージェントについて

`dispatcher`（Epic の チケット分解）・`contributor`（チケットクローズ管理）・`human-escalator`（人間へのエスカレーション）の 3 エージェントは `.claude/agents/` に配置されており、全チームで共有されます。これらは特別な理由がない限り変更不要です。変更する場合は全チームの動作に影響することを念頭においてください。

---

## 詳細な各エージェントの仕様

チームごとの全エージェントの役割・起動条件・コメントフォーマットの詳細は `agents/` ディレクトリの各ページを参照してください。
