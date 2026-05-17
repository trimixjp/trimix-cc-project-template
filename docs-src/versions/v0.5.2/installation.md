# インストール

`@trimix/ai-team` は npm パッケージとして配布されます。`.tgz` ファイルを `npm install` することで、自動的に Claude Code スキルがプロジェクトに展開されます。

---

## インストール方法

### 標準的な手順

配布された `.tgz` ファイルをプロジェクトルートに配置して、開発依存としてインストールします。

```bash
cd /path/to/your-project
npm install --save-dev ./trimix-ai-team-0.5.1.tgz
```

インストール後、`package.json` の `devDependencies` に次のエントリが追加されます。

```json
{
  "devDependencies": {
    "@trimix/ai-team": "file:./trimix-ai-team-0.5.1.tgz"
  }
}
```

### バージョンアップ時

新しい `.tgz` ファイルを受け取ったら、同じく `npm install` を実行します。古い `.tgz` は削除して構いません。

```bash
npm install --save-dev ./trimix-ai-team-0.5.2.tgz
```

`postinstall` スクリプトが再実行され、`.claude/commands/` のスキルファイルが最新版に更新されます。既にプロジェクトで `/ai-team-setup` 済みの場合、`.claude/teams/` 配下のカスタマイズ済みファイルは上書きされません。

---

## postinstall の挙動

`bin/postinstall.js` は `npm install` のたびに自動実行されます。挙動は次のとおりです。

### 動作内容

1. `INIT_CWD`（`npm install` を実行したディレクトリ）を取得
2. パッケージ開発リポジトリ自身であれば（`projectRoot === packageRoot`）即終了
3. それ以外なら `.claude/commands/` ディレクトリを作成（存在しなければ）
4. パッケージ内の `skills/` から以下 7 ファイルをコピー

```
ai-team-setup.md
ai-team-run.md
ai-team-watch.md
ai-team-resume.md
ai-team-gallery.md
ai-team-install.md
ai-team-configure.md
```

5. 成功時のメッセージを表示

```
✅ @trimix/ai-team: 7 件のSkillファイルを .claude/commands/ に展開しました
   Claude Code で /ai-team-setup を実行してセットアップを完了してください
```

### 失敗時の挙動

postinstall は失敗してもエラーで終了せず、警告のみ表示します（npm install 全体が止まらないように設計されています）。

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

`bin/setup.js` で提供される CLI コマンドは次のとおりです。

| コマンド | 用途 |
|---------|------|
| `npx @trimix/ai-team install` | スキルファイルを `.claude/commands/` に展開（postinstall と同等） |
| `npx @trimix/ai-team install <team_id>` | ワークフロープラグインをインストール |
| `npx @trimix/ai-team gallery` | 利用可能なプラグイン一覧を表示 |
| `npx @trimix/ai-team list` | インストール済みプラグインを表示 |
| `npx @trimix/ai-team uninstall <team_id>` | プラグインをアンインストール |
| `npx @trimix/ai-team --version` | バージョンを表示 |
| `npx @trimix/ai-team --help` | ヘルプを表示 |

利用可能なチーム ID は `backend` / `frontend` / `content` / `infra` の 4 つです。

---

## セットアップ後のディレクトリ構成

`/ai-team-setup` を実行すると、選択したチームに応じて以下のディレクトリが配置されます。バックエンドとインフラの 2 チームを導入した例を示します。

```
.claude/
├── CLAUDE.md                       # AIチーム設定（CLAUDE.md 末尾に追記される）
├── ai-team-config.yml              # 運用モード（multi-user / solo）と solo 設定
├── escalation-rules.yml            # エスカレーション条件の定義
├── agents/
│   ├── contributor.md              # 全体管理エージェント
│   ├── dispatcher.md               # Epic 分解エージェント
│   └── human-escalator.md          # 人間エスカレーションエージェント
├── teams/
│   ├── backend/
│   │   ├── workflow.yml            # バックエンドのワークフロー定義
│   │   ├── review-config.yml       # ダブルレビュー判定基準
│   │   ├── agents/                 # tech-lead / implementer / reviewer / pr-creator など
│   │   └── dod/                    # feature / bugfix / refactor / review テンプレート
│   └── infra/
│       ├── workflow.yml
│       ├── agents/                 # infra-lead / network-engineer / infra-specialist など
│       └── dod/                    # infrastructure-change / network-change / security-review
├── dod/
│   ├── README.md                   # DODテンプレートの選択ガイド
│   └── incident.md                 # 共通のインシデント対応DOD
├── incidents/
│   ├── README.md                   # インシデント運用ガイド
│   ├── TEMPLATE.md                 # インシデントレポートの雛形
│   └── index.yml                   # インシデント一覧（初期状態は空）
├── docs/
│   └── workflow-guide.md           # ワークフロー運用ガイド
└── commands/
    ├── ai-team-setup.md            # postinstall で展開（変更しないこと）
    ├── ai-team-run.md
    ├── ai-team-watch.md
    ├── ai-team-resume.md
    ├── ai-team-gallery.md
    ├── ai-team-install.md
    └── ai-team-configure.md
```

`.github/ISSUE_TEMPLATE/` には、選択したチームに応じた Issue テンプレート（`backend-feature.yml` / `infra-change.yml` など）が配置されます。

---

## アンインストール

パッケージを削除するには次のコマンドを実行します。

```bash
npm uninstall @trimix/ai-team
```

`.claude/commands/` 内のスキルファイルは `npm uninstall` では削除されません。完全に削除する場合は手動で `.claude/` ディレクトリを整理してください。

---

## 注意事項

- `.claude/commands/` 配下のファイルはバージョンアップ時に上書きされるため、直接編集しないでください。スキルをカスタマイズしたい場合はパッケージ側で修正してください。
- `.claude/teams/<team_id>/` 配下はプロジェクト固有のカスタマイズを行う場所です。バージョンアップでは上書きされません。
- `.claude/incidents/` はプロジェクトの履歴であるため、Git で管理することを推奨します。
- `.claude/ai-team-config.yml` は運用モードを切り替える際に編集します。詳細は [設定ファイル](reference/config.html) を参照してください。
