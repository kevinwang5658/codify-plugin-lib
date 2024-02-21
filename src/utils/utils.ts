import promiseSpawn from '@npmcli/promise-spawn';
import { SpawnOptions } from 'child_process';

export enum SpawnStatus {
  SUCCESS,
  ERROR,
}

export interface SpawnResult {
  status: SpawnStatus,
  data: string;
}

type CodifySpawnOptions = {
  cwd?: string;
  stdioString?: boolean;
} & SpawnOptions

export async function codifySpawn(
  cmd: string,
  args?: string[],
  opts?: Omit<CodifySpawnOptions, 'stdio' | 'stdioString' | 'shell'>,
  extras?: Record<any, any>,
): Promise<SpawnResult> {
  try {
    const stdio = isDebug() ? 'inherit' : 'pipe';
    const result = await promiseSpawn(
      cmd,
      args ?? [],
      { ...opts, stdio, stdioString: true, shell: true },
      extras
    );

    const status = (result.code === 0 && !result.stderr)
      ? SpawnStatus.SUCCESS
      : SpawnStatus.ERROR;

    return {
      status,
      data: status === SpawnStatus.SUCCESS ? result.stdout : result.stderr
    }
  } catch (e) {
    return {
      status: SpawnStatus.ERROR,
      data: e as string,
    }
  }
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify');
}
