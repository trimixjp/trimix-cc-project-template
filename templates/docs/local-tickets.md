# ローカルチケット管理ガイド

GitHub Issues を使わず、**プロジェクト内の Markdown** で進捗管理する方式です。

---

## なぜローカルか

| 課題 | ローカル md の利点 |
|------|-------------------|
| 非公開リポジトリの GitHub 課金 | 不要 |
| 非エンジニアの GitHub ハードル | Obsidian 等で md をそのまま閲覧 |
| オフライン作業 | ファイルがあれば完結 |

---

## md と Obsidian の関係

| 方式 | 役割 |
|------|------|
| **Markdown ファイル（SSOT）** | エージェント・CLI・git が読む正本 |
| **Obsidian** | 人間向けの無料ビューア（推奨 UI）。API 依存なし |

**一般・非エンジニア向け推奨:** `tickets/` を Obsidian vault として開く。  
**エンジニア向け:** 従来どおり GitHub Issues も選択可（`ticket_backend: github`）。

---

## セットアップ

`/ai-team-setup` でチケット管理方式に **ローカル（md + Obsidian 推奨）** を選ぶと:

1. `tickets/` 雛形が配置される
2. `.claude/ai-team-config.yml` に `ticket_backend: local` が記録される
3. GitHub ラベル作成はスキップ可能

手動で切り替える場合:

```yaml
# .claude/ai-team-config.yml
ticket_backend: local
local_tickets:
  dir: tickets
  id_prefix: ""
```

雛形のコピー:

```bash
mkdir -p tickets/open tickets/closed tickets/_templates
cp node_modules/@trimix/ai-team/templates/tickets/README.md tickets/
cp node_modules/@trimix/ai-team/templates/tickets/_templates/ticket.md tickets/_templates/
```

---

## スキル（推奨）

Claude Code / Grok からは次のスキルで操作します。

```
/ai-team-ticket create --title "..." --body "..." --label backend:tech-lead
/ai-team-ticket list
/ai-team-ticket view 1
/ai-team-ticket comment 1 --body "..."
/ai-team-ticket edit 1 --add-label L --remove-label L
/ai-team-ticket close 1
/ai-team-ticket backend
```

## CLI（シェルから直接）

```bash
npx @trimix/ai-team ticket backend
npx @trimix/ai-team ticket list [--state open|closed|all] [--label backend:tech-lead]
npx @trimix/ai-team ticket view <id>
npx @trimix/ai-team ticket create --title "..." [--body "..."]
npx @trimix/ai-team ticket comment <id> --body "..."
npx @trimix/ai-team ticket edit <id> --add-label L --remove-label L
npx @trimix/ai-team ticket close <id>
```

出力は JSON です。スキルは内部でこの CLI を実行します（`ticket_backend: github` のときは CLI が `gh` を呼び出します）。
---

## ワークフロー起動

```
/ai-team-run 1
```

ローカル時は チケット番号 = `tickets/open/` 内 frontmatter の `id` です。

---

## 細かい注意

- **ラベル**は frontmatter の `labels` 配列が状態源です。Obsidian で手編集する場合は YAML を壊さないこと
- **コメント**はファイル末尾 `## Comments` に追記されます
- **クローズ**すると `open/` から `closed/` へ移動します
- マルチユーザーは **git 共有**前提（同時編集のコンフリクトに注意）
