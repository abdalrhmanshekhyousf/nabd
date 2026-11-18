import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allRoutes } from './routes.js';

// docs/API.md (task 5.5) is written from the code; this keeps it whole: a new
// route without `npm run docs:api -w server` fails here.
describe('the API reference', () => {
  it('lists every route the API serves', async () => {
    const doc = readFileSync(fileURLToPath(new URL('../../docs/API.md', import.meta.url)), 'utf8')
      // The formatter pads the tables.
      .replace(/ +/g, ' ');
    const missing = (await allRoutes())
      .filter((route) => route.prefix !== '/api/dev')
      .map((route) => {
        const path =
          route.path.length > route.prefix.length ? route.path.replace(/\/$/, '') : route.path;
        return `\`${route.method.toUpperCase()}\` | \`${path}\``;
      })
      .filter((row) => !doc.includes(row));
    expect(missing).toEqual([]);
  });
});
