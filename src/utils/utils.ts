import promiseSpawn from '@npmcli/promise-spawn';
import { SpawnOptions } from 'child_process';

export interface SpawnResult {
  code: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

type CodifySpawnOptions = {
  cwd?: string;
  stdioString?: boolean;
} & SpawnOptions

export async function codifySpawn(
  cmd: string,
  args: string[],
  opts?: CodifySpawnOptions,
  extras?: Record<any, any>,
): Promise<SpawnResult> {
  const stdio = isDebug() ? 'inherit' : 'pipe';
  return promiseSpawn(
    cmd,
    args,
    { ...opts, stdio, stdioString: true },
    extras
  );
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify');
}
