# トラブルシューティング

セットアップや日常的な運用で発生しがちな問題とその解決方法をまとめています。

---

## セットアップ時のトラブル

### npm install が失敗する

**症状**

次のようなエラーが表示される場合があります。

```
EACCES: permission denied
npm ERR! code EACCES
```

**原因と解決手順**

| 原因 | 解決手順 |
|------|---------|
| `~/.npm` ディレクトリの権限が不足している | `sudo chown -R $(whoami) ~/.npm` を実行して権限を修正する |
| グローバルインストールが必要なパッケージに依存している | `npm install` の代わりに `npm install --save-dev` を使用する |
| Node.js バージョンが `18.0.0` 未満 | `node --version` で確認し、必要に応じて更新する（[前提条件](../getting-started.html) 参照） |

---

### スキルファイルが展開されない

**症状**

`npm install` を実行したが `.claude/commands/` に `ai-team-*.md` ファイルが存在しない。

**原因**

`bin/postinstall.js` の実行に失敗している可能性があります。

**解決手順**

1. `.claude/commands/` ディレクトリが存在するか確認します。

   ```bash
   ls -la .claude/commands/
   ```

2. 存在しない場合は以下でディレクトリを作成して手動展開します。

   ```bash
   mkdir -p .claude/commands
   node node_modules/@trimix/ai-team/bin/postinstall.js
   ```

3. 完了後、`ai-team-setup.md` などのファイルが展開されているか確認します。

---

### GitHub CLI 認証エラー

**症状**

`/ai-team-setup` でラベル作成ステップが失敗する。`gh auth status` が以下のようなエラーを返す。

```
You are not logged into any GitHub hosts. Run gh auth login to authenticate.
```

**解決手順**

1. GitHub CLI でログインします。

   ```bash
   gh auth login
   ```

2. ブラウザが開いてデバイス認証画面が表示されます。指示に従って認証を完了してください。

3. 認証完了後、以下で確認します。

   ```bash
   gh auth status
   ```

4. GitHub リポジトリへのアクセス権を持つアカウントで認証されていることを確認してください。

---

## ワークフロー実行時のトラブル

### `/ai-team run` が Issue を見つけられない

**症状**

`/ai-team run 42` を実行しても Issue が見つからない、または「権限がない」エラーが返る。

**原因と解決手順**

| 原因 | 解決手順 |
|------|---------|
| GitHub CLI が正しいリポジトリを向いていない | `gh repo view` でリポジトリを確認する |
| Issue 番号が存在しない | `gh issue list` で番号を確認する |
| Issues 機能が無効になっている | GitHub リポジトリの Settings > Features > Issues を有効化する |
| GitHub CLI が未認証 | `gh auth login` で認証する |

---

### エージェントが途中で停止する・進まない

**症状**

`/ai-team run` を実行したが、途中でエージェントが応答しなくなる。Issue にコメントが投稿されない。

**確認手順**

1. Issue のラベルを確認します。

   ```bash
   gh issue view <番号> --json labels
   ```

2. `escalated:human` ラベルが付いている場合は、人間の判断が必要な状態です。Issue のコメントを読み、対応してください。対応後は `/ai-team resume` で再開できます（[エスカレーション再開](../skills/resume.html) 参照）。

3. `ai-team:in-progress` ラベルが付いている場合は、別のセッションで処理中の可能性があります。意図しない場合はラベルを手動で除去してください。

   ```bash
   gh issue edit <番号> --remove-label "ai-team:in-progress"
   ```

---

### `/ai-team resume` が動かない（エスカレーション解除後）

**症状**

`escalated:human` ラベルを手動で外して `/ai-team resume` を実行したが、「再開対象 Issue が見つかりません」と表示される。

**原因**

`escalated:human` ラベルの除去が GitHub に反映される前に実行した可能性があります。

**解決手順**

1. ラベルが正しく除去されているか確認します。

   ```bash
   gh issue view <番号> --json labels
   ```

2. ラベルが残っている場合は再度除去してください。

   ```bash
   gh issue edit <番号> --remove-label "escalated:human"
   ```

3. `/ai-team resume` を再実行します。

4. それでも再開できない場合は、Issue 番号を直接指定して `/ai-team run <番号>` を実行してください。エージェントが Issue コメント履歴を読み、前回のどのステップまで完了したかを判断して続きから再開します。

---

## ソロモードのトラブル

### `/ai-team watch` が新しい Issue を検出しない

**症状**

ソロモードで `/ai-team watch` を実行しているが、新規 Issue が作成されても自動処理が始まらない。

**確認手順**

1. `.claude/ai-team-config.yml` を確認し、`mode: solo` になっているかチェックします。

   ```bash
   cat .claude/ai-team-config.yml
   ```

2. `solo.target_labels` に、Issue に付与しているラベルが含まれているか確認します。

   ```yaml
   solo:
     target_labels:
       - content:editor-in-chief   # ← この設定が必要
   ```

3. Issue に `ai-team:in-progress` や `escalated:human` など `skip_labels` に定義されたラベルが付いていないか確認します。これらがあるとスキップされます。

4. `poll_interval_minutes` の待機時間が経過したか確認します。デフォルトは 5 分です。

---

### ポーリング間隔を変更したい

`.claude/ai-team-config.yml` の `solo.poll_interval_minutes` を編集してください。

```yaml
solo:
  poll_interval_minutes: 2  # 2分ごとに確認（デフォルト: 5）
```

変更後は `/ai-team watch` を再起動してください（Ctrl+C で停止後、再実行）。

---

## 関連ドキュメント

- [クイックスタート](../getting-started.html) — セットアップ手順の確認
- [インストール](../installation.html) — インストール詳細
- [ai-team-resume](../skills/resume.html) — エスカレーション後の再開方法
- [ai-team-watch](../skills/watch.html) — ソロモードの設定
- [設定ファイル](../reference/config.html) — `ai-team-config.yml` の全フィールド
