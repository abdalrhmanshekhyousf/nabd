import { defineConfig } from 'vitest/config';

// Tests run against a separate database so they never touch development data.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/nabd_test?schema=public';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
    },
    globalSetup: ['./tests/globalSetup.ts'],
    // Test files share one database; run them one after another.
    fileParallelism: false,
  },
});
