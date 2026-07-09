/**
 * チケットストア抽象（GitHub Issues / ローカル Markdown）
 *
 * エージェント・スキルは本モジュール経由の CLI でチケット操作する。
 * 追加 npm 依存なし。local は frontmatter + ## Comments の最小パーサ。
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  unlinkSync,
} from 'fs';
import { join, dirname, basename } from 'path';
import { execFileSync } from 'child_process';

/**
 * @typedef {{ name: string }} Label
 * @typedef {{ author?: string, createdAt: string, body: string }} Comment
 * @typedef {{
 *   number: number,
 *   title: string,
 *   body: string,
 *   state: 'open' | 'closed',
 *   labels: Label[],
 *   assignees: string[],
 *   comments: Comment[],
 *   url: string,
 *   path?: string,
 * }} Ticket
 */

/**
 * ai-team-config.yml から ticket 関連設定を読む（最小 YAML）
 * @param {string} cwd
 */
export function loadTicketConfig(cwd) {
  const configPath = join(cwd, '.claude', 'ai-team-config.yml');
  const defaults = {
    ticket_backend: 'github',
    local_tickets: { dir: 'tickets', id_prefix: '' },
  };
  if (!existsSync(configPath)) return defaults;

  const text = readFileSync(configPath, 'utf-8');
  const backend = matchScalar(text, 'ticket_backend') || defaults.ticket_backend;
  const dir = matchNestedScalar(text, 'local_tickets', 'dir') || defaults.local_tickets.dir;
  const idPrefix =
    matchNestedScalar(text, 'local_tickets', 'id_prefix') ?? defaults.local_tickets.id_prefix;

  return {
    ticket_backend: backend === 'local' ? 'local' : 'github',
    local_tickets: { dir, id_prefix: idPrefix || '' },
  };
}

function matchScalar(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
  if (!m) return null;
  return m[1].replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

function matchNestedScalar(text, section, key) {
  const sectionRe = new RegExp(`^${section}:\\s*$`, 'm');
  const sec = text.search(sectionRe);
  if (sec < 0) return null;
  const rest = text.slice(sec);
  const m = rest.match(new RegExp(`^[ \\t]+${key}:\\s*(.*)$`, 'm'));
  if (!m) return null;
  return m[1].replace(/#.*$/, '').trim().replace(/^["']|["']$/g, '');
}

/**
 * @param {{ cwd: string, config?: ReturnType<typeof loadTicketConfig> }} opts
 */
export function createTicketStore(opts) {
  const cwd = opts.cwd;
  const config = opts.config || loadTicketConfig(cwd);
  if (config.ticket_backend === 'local') {
    return createLocalStore(cwd, config.local_tickets);
  }
  return createGitHubStore(cwd);
}

// ---------------------------------------------------------------------------
// Local store
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 * @param {{ dir: string, id_prefix: string }} localCfg
 */
export function createLocalStore(cwd, localCfg) {
  const root = join(cwd, localCfg.dir || 'tickets');
  const openDir = join(root, 'open');
  const closedDir = join(root, 'closed');

  function ensureDirs() {
    mkdirSync(openDir, { recursive: true });
    mkdirSync(closedDir, { recursive: true });
    mkdirSync(join(root, '_templates'), { recursive: true });
  }

  function listMdFiles(dir) {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
      .map((f) => join(dir, f));
  }

  function allTicketFiles() {
    return [...listMdFiles(openDir), ...listMdFiles(closedDir)];
  }

  function parseTicketFile(filePath) {
    const raw = readFileSync(filePath, 'utf-8');
    const { frontmatter, body } = splitFrontmatter(raw);
    const id = Number(frontmatter.id);
    if (!Number.isFinite(id)) {
      throw new Error(`チケット id が不正です: ${filePath}`);
    }
    const labels = parseLabels(frontmatter.labels);
    const comments = parseComments(body);
    const bodyOnly = stripCommentsSection(body).trim();
    const finalState = filePath.startsWith(closedDir)
      ? 'closed'
      : frontmatter.state === 'closed'
        ? 'closed'
        : 'open';

    return {
      number: id,
      title: String(frontmatter.title || basename(filePath, '.md')),
      body: bodyOnly,
      state: finalState,
      labels: labels.map((name) => ({ name })),
      assignees: parseStringList(frontmatter.assignees),
      comments,
      url: `local://${localCfg.dir || 'tickets'}/${id}`,
      path: filePath,
      created_at: frontmatter.created_at || null,
      updated_at: frontmatter.updated_at || null,
      _slug: frontmatter.slug || slugify(String(frontmatter.title || id)),
    };
  }

  function findById(id) {
    const n = Number(id);
    for (const f of allTicketFiles()) {
      try {
        const t = parseTicketFile(f);
        if (t.number === n) return t;
      } catch {
        // skip broken
      }
    }
    return null;
  }

  function nextId() {
    let max = 0;
    for (const f of allTicketFiles()) {
      try {
        const t = parseTicketFile(f);
        if (t.number > max) max = t.number;
      } catch {
        // skip
      }
    }
    return max + 1;
  }

  function fileNameFor(id, title) {
    const slug = slugify(title).slice(0, 60) || 'ticket';
    const prefix = localCfg.id_prefix || '';
    const num = String(id).padStart(4, '0');
    return `${prefix}${num}-${slug}.md`;
  }

  function serializeTicket(ticket, body, comments) {
    const labelsYaml =
      ticket.labels.length === 0
        ? '[]'
        : `\n${ticket.labels.map((l) => `  - ${yamlQuote(l.name)}`).join('\n')}`;
    const assigneesYaml =
      ticket.assignees.length === 0
        ? '[]'
        : `\n${ticket.assignees.map((a) => `  - ${yamlQuote(a)}`).join('\n')}`;

    let commentsBlock = '## Comments\n';
    for (const c of comments) {
      const author = c.author || 'agent';
      commentsBlock += `\n### ${c.createdAt} — ${author}\n\n${c.body.trim()}\n`;
    }

    return `---
id: ${ticket.number}
title: ${yamlQuote(ticket.title)}
state: ${ticket.state}
labels: ${labelsYaml}
assignees: ${assigneesYaml}
created_at: ${yamlQuote(ticket.created_at || nowIso())}
updated_at: ${yamlQuote(nowIso())}
---

${body.trim()}

${commentsBlock}
`;
  }

  function writeTicket(ticket, body, comments) {
    ensureDirs();
    const desiredDir = ticket.state === 'closed' ? closedDir : openDir;
    const base =
      ticket.path && existsSync(ticket.path)
        ? basename(ticket.path)
        : fileNameFor(ticket.number, ticket.title);
    const targetPath = join(desiredDir, base);
    const content = serializeTicket(ticket, body, comments);
    mkdirSync(desiredDir, { recursive: true });
    writeFileSync(targetPath, content, 'utf-8');

    // open ↔ closed 移動時は旧パスを削除
    if (ticket.path && ticket.path !== targetPath && existsSync(ticket.path)) {
      try {
        unlinkSync(ticket.path);
      } catch {
        /* ignore */
      }
    }

    return targetPath;
  }

  return {
    backend: 'local',
    root,

    /**
     * @param {{ state?: string, label?: string }} [filter]
     * @returns {Promise<Array<{number:number,title:string,labels:Label[],url:string,state:string}>>}
     */
    async list(filter = {}) {
      ensureDirs();
      const stateFilter = filter.state || 'open';
      const files =
        stateFilter === 'all'
          ? allTicketFiles()
          : stateFilter === 'closed'
            ? listMdFiles(closedDir)
            : listMdFiles(openDir);

      const items = [];
      for (const f of files) {
        try {
          const t = parseTicketFile(f);
          if (filter.label && !t.labels.some((l) => l.name === filter.label)) continue;
          items.push({
            number: t.number,
            title: t.title,
            labels: t.labels,
            url: t.url,
            state: t.state,
          });
        } catch {
          // skip
        }
      }
      return items.sort((a, b) => a.number - b.number);
    },

    /**
     * @param {number|string} id
     * @returns {Promise<Ticket>}
     */
    async view(id) {
      const t = findById(id);
      if (!t) throw new Error(`チケット #${id} が見つかりません（local: ${root}）`);
      return {
        number: t.number,
        title: t.title,
        body: t.body,
        state: t.state,
        labels: t.labels,
        assignees: t.assignees,
        comments: t.comments,
        url: t.url,
        path: t.path,
      };
    },

    /**
     * @param {{ title: string, body?: string, labels?: string[] }} input
     */
    async create(input) {
      ensureDirs();
      const id = nextId();
      const ticket = {
        number: id,
        title: input.title,
        state: 'open',
        labels: (input.labels || []).map((name) => ({ name })),
        assignees: [],
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      const path = writeTicket(ticket, input.body || '', []);
      ticket.path = path;
      return {
        number: id,
        url: `local://${localCfg.dir || 'tickets'}/${id}`,
        title: input.title,
        state: 'open',
      };
    },

    /**
     * @param {number|string} id
     * @param {{ body: string, author?: string }} input
     */
    async comment(id, input) {
      const t = findById(id);
      if (!t) throw new Error(`チケット #${id} が見つかりません`);
      const comments = [
        ...t.comments,
        { createdAt: nowIso(), author: input.author || 'agent', body: input.body },
      ];
      writeTicket(
        {
          number: t.number,
          title: t.title,
          state: t.state,
          labels: t.labels,
          assignees: t.assignees,
          created_at: t.created_at,
          path: t.path,
        },
        t.body,
        comments
      );
      return { ok: true, number: t.number };
    },

    /**
     * @param {number|string} id
     * @param {{ add?: string[], remove?: string[] }} input
     */
    async editLabels(id, input) {
      const t = findById(id);
      if (!t) throw new Error(`チケット #${id} が見つかりません`);
      const set = new Set(t.labels.map((l) => l.name));
      for (const r of input.remove || []) set.delete(r);
      for (const a of input.add || []) set.add(a);
      const labels = [...set].map((name) => ({ name }));
      writeTicket(
        {
          number: t.number,
          title: t.title,
          state: t.state,
          labels,
          assignees: t.assignees,
          created_at: t.created_at,
          path: t.path,
        },
        t.body,
        t.comments
      );
      return { ok: true, number: t.number, labels };
    },

    /**
     * @param {number|string} id
     */
    async close(id) {
      const t = findById(id);
      if (!t) throw new Error(`チケット #${id} が見つかりません`);
      writeTicket(
        {
          number: t.number,
          title: t.title,
          state: 'closed',
          labels: t.labels,
          assignees: t.assignees,
          created_at: t.created_at,
          path: t.path,
        },
        t.body,
        t.comments
      );
      return { ok: true, number: t.number, state: 'closed' };
    },
  };
}

// ---------------------------------------------------------------------------
// GitHub store (gh CLI wrap)
// ---------------------------------------------------------------------------

/**
 * @param {string} cwd
 */
export function createGitHubStore(cwd) {
  function gh(args) {
    try {
      return execFileSync('gh', args, {
        cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (err) {
      const msg = err.stderr || err.message || String(err);
      throw new Error(`gh 失敗: ${msg}`);
    }
  }

  return {
    backend: 'github',

    async list(filter = {}) {
      const args = ['issue', 'list', '--json', 'number,title,labels,url,state'];
      if (filter.state === 'closed') args.push('--state', 'closed');
      else if (filter.state === 'all') args.push('--state', 'all');
      else args.push('--state', 'open');
      if (filter.label) args.push('--label', filter.label);
      const raw = gh(args);
      return JSON.parse(raw);
    },

    async view(id) {
      const raw = gh([
        'issue',
        'view',
        String(id),
        '--json',
        'number,title,body,labels,assignees,comments,state,url',
      ]);
      const data = JSON.parse(raw);
      return {
        number: data.number,
        title: data.title,
        body: data.body || '',
        state: data.state === 'CLOSED' || data.state === 'closed' ? 'closed' : 'open',
        labels: (data.labels || []).map((l) => ({ name: l.name })),
        assignees: (data.assignees || []).map((a) => a.login || a.name || String(a)),
        comments: (data.comments || []).map((c) => ({
          author: c.author?.login || c.author || 'unknown',
          createdAt: c.createdAt || c.created_at || '',
          body: c.body || '',
        })),
        url: data.url,
      };
    },

    async create(input) {
      const args = ['issue', 'create', '--title', input.title, '--body', input.body || ''];
      for (const l of input.labels || []) {
        args.push('--label', l);
      }
      // gh issue create は URL を返す
      const url = gh(args).trim();
      const m = url.match(/\/issues\/(\d+)/);
      const number = m ? Number(m[1]) : null;
      return { number, url, title: input.title, state: 'open' };
    },

    async comment(id, input) {
      gh(['issue', 'comment', String(id), '--body', input.body]);
      return { ok: true, number: Number(id) };
    },

    async editLabels(id, input) {
      const args = ['issue', 'edit', String(id)];
      for (const a of input.add || []) args.push('--add-label', a);
      for (const r of input.remove || []) args.push('--remove-label', r);
      if (args.length === 3) return { ok: true, number: Number(id), labels: [] };
      gh(args);
      return { ok: true, number: Number(id) };
    },

    async close(id) {
      gh(['issue', 'close', String(id)]);
      return { ok: true, number: Number(id), state: 'closed' };
    },
  };
}

// ---------------------------------------------------------------------------
// Markdown / frontmatter helpers
// ---------------------------------------------------------------------------

function splitFrontmatter(raw) {
  const text = raw.replace(/^\uFEFF/, '');
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: text };
  return { frontmatter: parseSimpleYaml(m[1]), body: m[2] };
}

/**
 * 最小 YAML: スカラーと 1 段の配列のみ
 * @param {string} yaml
 */
export function parseSimpleYaml(yaml) {
  /** @type {Record<string, any>} */
  const obj = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) {
      i++;
      continue;
    }
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      i++;
      continue;
    }
    const key = keyMatch[1];
    const rest = keyMatch[2];
    if (rest === '' || rest === '|' || rest === '>') {
      // 次行以降のインデント配列 or 空
      const arr = [];
      let j = i + 1;
      while (j < lines.length) {
        const item = lines[j].match(/^\s+-\s+(.*)$/);
        if (!item) break;
        arr.push(unquote(item[1]));
        j++;
      }
      if (arr.length > 0) {
        obj[key] = arr;
        i = j;
        continue;
      }
      obj[key] = rest === '' ? '' : rest;
      i++;
      continue;
    }
    if (rest === '[]') {
      obj[key] = [];
      i++;
      continue;
    }
    obj[key] = unquote(rest.replace(/#.*$/, '').trim());
    i++;
  }
  return obj;
}

function parseLabels(val) {
  if (Array.isArray(val)) return val.map(String);
  if (!val || val === '[]') return [];
  return [String(val)];
}

function parseStringList(val) {
  if (Array.isArray(val)) return val.map(String);
  if (!val || val === '[]') return [];
  return [String(val)];
}

function parseComments(body) {
  const idx = body.search(/^## Comments\s*$/m);
  if (idx < 0) return [];
  const section = body.slice(idx);
  const comments = [];
  const re = /^###\s+(\S+)\s+—\s+(.+)\s*$/gm;
  let match;
  const headers = [];
  while ((match = re.exec(section)) !== null) {
    headers.push({
      index: match.index,
      createdAt: match[1],
      author: match[2].trim(),
      full: match[0],
    });
  }
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].index + headers[i].full.length;
    const end = i + 1 < headers.length ? headers[i + 1].index : section.length;
    const bodyText = section.slice(start, end).trim();
    comments.push({
      createdAt: headers[i].createdAt,
      author: headers[i].author,
      body: bodyText,
    });
  }
  return comments;
}

function stripCommentsSection(body) {
  const idx = body.search(/^## Comments\s*$/m);
  if (idx < 0) return body;
  return body.slice(0, idx);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-') || 'ticket';
}

function yamlQuote(s) {
  const str = String(s);
  if (/^[\w./:@-]+$/.test(str) && !/^(true|false|null)$/i.test(str)) return str;
  return JSON.stringify(str);
}

function unquote(s) {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function nowIso() {
  return new Date().toISOString();
}


