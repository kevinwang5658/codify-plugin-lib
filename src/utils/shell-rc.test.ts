import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Utils } from './index.js';

describe('getShellRcFiles / spawn-flag agreement', () => {
  const homeDir = os.homedir();
  const originalShell = process.env.SHELL;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (originalShell === undefined) {
      delete process.env.SHELL;
    } else {
      process.env.SHELL = originalShell;
    }
    vi.restoreAllMocks();
  });

  it('prefers .bashrc for non-login bash on macOS (the CI runner case)', () => {
    process.env.SHELL = '/bin/bash';
    vi.spyOn(Utils, 'isLinux').mockReturnValue(false);
    vi.spyOn(Utils, 'isMacOS').mockReturnValue(true);

    expect(Utils.needsLoginShell()).toBe(false);
    expect(Utils.getPrimaryShellRc()).toBe(path.join(homeDir, '.bashrc'));
  });

  it('prefers .bashrc for non-login bash on Linux', () => {
    process.env.SHELL = '/bin/bash';
    vi.spyOn(Utils, 'isLinux').mockReturnValue(true);
    vi.spyOn(Utils, 'isMacOS').mockReturnValue(false);

    expect(Utils.needsLoginShell()).toBe(false);
    expect(Utils.getPrimaryShellRc()).toBe(path.join(homeDir, '.bashrc'));
  });

  it('prefers .bash_profile when a login shell is used (SHELL unset)', () => {
    delete process.env.SHELL;
    vi.spyOn(os, 'userInfo').mockReturnValue({ shell: '/bin/bash' } as ReturnType<typeof os.userInfo>);

    expect(Utils.needsLoginShell()).toBe(true);
    expect(Utils.getPrimaryShellRc()).toBe(path.join(homeDir, '.bash_profile'));
  });

  it('prefers .zshrc for zsh, which both login and non-login zsh source', () => {
    process.env.SHELL = '/bin/zsh';

    expect(Utils.getPrimaryShellRc()).toBe(path.join(homeDir, '.zshrc'));
  });
});
