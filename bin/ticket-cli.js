#!/usr/bin/env node
/**
 * チケット CLI（GitHub / ローカル Markdown 共通）
 *
 * 使い方:
 *   node bin/ticket-cli.js list [--state open|closed|all] [--label NAME]
 *   node bin/ticket-cli.js view <id>
 *   node bin/ticket-cli.js create --title "..." [--body "..."] [--label L]
 *   node bin/ticket-cli.js comment <id> --body "..."
 *   node bin/ticket-cli.js edit <id> [--add-label L] [--remove-label L]
 *   node bin/ticket-cli.js close <id>
 *   node bin/ticket-cli.js backend
 *
 * 出力はすべて JSON（stdout）。エラーは stderr + exit 1。
 */

import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createTicketStore, loadTicketConfig } from './lib/ticket-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--title') out.title = argv[++i];
    else if (a === '--body') out.body = argv[++i];
    else if (a === '--state') out.state = argv[++i];
    else if (a === '--label') {
      out.labels = out.labels || [];
      out.labels.push(argv[++i]);
    } else if (a === '--add-label') {
      out.addLabels = out.addLabels || [];
      out.addLabels.push(argv[++i]);
    } else if (a === '--remove-label') {
      out.removeLabels = out.removeLabels || [];
      out.removeLabels.push(argv[++i]);
    } else if (a === '--author') out.author = argv[++i];
    else if (a === '--cwd') out.cwd = argv[++i];
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--')) throw new Error(`不明なオプション: ${a}`);
    else out._.push(a);
  }
  return out;
}

function printHelp() {
  console.log(`ai-team ticket — チケット操作 CLI

コマンド:
  list [--state open|closed|all] [--label NAME]
  view <id>
  create --title "..." [--body "..."] [--label L]...
  comment <id> --body "..."
  edit <id> [--add-label L]... [--remove-label L]...
  close <id>
  backend

設定: .claude/ai-team-config.yml の ticket_backend (github|local)
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || opts._.length === 0) {
    printHelp();
    process.exit(opts.help ? 0 : 1);
  }

  const cwd = resolve(opts.cwd || process.cwd());
  const config = loadTicketConfig(cwd);
  const store = createTicketStore({ cwd, config });
  const cmd = opts._[0];

  let result;
  switch (cmd) {
    case 'backend':
      result = { ticket_backend: config.ticket_backend, local_tickets: config.local_tickets };
      break;
    case 'list':
      result = await store.list({
        state: opts.state || 'open',
        label: opts.labels?.[0],
      });
      break;
    case 'view': {
      const id = opts._[1];
      if (!id) throw new Error('view には id が必要です');
      result = await store.view(id);
      break;
    }
    case 'create': {
      if (!opts.title) throw new Error('create には --title が必要です');
      result = await store.create({
        title: opts.title,
        body: opts.body || '',
        labels: opts.labels || [],
      });
      break;
    }
    case 'comment': {
      const id = opts._[1];
      if (!id) throw new Error('comment には id が必要です');
      if (!opts.body) throw new Error('comment には --body が必要です');
      result = await store.comment(id, { body: opts.body, author: opts.author });
      break;
    }
    case 'edit': {
      const id = opts._[1];
      if (!id) throw new Error('edit には id が必要です');
      result = await store.editLabels(id, {
        add: opts.addLabels || [],
        remove: opts.removeLabels || [],
      });
      break;
    }
    case 'close': {
      const id = opts._[1];
      if (!id) throw new Error('close には id が必要です');
      result = await store.close(id);
      break;
    }
    default:
      throw new Error(`不明なコマンド: ${cmd}`);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

// CLI entry
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
}

export { main as runTicketCli };
