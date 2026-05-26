'use strict';

const request = require('supertest');
const { makeTestApp } = require('./testUtils');

const ctx = makeTestApp();
let app;
let queueId;

beforeAll(async () => {
  process.env.ALLOW_BROWSER_QUEUE = '1';
  process.env.NODE_ENV = 'test';
  app = await ctx.setup();
  // Seed a queue row to attach orders to
  const res = await request(app).post('/queue').send({ deviceToken: 'order-dev', partySize: 2 });
  queueId = res.body.id;
});
afterAll(() => ctx.teardown());

const sampleItems = [
  { id: 'dish-1', name: '牛腩麵', price: 80, quantity: 1 },
  { id: 'dish-2', name: '腸粉', price: 50, quantity: 2 }
];

describe('POST /order', () => {
  test('400 when body is missing queueId', async () => {
    const res = await request(app).post('/order').send({ items: sampleItems });
    expect(res.status).toBe(400);
  });

  test('400 when items is not an array', async () => {
    const res = await request(app).post('/order').send({ queueId, items: 'bad' });
    expect(res.status).toBe(400);
  });

  test('404 when queueId does not exist', async () => {
    const res = await request(app).post('/order').send({ queueId: 99999, items: sampleItems });
    expect(res.status).toBe(404);
  });

  test('201 creates order and returns parsed items', async () => {
    const res = await request(app).post('/order').send({ queueId, items: sampleItems, note: '少辣' });
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.note).toBe('少辣');
  });

  test('201 upserts (overwrites) existing order', async () => {
    const newItems = [{ id: 'dish-3', name: '叉燒飯', price: 60, quantity: 1 }];
    const res = await request(app).post('/order').send({ queueId, items: newItems, note: '' });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe('叉燒飯');
  });

  test('normalizes negative price to 0', async () => {
    const res = await request(app)
      .post('/order')
      .send({ queueId, items: [{ id: 'x', name: 'X', price: -10, quantity: 1 }] });
    expect(res.status).toBe(201);
    expect(res.body.items[0].price).toBe(0);
  });
});

describe('GET /order/:queueId', () => {
  test('404 when no order exists for queue', async () => {
    // Create a fresh queue without placing order
    const q = await request(app).post('/queue').send({ deviceToken: 'noorder-dev', partySize: 1 });
    const res = await request(app).get(`/order/${q.body.id}`);
    expect(res.status).toBe(404);
  });

  test('returns order with parsed items', async () => {
    const res = await request(app).get(`/order/${queueId}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('GET /queue/:id/detail', () => {
  test('returns queue and order together', async () => {
    const res = await request(app).get(`/queue/${queueId}/detail`);
    expect(res.status).toBe(200);
    expect(res.body.queue.id).toBe(queueId);
    expect(res.body.order).not.toBeNull();
  });

  test('404 for unknown queue id', async () => {
    const res = await request(app).get('/queue/99999/detail');
    expect(res.status).toBe(404);
  });
});
