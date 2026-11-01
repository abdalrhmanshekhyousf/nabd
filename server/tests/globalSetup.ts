import { execSync } from 'node:child_process';

// Bring the test database up to the latest schema before any test runs.
export default function setup() {
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/nabd_test?schema=public',
    },
  });
}
