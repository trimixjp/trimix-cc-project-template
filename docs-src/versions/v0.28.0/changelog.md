# v0.28.0 の変更点

## 概要

v0.28.0 ではモデル割り当てアーキテクチャを改善し、**検証役ロール `verifier` を新設**しました。検証（レビュー・QA・セキュリティ確認など）は設計と同格の判断力を要するため、これまで実装役と同じモデルで動いていた検証役エージェントを独立させ、より高性能なモデルを割り当てることができるようになります。

## 主な変更

### モデルロール拡張（Issue #111）

**新しいロール体系: leader（設計）/ verifier（検証）/ worker（実装）/ simple（定型）**

v0.27.0 までは3つのロール（`leader` / `worker` / `simple`）で運用していました。v0.28.0 では **4つ目のロール `verifier`（検証役）** を追加し、以下の検証タスク専任エージェント 13 名（16ファイル）を割り当てました：

- **backend / frontend**: `reviewer`、`reviewer-a`、`reviewer-b`
- **infra**: `security-engineer`
- **content**: `compliance`
- **youtube**: `render-reviewer`、`script-qa`、`growth-qa`、`affiliate-qa`、`publish-qa`、`sns-qa`、`monetizer-qa`、`channel-producer-qa`

### モデル対応表の変更

#### Claude Code（バランスプロファイルの例）
| ロール | v0.27.0 | v0.28.0 |
|--------|---------|---------|
| leader（設計） | opus | opus |
| **verifier（検証・新設）** | — | **opus** |
| worker（実装） | sonnet | sonnet |
| simple（定型） | haiku | haiku |

#### 全性能プロファイル（Claude Code）
| 性能プロファイル | leader | verifier | worker | simple |
|---|---|---|---|---|
| high-performance | fable | **opus** | opus | sonnet |
| balance（推奨） | opus | **opus** | sonnet | haiku |
| low-cost | sonnet | **sonnet** | sonnet | haiku |

Grok Build では verifier が leader と同値になります。

### 導入時の影響

この変更は **breaking change ではありません** が、既存インストールでアップグレードする際に以下の変更が行われます：

**未編集のファイル**: 検証役 13 名（16ファイル）の `model_role` が `worker` から `verifier` に、バランスプロファイルではモデルが `sonnet` から `opus` に変わります。

**手編集済みのファイル**: `.new` ファイルが書き出されます。自分の編集を保持しながらアップグレードする場合は、`.new` を見て frontmatter の `model` と `model_role` の2行だけを選別して取り込んでください。

**バランスプロファイルでのコスト増**: opus 呼び出しが増えるため、トークン消費量が増加します。

## インシデント修正・改善

なし。本バージョンの変更は新機能追加です。

## 関連チケット・参照資料

- Issue #111: 検証役ロール（verifier）の新設
- Issue #73: モデル・effort プロファイル導入
- Issue #89: リーダーへの規律適用

## アップグレード手順

```bash
ai-team upgrade
```

詳細は [アップグレードガイド](guide/migration.html) を参照してください。
