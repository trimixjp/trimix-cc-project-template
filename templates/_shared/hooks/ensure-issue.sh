#!/bin/bash
# .claude/hooks/ensure-issue.sh
# UserPromptSubmit hook
# ファイル変更を伴う可能性のある指示に Issue 番号がない場合、作業前に Issue 経由を促す。

set -euo pipefail

# stdin から JSON を読み込んでプロンプトを取得
INPUT=$(cat)
PROMPT=$(echo "$INPUT" | jq -r '.prompt // ""' 2>/dev/null || echo "$INPUT")

# ① Issue番号・GitHub URL・ai-team スキルが含まれていればスルー
if echo "$PROMPT" | grep -qE '(#[0-9]+|github\.com/.*/issues/[0-9]+|/ai-team[[:space:]])'; then
  exit 0
fi

# ② 調査・質問系のキーワードで始まる場合はスルー
if echo "$PROMPT" | grep -iqE '^(explain|what|why|how|show|list|check|look|find|search|read|view|describe|教えて|説明|確認|調査|一覧|どう|なぜ|何|見せ|どれ|どこ|いつ|誰)'; then
  exit 0
fi

# ③ 変更系キーワードを含む場合はブロック
if echo "$PROMPT" | grep -iqE '(fix|implement|add|update|change|modify|create|delete|remove|refactor|migrate|edit|write|install|直|修正|実装|追加|変更|作成|削除|リファクタ|移行|書き|インストール|セットアップ|setup)'; then
  cat >&2 <<'EOF'
⚠️  Issue 経由が必要です

ファイル変更を伴う作業は GitHub Issue を起点にしてください：

  1. 関連 Issue を探す:  gh issue list --state open
  2. Issue を作成する:   gh issue create --title "..." --body "..."
  3. ワークフロー起動:   /ai-team run <Issue番号>

Issue 番号を指定するか、/ai-team run で指示を再入力してください。
EOF
  exit 2
fi

exit 0
