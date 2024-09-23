import { $, Shell } from 'zx';

export class ShellContext implements Shell {
  zx: Shell = $({ shell: true });

  static create(): ShellContext {
    return new ShellContext();
  }

}
