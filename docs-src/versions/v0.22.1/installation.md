# インストールとセットアップ

`@trimix/ai-team` の導入は **2 ステップ** で完了します。

> **⚠️ `npm install` だけでは使えません**
>
> インストールはスキルファイルの展開のみです。チーム・ワークフロー・ラベルを
> 設定するには、**必ずステップ 2 の `/ai-team-setup` を実行**してください。

---

## ステップ 1: npm install

配布された `.tgz` ファイルをプロジェクトルートに配置して、開発依存としてインストールします。

```bash
cd /path/to/your-project
npm install --save-dev ./trimix-ai-team-0.7.0.tgz
```

完了すると以下のメッセージが表示されます。

```
✅ @trimix/ai-team: 7 件のSkillファイルを .claude/commands/ に展開しました
   Claude Code で /ai-team-setup を実行してセットアップを完了してください
```

この時点では `.claude/commands/` にスキルファイルが置かれただけです。
**エージェント・ワークフロー・ラベルはまだ作成されていません。**

---

## ステップ 2: /ai-team-setup を実行する

Claude Code を起動し、セットアップウィザードを実行します。

```
/ai-team-setup
```

ウィザードが対話形式で以下を設定します。

| # | 設定項目 | 選択肢 |
|---|---------|--------|
| 1 | 導入するチーム | backend / frontend / content / infra / sns（複数選択可） |
| 2 | 運用モード | multi-user（手動起動）/ solo（自動監視） |
| 3 | バージョン管理 | auto（自動インクリメント）/ manual（手動管理） |
| 4 | Issue 強制チェック | CLAUDE.md のみ / hooks で強制 |
| 5 | GitHub ラベルの作成 | 今すぐ一括作成 / スキップ |

セットアップ完了後のメッセージ例：

```
✅ AIチームのセットアップが完了しました

## セットアップ内容
- 有効なチーム: バックエンドチーム、フロントエンドチーム
- 作成ラベル数: 15件
- 配置ファイル数: 32件

## 次のステップ
1. .claude/CLAUDE.md を確認・カスタマイズしてください
2. Issue を作成し /ai-team-run <Issue番号> でワークフローを開始します
```

詳細は [セットアップガイド](guide/setup.html) を参照してください。

---

## セットアップ後のディレクトリ構成

`/ai-team-setup` を実行すると、選択したチームに応じて以下が配置されます（バックエンド + hooks 選択の例）。

```
.claude/
├── CLAUDE.md                       # AIチーム設定・タスク受付ルール
├── ai-team-config.yml              # 運用モード・バージョン管理設定
├── escalation-rules.yml            # エスカレーション条件
├── agents/
│   ├── contributor.md              # 全体管理エージェント
│   ├── dispatcher.md               # Epic 分解エージェント
│   └── human-escalator.md          # 人間エスカレーションエージェント
├── teams/
│   └── backend/
│       ├── workflow.yml            # ワークフロー定義
│       ├── review-config.yml       # ダブルレビュー判定基準
│       ├── agents/                 # tech-lead / implementer / reviewer など
│       └── dod/                    # feature / bugfix / refactor テンプレート
├── dod/
│   ├── README.md
│   └── incident.md
├── incidents/
│   ├── README.md
│   ├── TEMPLATE.md
│   └── index.yml
├── docs/
│   └── workflow-guide.md
├── hooks/                          # hooks を選択した場合のみ
│   └── ensure-issue.sh
└── commands/                       # postinstall で展開済み（編集不要）
    ├── ai-team-setup.md
    ├── ai-team-run.md
    ├── ai-team-watch.md
    ├── ai-team-resume.md
    ├── ai-team-gallery.md
    ├── ai-team-install.md
    └── ai-team-configure.md
```

`.github/ISSUE_TEMPLATE/` には、選択したチームに応じた Issue テンプレートが配置されます。

---

## 補足: git clone からソースをビルドして導入する

配布された `.tgz` を受け取っていない場合は、リポジトリを clone してソースから `.tgz` を生成し、それを対象プロジェクトに導入できます（ステップ 1 の代替）。

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

以降は `.tgz` 方式と同じです。**ステップ 2 の `/ai-team-setup`** を実行してセットアップを完了してください。

> **⚠️ clone したリポジトリ自体を作業プロジェクトにはできません**
>
> `postinstall` はパッケージ自身のディレクトリ（`projectRoot === packageRoot`）では
> スキルの自動展開をスキップし、clone 直後はドキュメント（`ai-team-manual-dist/`）も
> 未生成です。必ず上記のように `.tgz` を生成し、別プロジェクトへインストールしてください。

---

## バージョンアップ時

新しい `.tgz` ファイルを受け取ったら、同じく `npm install` を実行します。古い `.tgz` は削除して構いません。

```bash
npm install --save-dev ./trimix-ai-team-x.x.x.tgz
```

`postinstall` が再実行され `.claude/commands/` のスキルファイルが最新版に更新されます。`.claude/teams/` 配下のカスタマイズ済みファイルは上書きされません。

---

## postinstall が失敗した場合

postinstall は失敗してもエラーで終了せず、警告のみ表示します。

```
⚠️  @trimix/ai-team: Skillファイルの展開に失敗しました
   手動で npx ai-team install を実行してください
```

手動展開する場合は次のコマンドを実行します。

```bash
npx @trimix/ai-team install
```

---

## CLI コマンド一覧

| コマンド | 用途 |
|---------|------|
| `npx @trimix/ai-team install` | スキルファイルを `.claude/commands/` に展開 |
| `npx @trimix/ai-team install <team_id>` | ワークフロープラグインをインストール |
| `npx @trimix/ai-team gallery` | 利用可能なプラグイン一覧を表示 |
| `npx @trimix/ai-team list` | インストール済みプラグインを表示 |
| `npx @trimix/ai-team uninstall <team_id>` | プラグインをアンインストール |
| `npx @trimix/ai-team --version` | バージョンを表示 |
| `npx @trimix/ai-team --help` | ヘルプを表示 |

利用可能なチーム ID は `backend` / `frontend` / `content` / `infra` / `sns` の 5 つです。

---

## アンインストール

```bash
npm uninstall @trimix/ai-team
```

`.claude/commands/` 内のスキルファイルは自動削除されません。完全に削除する場合は手動で `.claude/` ディレクトリを整理してください。

---

## 注意事項

- `.claude/commands/` はバージョンアップ時に上書きされます。直接編集しないでください
- `.claude/teams/<team_id>/` はプロジェクト固有のカスタマイズ領域です。バージョンアップでは上書きされません
- `.claude/incidents/` はプロジェクトの履歴です。Git で管理することを推奨します

---

## 関連ドキュメント

- [バージョン移行ガイド](guide/migration.html) — バージョンアップ時の詳細な移行手順
- [トラブルシューティング](guide/troubleshooting.html) — インストール時のエラー対処法
- [セットアップガイド](guide/setup.html) — `/ai-team-setup` の詳細
