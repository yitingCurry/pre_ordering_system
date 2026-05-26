'use strict';

const request = require('supertest');
const { makeTestApp } = require('./testUtils');

const ctx = makeTestApp();
let app;

beforeAll(async () => { app = await ctx.setup(); });
afterAll(() => ctx.teardown());

describe('GET /health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('backend');
  });
});
