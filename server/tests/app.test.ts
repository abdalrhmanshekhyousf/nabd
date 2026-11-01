import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('GET /api/health', () => {
  it('reports the server is up', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('errors', () => {
  it('unknown routes return a JSON 404 with a code and a developer hint', async () => {
    const res = await request(app).get('/api/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.debug).toContain('/api/does-not-exist');
  });

  it('answers in Arabic by default and in English when asked', async () => {
    const arabic = await request(app).get('/api/me');
    const english = await request(app).get('/api/me').set('Accept-Language', 'en-US,en;q=0.9');

    expect(arabic.body.error.message).toBe('سجّل دخولك لتكمل');
    expect(english.body.error.message).toBe('Sign in to continue');
    expect(english.body.error.code).toBe(arabic.body.error.code);
  });
});
