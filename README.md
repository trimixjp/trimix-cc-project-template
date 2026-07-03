# @trimix/ai-team

Claude Code を使ったAIチームをプロジェクトに導入するセットアップパッケージです。

GitHub Issues（またはJira・Linear等）のチケットをトリガーに、エンジニア・コンテンツ・インフラの各AIチームが自律的にタスクを処理します。

---

## インストール

配布された `.tgz` ファイルをプロジェクトルートに置いて実行してください：

```bash
npm install --save-dev ./trimix-ai-team-<version>.tgz
```

インストール完了時に Skillファイルが `.claude/commands/` に自動展開されます。

### AIチームをセットアップする

Claude Code を起動して以下を実行してください：

```
/ai-team setup
```

対話形式で有効にするチーム・チケット管理システムを選択すると、`.claude/` にエージェント定義・ワークフロー・DODテンプレートが配置されます。

---

## 使い方

チケットを担当したら Claude Code で以下を実行します：

```
/ai-team run <チケットURL>
```

**例（GitHub Issues）:**
```
/ai-team run https://github.com/your-org/your-repo/issues/42
```

AIチームがチケットを読み込み、ワークフローに従って自律的に処理します。人間の判断が必要な場面（PRのマージ・エスカレーション等）では自動的に停止して案内します。

---

## AIチームの構成

### エンジニアチーム
Tech-Lead → Implementer → Reviewer → PR-Creator → （人間がマージ）

### フロントエンドチーム
Designer → Frontend-Lead → Developer → Reviewer → PR-Creator → （人間がマージ）

### コンテンツチーム
Editor-in-Chief → Researcher（必要時）→ Writer → Compliance

### インフラチーム
Infra-Lead → Network-Engineer / Infra-Specialist → Security-Engineer

---

## チケット管理の担当交代

担当者が休暇中などでチケットを他のメンバーに再アサインした場合、新しい担当者が `/ai-team run` を実行するだけで同じワークフローが継続します。

---

## パッケージの更新

新しいバージョンの `.tgz` を受け取ったら、再度 `npm install` を実行してください：

```bash
npm install --save-dev ./trimix-ai-team-<version>.tgz
```

---

## ドキュメント

| ドキュメント | 説明 |
|------------|------|
| [業務ドメイン別クイックスタート](.claude/docs/quickstart-by-domain.md) | B2B SaaS / EC / コンテンツメディア / 受託開発 / 社内ツールの導入手順 |
| [ワークフロー設計ガイド](.claude/docs/domain-workflow-guide.md) | 業務ドメイン別のワークフロー設計理論・調整ポイント |
| [ワークフロー定義リファレンス](.claude/docs/workflow-guide.md) | `workflow.yml` の構文・フィールド一覧 |
| [エージェント定義ガイドライン](.claude/docs/agent-writing-guide.md) | エージェント定義ファイルの記述スタイル・テンプレート |

---

## パッケージのビルド（配布元）

```bash
npm pack
# → trimix-ai-team-<version>.tgz が生成される
```

生成されたファイルをパートナーに配布してください。

> ⚠️ 生成した tgz ファイルはリポジトリにコミットしないでください（`.gitignore` で除外済み）。

---

## ソースからビルドしてインストール（git clone）

配布された `.tgz` を受け取っていない場合は、リポジトリを clone してソースから `.tgz` を生成し、それを対象プロジェクトに導入できます。

```bash
# 1. リポジトリを clone
git clone <repo-url>
cd trimix-cc-project-template

# 2. 依存をインストール
npm install

# 3. tgz を生成（prepack でドキュメントも自動生成されます）
npm pack
# → trimix-ai-team-<version>.tgz が生成される

# 4. 導入したいプロジェクトで tgz をインストール
cd /path/to/your-project
npm install --save-dev /path/to/trimix-ai-team-<version>.tgz
```

インストール後は `.tgz` 方式と同じく、Claude Code で `/ai-team setup` を実行してセットアップを完了してください。

> ⚠️ clone したリポジトリをそのまま作業プロジェクトとして使う運用は現在サポートしていません。
> `postinstall` はパッケージ自身のディレクトリでは自動展開をスキップし、clone 直後はドキュメント（`ai-team-manual-dist/`）も未生成のためです。
> 必ず上記のように `.tgz` を生成し、別プロジェクトへインストールしてください。
