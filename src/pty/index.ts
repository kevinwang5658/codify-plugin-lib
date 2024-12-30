import { ptyLocalStorage } from '../utils/pty-local-storage.js';

export interface SpawnResult {
  status: 'success' | 'error';
  exitCode: number;
  data: string;
}

export enum SpawnStatus {
  SUCCESS = 'success',
  ERROR = 'error',
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

export function getPty(): IPty {
  return ptyLocalStorage.getStore() as IPty;
}
