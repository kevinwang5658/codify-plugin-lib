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
  opts?: Omit<CodifySpawnOptions, 'stdio' | 'stdioString' | 'shell'> & { throws?: boolean },
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
  } catch (error) {
    if (opts?.throws) {
      throw error;
    } else {
      console.error(`CodifySpawn Error for command ${cmd} ${args}`, error);

      return {
        status: SpawnStatus.ERROR,
        data: error as string,
      }
    }
  }
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify'); // TODO: replace with debug library
}
