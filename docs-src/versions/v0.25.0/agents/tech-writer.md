# Tech-Writer エージェント

Tech-Writer はバックエンドチームの「ドキュメント専門 AI」です。コードの変更差分を解析して `docs-src/` 配下の Markdown を更新し、`node docs-src/build.js` を実行してコンパイル済みの HTML/CSS/JS を `ai-team-manual/docs/` に出力します。**PR 作成前に必ず実行されます**。

> **定義場所**: `.claude/teams/backend/agents/tech-writer.md`
> **対応 DOD**: `.claude/teams/backend/dod/documentation.md`

---

## 起動条件

1. `backend:tech-writer` ラベルが付与された チケットが作成・更新された
2. Reviewer（またはクロスレビュー）の合格後、ワークフローが Tech-Writer ステップに進んだ

---

## 動作フロー

### ステップ 1: 変更差分の解析

対象コミット範囲（`RANGE`）は、**Version-Bumper と同一の多段フォールバック**で決定します。git タグを運用していないリポジトリで履歴全体を誤ってドキュメント反映対象にしないための安全化措置です（インシデント #54 の再発防止策の水平展開）。

| 優先順位 | 判定方式 | 境界の決め方 |
|---------|---------|-------------|
| 1 | git タグ境界 | `git describe --tags` で直近のバージョンタグが取得できれば、そのタグから HEAD までを対象にする |
| 2 | 版バンプコミット境界 | タグが無い場合、`chore: vX.Y.Z にバージョンアップ` という規約コミットを境界にする。Tech-Writer は version-bumper の直後に起動するため HEAD 自身がバンプコミットであることが多く、その場合は HEAD を除外して「前バージョンの版バンプコミット」を境界にする |
| 3 | package.json 変更境界 | 上記が見つからない場合、`package.json` を最後に変更したコミットを境界候補にする（HEAD 自身なら HEAD を除外して探し直す） |
| 4 | HEAD 全件 | 1〜3 のいずれも検出できない真の初回のみ、履歴全体を対象にする |

採用した範囲判定方式（`tag` / `bump-commit` / `package.json` / `HEAD`）は完了報告に必ず記録します。

```bash
# 現在のバージョンを確認
cat package.json | grep '"version"'

# 多段フォールバックで決定した RANGE を使って対象範囲を取得
git log --oneline $RANGE

# 変更されたファイルの一覧
git diff --name-only $RANGE

# 変更内容の詳細
git diff $RANGE -- '*.md' '*.yml' '*.json' '*.js' '*.ts'
```

チケットコメント履歴から以下を把握します：

- Tech-Lead の設計方針（追加・変更された機能の概要）
- Implementer の完了報告（変更ファイル一覧・実装内容）
- Reviewer の合格コメント（変更点の評価）

### ステップ 2: バージョン確認とディレクトリ準備

```bash
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Current version: v$VERSION"

ls docs-src/versions/
```

新しいバージョンのディレクトリが存在しない場合、直前バージョンからコピーして作成します（`v` 接頭辞の有無が混在しても `sort -V` が正しく比較できるよう、比較前に正規化します）。

```bash
PREV_NUM=$(ls docs-src/versions/ | sed 's/^v//' | sort -V | tail -1)
if [ -d "docs-src/versions/v$PREV_NUM" ]; then
  PREV_DIR="v$PREV_NUM"
else
  PREV_DIR="$PREV_NUM"
fi
if [ ! -d "docs-src/versions/v$VERSION" ]; then
  cp -r "docs-src/versions/$PREV_DIR" "docs-src/versions/v$VERSION"
  echo "Created docs-src/versions/v$VERSION from $PREV_DIR"
fi
```

あわせて `docs-src/config.json` の `versions`（末尾に追加）・`latest`（新バージョンへ更新）・`nav`（直前バージョンの定義をコピー）を `jq` で更新し、`jq -e` で機械的に検証します。config.json を更新しないとビルドに新バージョンが含まれません。

### ステップ 3: ドキュメントの更新

変更差分を解析し、以下の判断基準でドキュメントを更新します。

| 変更の種類 | 更新対象ドキュメント |
|----------|---------------------|
| 新機能の追加 | 該当機能の説明ページを新規作成または更新 |
| API の変更 | `api/`（または該当する）配下のページを更新 |
| 設定ファイルの変更 | 設定リファレンスを更新 |
| ワークフロー・エージェントの変更 | ワークフロー / エージェントのページを更新 |
| セットアップ手順の変更 | `getting-started.md` または `installation.md` を更新 |
| バグ修正 | 影響するドキュメントに注記（破壊的変更の場合） |

「変更の種類」の判定は、対象範囲のコミットログ 1 行目（`feat:` / `fix:` 等のプレフィックス）と変更ファイル一覧のパスに機械的に照合して行います。新しいバージョンを作成する場合は、前バージョンからの変更点を `changelog.md` に手書きし、`config.json` の nav（「変更履歴」セクション）に追加します。

`docs-src/config.json` のナビゲーション構成も必要に応じて更新します（新しいページを追加した場合）。

#### ドキュメント執筆の原則

- 読者はシステムの利用者（開発者・運用者）であることを前提
- 「なぜそうなのか」の背景情報を含める
- コード例・コマンド例を具体的に示す
- 箇条書きより文章を優先し、論理的な説明の流れを作る
- 専門用語は初出時に説明する

### ステップ 4: ビルド実行

```bash
node docs-src/build.js

# ビルド結果を確認
ls ai-team-manual/docs/
ls ai-team-manual/docs/v$VERSION/
```

ビルドが失敗した場合は、コミット前の状態のままエラー原因（Markdown 構文エラー・config.json の nav 参照切れ等）を特定して `docs-src/` 側を修正し、再実行します。**再実行は 2 回まで**とし、それでも成功しない場合はエラーメッセージ全文・終了コード・試行した修正内容を チケットコメントに記録して human-escalator にエスカレーションします。

### ステップ 5: ドキュメント変更のコミット

```bash
git add docs-src/ ai-team-manual/
git commit -m "docs: v$VERSION ドキュメントを更新"
```

### ステップ 6: 完了報告

---

## コメントフォーマット（完了報告）

```
📝 Tech-Writer: ドキュメントの更新が完了しました

## 対象バージョン
v<バージョン番号>

## 対象コミット範囲
- RANGE: <RANGE>（例: `<commit>..HEAD`）
- 範囲判定方式: <tag / bump-commit / package.json / HEAD>

## 更新したドキュメント
| ファイルパス | 変更内容 |
|-------------|---------|
| `docs-src/versions/vX.X.X/xxx.md` | （追加・更新・削除した内容） |

## 変更差分との対応
（コード変更のどの部分を、どのドキュメントに反映したかを記述）

## 新しく追加したページ
- （なければ「なし」）

## ビルド結果
- コンパイル: 成功
- 出力先: `ai-team-manual/docs/v<バージョン番号>/`
- バージョン一覧: `ai-team-manual/docs/versions.json` を更新

⏭️ 次のアクション: PR-Creator に引き継ぎます
```

---

## ドキュメント管理システムの構造

### ソース（編集対象）

```
docs-src/
├── config.json              # ナビゲーション・バージョン情報
├── build.js                 # 静的サイトジェネレータ（依存ライブラリなし）
└── versions/
    ├── v0.4.0/              # 過去バージョン（変更しない）
    │   └── *.md
    ├── v0.5.0/
    │   └── *.md
    └── v0.5.1/              # 最新バージョン
        ├── index.md
        ├── getting-started.md
        ├── skills/
        ├── teams/
        ├── agents/
        └── reference/
```

### ビルド出力（公開対象）

```
ai-team-manual/docs/
├── index.html               # 最新バージョンへのリダイレクト
├── versions.json            # バージョン切り替え用メタデータ
├── v0.4.0/                  # 各バージョンの完全な HTML サイト
├── v0.5.0/
└── v0.5.1/
    ├── assets/
    │   ├── style.css        # 自動生成
    │   └── script.js        # 自動生成
    ├── index.html
    └── ... (各ページの HTML)
```

`ai-team-manual/docs/` は手動編集せず、必ず `node docs-src/build.js` で再生成します。

---

## バージョン管理の方法

### 新バージョン作成のタイミング

`package.json` の `version` が更新されたとき、Tech-Writer は次の操作を行います。

1. 新しいバージョン番号に対応するディレクトリが `docs-src/versions/` に存在するかチェック
2. 存在しない場合、直前バージョンのディレクトリをコピーして作成
3. `docs-src/config.json` の `versions` 配列に新バージョンを追加
4. `docs-src/config.json` の `latest` を新バージョンに更新

### config.json の更新例

v0.5.1 → v0.5.2 リリース時：

```json
{
  "title": "@trimix/ai-team ドキュメント",
  "versions": ["v0.5.0", "v0.5.1", "v0.5.2"],
  "latest": "v0.5.2",
  "nav": {
    "v0.5.1": [...],
    "v0.5.2": [...]
  }
}
```

### ナビゲーションの更新

新しいページを追加した場合、対応するバージョンの `nav` 配列にエントリを追加します。

```json
{
  "nav": {
    "v0.5.1": [
      {
        "title": "スキル",
        "items": [
          { "title": "新スキル", "file": "skills/new-skill" }
        ]
      }
    ]
  }
}
```

---

## 失敗時挙動

既定原則は「安全側に倒す」です（対象範囲を広げすぎない・判断できなければ停止して記録する）。

- **ビルドが失敗した場合**: コミット前で停止し、再実行は 2 回まで。超過時はエラー全文を記録してエスカレーション
- **`docs-src/` または `docs-src/config.json` が存在しない場合**: ドキュメント基盤が未整備のため作業を中断し、欠落パスを記録してエスカレーション（勝手にディレクトリ構成を新設しない）
- **対象コミット範囲の決定コマンドが失敗した場合**: `HEAD`（全履歴）に安易にフォールバックせず、失敗したコマンドと出力を記録してエスカレーション
- **決定した RANGE の対象コミットが 0 件の場合**: 境界検出失敗とみなし、計測値（RANGE・判定方式・件数）を記録してエスカレーション（「変更なし」と判定して先に進まない）
- **`docs-src/versions/` が空の場合**: コピー元（直前バージョン）を特定できないため、勝手に雛形を新設せず状況を記録してエスカレーション

---

## エスカレーション条件

以下の場合は `human-escalator` を呼び出します。

- `docs-src/build.js` の実行が失敗し、原因の特定・修正が困難な場合
- ドキュメントの内容について技術的・法的な判断が必要な場合（`ambiguous_spec` / `legal`）
- 変更差分が大規模すぎてドキュメントの全面改訂が必要と判断した場合（`budget` 相当）
- `.claude/escalation-rules.yml` の `escalation_triggers` に該当する事象

---

## 重要な原則

1. **ドキュメントの更新とコードの変更は必ず同じ PR に含める**
2. **コードが先に変更され、ドキュメントが後から追いつく状態を作らない**
3. **`docs-src/` が真のソース**。`ai-team-manual/docs/` は常にビルドで生成されるもの（手動編集禁止）
4. **バージョンごとのドキュメントは独立して完結している必要がある**（他バージョンへの参照禁止）
5. **不確かな情報を記載してはいけない**。不明な点は「未確認」と明記してエスカレーション

---

## DOD チェックリスト

Tech-Writer の作業完了は `.claude/teams/backend/dod/documentation.md` で次のように定義されています。

### 変更差分の反映
- [ ] git diff で確認した全ての変更箇所がドキュメントに反映されている
- [ ] 新しい機能・API・設定項目が説明されている
- [ ] 削除または変更された機能の記述が更新されている
- [ ] コード例が最新の API に合わせて更新されている

### バージョン管理
- [ ] `docs-src/versions/v{バージョン}/` ディレクトリが存在する
- [ ] `docs-src/config.json` の `versions` リストに当該バージョンが含まれている
- [ ] `docs-src/config.json` の `latest` が最新バージョンを指している
- [ ] 新しいページを追加した場合、ナビゲーション定義に追加されている

### ビルドと出力
- [ ] `node docs-src/build.js` がエラーなく完了している
- [ ] `ai-team-manual/docs/v{バージョン}/` に HTML ファイルが生成されている
- [ ] `ai-team-manual/docs/versions.json` が更新されている
- [ ] ブラウザで開いてレイアウト・バージョン切り替え・ナビゲーションが正常動作

### 品質基準
- [ ] 誤字・脱字がない
- [ ] コード例が実際に動作する
- [ ] 専門用語は初出時に説明されている
- [ ] 見出し・段落の構造が論理的である

### コミット
- [ ] `docs-src/` と `ai-team-manual/`（ルート `index.html` を含む）の変更が同一コミットに含まれている
- [ ] コミットメッセージが `docs: v{バージョン} ドキュメントを更新` の形式

---

## 関連ドキュメント

- [バックエンドチーム](../teams/backend.html) — Tech-Writer が組み込まれているワークフロー
- [バックエンドチーム](../teams/backend.md) — 他のエージェントの定義
- [DOD テンプレート](../reference/dod.html) — `documentation.md` を含む DOD 一覧
