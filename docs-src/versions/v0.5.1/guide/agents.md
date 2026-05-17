# エージェントのカスタマイズ

各エージェントは `.claude/teams/{チーム名}/agents/*.md` ファイルで定義されています。

## エージェント定義ファイルの構造

```markdown
---
name: エージェント名
description: エージェントの説明
---

# エージェント名

## 役割
...

## 起動条件
...

## 動作フロー
...
```

## バックエンドチームのエージェント一覧

| エージェント | 役割 |
|------------|------|
| tech-lead | 要件分析・設計方針決定・レビュー方式判断 |
| implementer | コード実装・テスト実施 |
| reviewer | シングルレビュー |
| reviewer-a | ダブルレビュー（並列A） |
| reviewer-b | ダブルレビュー（並列B） |
| tech-writer | ドキュメント更新・HTML生成 |
| pr-creator | プルリクエスト作成 |

## Tech-Writer の設定

Tech-Writer は `docs-src/config.json` を参照してドキュメントを構成します。新しいページを追加する場合は、`config.json` の `nav` セクションに追加してください。

```json
{
  "nav": {
    "v1.0.0": [
      {
        "title": "ガイド",
        "items": [
          { "title": "新しいページ", "file": "guide/new-page" }
        ]
      }
    ]
  }
}
```
