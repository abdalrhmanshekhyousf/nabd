import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests run against a separate database so they never touch development data.
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://postgres:postgres@localhost:5432/nabd_test?schema=public';

export default defineConfig({
  resolve: {
    alias: {
      '@nabd/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabaseUrl,
      JWT_ACCESS_SECRET: 'test-only-secret-that-is-long-enough-for-hs256',
      BCRYPT_ROUNDS: '4',
      // Uploaded files of the tests go to a throwaway folder.
      UPLOADS_DIR: join(tmpdir(), 'nabd-test-uploads'),
    },
    globalSetup: ['./tests/globalSetup.ts'],
    // Test files share one database; run them one after another.
    fileParallelism: false,
  },
});
