'use strict';

const request = require('supertest');
const { makeTestApp } = require('./testUtils');

const ctx = makeTestApp();
let app;

beforeAll(async () => {
  process.env.ALLOW_BROWSER_QUEUE = '1';
  process.env.NODE_ENV = 'test';
  app = await ctx.setup();
});
afterAll(() => ctx.teardown());

// ── POST /queue ──────────────────────────────────────────────────────────────
describe('POST /queue', () => {
  test('400 when both lineUserId and deviceToken are missing', async () => {
    const res = await request(app).post('/queue').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/身份識別/);
  });

  test('400 when partySize is 0', async () => {
    const res = await request(app).post('/queue').send({ deviceToken: 'dev-1', partySize: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/1–20/);
  });

  test('400 when partySize is 21', async () => {
    const res = await request(app).post('/queue').send({ deviceToken: 'dev-1', partySize: 21 });
    expect(res.status).toBe(400);
  });

  test('400 when partySize is a float', async () => {
    const res = await request(app).post('/queue').send({ deviceToken: 'dev-1', partySize: 1.5 });
    expect(res.status).toBe(400);
  });

  test('201 created with incrementing number', async () => {
    const r1 = await request(app).post('/queue').send({ deviceToken: 'dev-A', partySize: 2 });
    const r2 = await request(app).post('/queue').send({ deviceToken: 'dev-B', partySize: 3 });
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.body.number).toBe(r1.body.number + 1);
  });

  test('201 created with status=waiting', async () => {
    const res = await request(app).post('/queue').send({ deviceToken: 'dev-C', partySize: 1 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('waiting');
    expect(res.body.partySize).toBe(1);
  });

  test('defaults partySize to 1 when omitted', async () => {
    const res = await request(app).post('/queue').send({ deviceToken: 'dev-default' });
    expect(res.status).toBe(201);
    expect(res.body.partySize).toBe(1);
  });
});

// ── GET /queue ───────────────────────────────────────────────────────────────
describe('GET /queue', () => {
  test('returns queue array and waitingCount', async () => {
    const res = await request(app).get('/queue');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.queue)).toBe(true);
    expect(typeof res.body.waitingCount).toBe('number');
  });
});

// ── POST /queue/next ─────────────────────────────────────────────────────────
describe('POST /queue/next', () => {
  test('returns message when no waiting queue', async () => {
    // Clear then check
    await request(app).post('/queue/clear');
    const res = await request(app).post('/queue/next');
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/沒有/);
  });

  test('calls next waiting queue and returns it as called', async () => {
    await request(app).post('/queue/clear');
    await request(app).post('/queue').send({ deviceToken: 'next-dev-1', partySize: 2 });
    const res = await request(app).post('/queue/next');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('called');
  });
});

// ── POST /queue/:id/call ─────────────────────────────────────────────────────
describe('POST /queue/:id/call', () => {
  test('400 for invalid id', async () => {
    const res = await request(app).post('/queue/0/call');
    expect(res.status).toBe(400);
  });

  test('404 for non-existing queue id', async () => {
    const res = await request(app).post('/queue/99999/call');
    expect(res.status).toBe(404);
  });

  test('calls a waiting queue row successfully', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'call-dev', partySize: 1 });
    const res = await request(app).post(`/queue/${created.body.id}/call`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('called');
  });

  test('400 when trying to call a non-waiting queue row', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'call-dev-2', partySize: 1 });
    await request(app).post(`/queue/${created.body.id}/call`);
    const res = await request(app).post(`/queue/${created.body.id}/call`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/等待中/);
  });
});

// ── POST /queue/:id/skip ─────────────────────────────────────────────────────
describe('POST /queue/:id/skip', () => {
  test('404 for non-existing id', async () => {
    const res = await request(app).post('/queue/99999/skip');
    expect(res.status).toBe(404);
  });

  test('skips a waiting queue row', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'skip-dev', partySize: 1 });
    const res = await request(app).post(`/queue/${created.body.id}/skip`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('skipped');
  });

  test('400 when trying to skip a done queue row', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'skip-dev-done', partySize: 1 });
    const id = created.body.id;
    await request(app).post(`/queue/${id}/call`);
    await request(app).post(`/queue/${id}/seat`);
    await request(app).post(`/queue/${id}/leave`);
    const res = await request(app).post(`/queue/${id}/skip`);
    expect(res.status).toBe(400);
  });
});

// ── POST /queue/:id/seat ─────────────────────────────────────────────────────
describe('POST /queue/:id/seat', () => {
  test('seats a called queue row', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'seat-dev', partySize: 1 });
    const id = created.body.id;
    await request(app).post(`/queue/${id}/call`);
    const res = await request(app).post(`/queue/${id}/seat`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('seated');
  });

  test('400 when trying to seat a done queue row', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'seat-dev-2', partySize: 1 });
    const id = created.body.id;
    await request(app).post(`/queue/${id}/call`);
    await request(app).post(`/queue/${id}/seat`);
    await request(app).post(`/queue/${id}/leave`);
    const res = await request(app).post(`/queue/${id}/seat`);
    expect(res.status).toBe(400);
  });
});

// ── POST /queue/:id/leave ────────────────────────────────────────────────────
describe('POST /queue/:id/leave', () => {
  test('400 if queue is not seated', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'leave-dev', partySize: 1 });
    const res = await request(app).post(`/queue/${created.body.id}/leave`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/已入座/);
  });

  test('full flow: waiting → called → seated → done', async () => {
    await request(app).post('/queue/clear');
    const created = await request(app).post('/queue').send({ deviceToken: 'flow-dev', partySize: 2 });
    const id = created.body.id;

    await request(app).post(`/queue/${id}/call`);
    await request(app).post(`/queue/${id}/seat`);
    const res = await request(app).post(`/queue/${id}/leave`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('done');
    expect(res.body.feedbackSent).toBe(false);
    expect(res.body.feedbackSkipped).toBe(false);
  });

  test('400 for invalid queue id', async () => {
    const res = await request(app).post('/queue/0/leave');
    expect(res.status).toBe(400);
  });
});

// ── POST /queue/clear ────────────────────────────────────────────────────────
describe('POST /queue/clear', () => {
  test('clears all queues and returns success', async () => {
    await request(app).post('/queue').send({ deviceToken: 'clear-dev', partySize: 1 });
    const res = await request(app).post('/queue/clear');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const q = await request(app).get('/queue');
    expect(q.body.queue).toHaveLength(0);
  });
});
