import promiseSpawn from '@npmcli/promise-spawn';
import { SpawnOptions } from 'child_process';

export enum SpawnStatus {
  SUCCESS = 'success',
  ERROR = 'error',
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
    const result = await promiseSpawn(
      cmd,
      args ?? [],
      { ...opts, stdio: 'pipe', stdioString: true, shell: true },
      extras,
    );

    if (isDebug()) {
      console.log(`codifySpawn result for: ${cmd}`);
      console.log(JSON.stringify(result, null, 2))
    }

    const status = result.code === 0
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
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify'); // TODO: replace with debug library
}
