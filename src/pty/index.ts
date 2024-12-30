export interface SpawnResult {
  status: 'success' | 'error';
  exitCode: number;
  data: string;
}

export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, unknown>,
}

export class SpawnError extends Error {
  data: string;
  cmd: string;
  exitCode: number;

  constructor(cmd: string, exitCode: number, data: string) {
    super(`Spawn Error: on command "${cmd}" with exit code: ${exitCode}\nOutput:\n${data}`);

    this.data = data;
    this.cmd = cmd;
    this.exitCode = exitCode;
  }

}

export interface IPty {
  spawn(cmd: string, options?: SpawnOptions): Promise<SpawnResult>

  spawnSafe(cmd: string, options?: SpawnOptions): Promise<SpawnResult>

  kill(): Promise<{ exitCode: number, signal?: number | undefined }>
}
