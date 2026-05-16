# @trimix/ai-team

Claude Code を使ったAIチームをプロジェクトに導入するセットアップパッケージです。

GitHub Issues（またはJira・Linear等）のチケットをトリガーに、エンジニア・コンテンツ・インフラの各AIチームが自律的にタスクを処理します。

---

## インストール

配布された `.tgz` ファイルをプロジェクトルートに置いて実行してください：

```bash
npm install --save-dev ./trimix-ai-team-0.1.0.tgz
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
npm install --save-dev ./trimix-ai-team-0.2.0.tgz
```

---

## パッケージのビルド（配布元）

```bash
npm pack
# → trimix-ai-team-<version>.tgz が生成される
```

生成されたファイルをパートナーに配布してください。
