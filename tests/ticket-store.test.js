/**
 * ローカルチケットストアのテスト
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createLocalStore,
  loadTicketConfig,
  parseSimpleYaml,
} from '../bin/lib/ticket-store.js';

function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'ai-team-ticket-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(
    join(root, '.claude', 'ai-team-config.yml'),
    `ticket_backend: local
local_tickets:
  dir: tickets
  id_prefix: ""
`,
    'utf-8'
  );
  return root;
}

test('loadTicketConfig: 未設定時は github 既定', () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-team-ticket-def-'));
  mkdirSync(join(root, '.claude'), { recursive: true });
  writeFileSync(join(root, '.claude', 'ai-team-config.yml'), 'mode: solo\n', 'utf-8');
  const cfg = loadTicketConfig(root);
  assert.equal(cfg.ticket_backend, 'github');
  rmSync(root, { recursive: true, force: true });
});

test('loadTicketConfig: local を読む', () => {
  const root = makeProject();
  const cfg = loadTicketConfig(root);
  assert.equal(cfg.ticket_backend, 'local');
  assert.equal(cfg.local_tickets.dir, 'tickets');
  rmSync(root, { recursive: true, force: true });
});

test('parseSimpleYaml: スカラーと配列', () => {
  const obj = parseSimpleYaml(`id: 1
title: "hello"
labels:
  - a
  - b
assignees: []
`);
  assert.equal(obj.id, '1');
  assert.equal(obj.title, 'hello');
  assert.deepEqual(obj.labels, ['a', 'b']);
  assert.deepEqual(obj.assignees, []);
});

test('local store: create → comment → label → close', async () => {
  const root = makeProject();
  const store = createLocalStore(root, { dir: 'tickets', id_prefix: '' });

  const created = await store.create({
    title: '進捗管理ローカル化',
    body: '本文です',
    labels: ['backend:tech-lead'],
  });
  assert.equal(created.number, 1);
  assert.equal(created.state, 'open');
  assert.match(created.url, /^local:\/\/tickets\/1$/);

  const listed = await store.list({ state: 'open' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].title, '進捗管理ローカル化');

  await store.comment(1, { body: '設計完了', author: 'tech-lead' });
  await store.editLabels(1, {
    add: ['backend:implementer'],
    remove: ['backend:tech-lead'],
  });

  const viewed = await store.view(1);
  assert.equal(viewed.body, '本文です');
  assert.equal(viewed.comments.length, 1);
  assert.equal(viewed.comments[0].body, '設計完了');
  assert.deepEqual(
    viewed.labels.map((l) => l.name),
    ['backend:implementer']
  );

  await store.close(1);
  const openList = await store.list({ state: 'open' });
  const closedList = await store.list({ state: 'closed' });
  assert.equal(openList.length, 0);
  assert.equal(closedList.length, 1);

  const closedDir = join(root, 'tickets', 'closed');
  assert.ok(existsSync(closedDir));
  assert.ok(readdirSync(closedDir).some((f) => f.endsWith('.md')));

  rmSync(root, { recursive: true, force: true });
});

test('local store: 連番採番', async () => {
  const root = makeProject();
  const store = createLocalStore(root, { dir: 'tickets', id_prefix: '' });
  await store.create({ title: 'A', body: '' });
  const b = await store.create({ title: 'B', body: '' });
  assert.equal(b.number, 2);
  rmSync(root, { recursive: true, force: true });
});

test('local store: 存在しない id はエラー', async () => {
  const root = makeProject();
  const store = createLocalStore(root, { dir: 'tickets', id_prefix: '' });
  await assert.rejects(() => store.view(99), /見つかりません/);
  rmSync(root, { recursive: true, force: true });
});
