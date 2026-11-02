import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      // Form tests type into many fields; with all three workspaces testing at
      // once a busy machine can take longer than the default 5s.
      testTimeout: 15_000,
    },
  }),
);
