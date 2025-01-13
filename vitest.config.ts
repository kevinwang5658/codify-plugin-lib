import { defaultExclude, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      ...defaultExclude,
      './src/utils/test-utils.test.ts',
      './src/pty/*'
    ]
  },
});
