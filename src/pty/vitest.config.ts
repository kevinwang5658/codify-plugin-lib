import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'forks',
    fileParallelism: false,
    exclude: [
      ...defaultExclude,
      './src/utils/test-utils.test.ts',
    ]
  },
});
