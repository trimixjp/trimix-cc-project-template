# @trimix/ai-team

Claude Code（および Grok Build）を使った AI チームをプロジェクトに導入するセットアップパッケージです。

**チケット**をトリガーに、エンジニア・コンテンツ・インフラの各 AI チームが自律的にタスクを処理します。チケットの置き場は setup で選べます。

| 方式 | 説明 |
|------|------|
| **GitHub Issues**（既定） | 協業・PR 連携向き |
| **ローカル Markdown** | リポジトリ内 `tickets/*.md`。GitHub 不要・オフライン可。Obsidian 推奨 |
| Jira・Linear 等 | 起動は可能。一部操作は手動になる場合あり |

ローカル Markdown は本テンプレートの特徴です。プライベート GitHub が使えない環境でも同じワークフローを回せます。
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
/ai-team-setup
```

対話形式で有効にするチーム・チケット管理システムを選択すると、`.claude/` にエージェント定義・ワークフロー・DODテンプレートが配置されます。

---

## 使い方

チケットを担当したら Claude Code で以下を実行します：

```
/ai-team-run <チケットURL>
```

**例（GitHub Issues）:**
```
/ai-team-run https://github.com/.*/issues/42
```

**例（チケット作成 → 起動）:**
```
/ai-team-ticket create
```
スキルがタイトル・本文（と任意で起動ラベル）を聞いて作成します。番号が分かったら:

```
/ai-team-run 1
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

担当者が休暇中などでチケットを他のメンバーに再アサインした場合、新しい担当者が `/ai-team-run` を実行するだけで同じワークフローが継続します。

---

## パッケージの更新

更新は 2 段階です。**`npm install` だけではエージェント定義は更新されません。**

### 1. パッケージ本体を入れ替える

```bash
npm install --save-dev ./trimix-ai-team-<version>.tgz
```

これで更新されるのは `.claude/commands/`（スキル）と `ai-team-manual/`（マニュアル）だけです。

### 2. テンプレートを更新する

`.claude/agents/`・`.claude/teams/`・`.claude/dod/`・`escalation-rules.yml`・`model-profiles.yml` は、次のコマンドで更新します。

```bash
# まず差分を確認する（何も書き込みません）
npx @trimix/ai-team upgrade --dry --diff

# 問題なければ適用する
npx @trimix/ai-team upgrade
```

適用前に、上書き対象のファイルが `.ai-team-backups/<日時>/` へ自動退避されます。バックアップに失敗した場合、アップグレードは中止されます。

### カスタマイズしたファイルは上書きされません

`upgrade` は、ツールが最後に配置した内容のハッシュを `.claude/.template-baseline.json` に記録しています。**あなたが編集したファイルは検出され、保護されます。**

| ファイルの状態 | 動作 |
|---|---|
| 未編集 | 最新テンプレートへ更新 |
| 編集済み | **本体を維持**し、最新テンプレートを `<ファイル名>.new` として隣に書き出す |
| 判定不能（baseline に記録が無い） | 安全側に倒して保護 |

`.new` が置かれたら、`diff` で差分を確認して手で取り込んでください。取り込みが済んだら `.new` を削除します。

```bash
diff .claude/teams/backend/workflow.yml{,.new}
```

意図的に上書きしたい場合は `--force` を使います。ただし**あなたの編集は失われます**（バックアップからは復元できます）。

`/ai-team-setup` で選んだモデルプロファイル（`model` / `effort`）は、upgrade 後も維持されます。

今後も自分で管理したいファイルには、先頭 5 行以内に `# customized: true` を書いておくと、ハッシュに関わらず常に保護されます。

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

インストール後は `.tgz` 方式と同じく、Claude Code で `/ai-team-setup` を実行してセットアップを完了してください。

> ⚠️ clone したリポジトリをそのまま作業プロジェクトとして使う運用は現在サポートしていません。
> `postinstall` はパッケージ自身のディレクトリでは自動展開をスキップし、clone 直後はドキュメント（`ai-team-manual-dist/`）も未生成のためです。
> 必ず上記のように `.tgz` を生成し、別プロジェクトへインストールしてください。
