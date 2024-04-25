import promiseSpawn from '@npmcli/promise-spawn';
import { SpawnOptions } from 'child_process';
import { ResourceConfig } from 'codify-schemas';
import { StringIndexedObject } from './common-types.js';

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

/**
 *
 * @param cmd Command to run. Ex: `rm -rf`
 * @param args Optional additional arguments to append
 * @param opts Standard options for node spawn. Additional argument:
 * throws determines if a shell will throw a JS error. Defaults to true
 * @param extras From PromiseSpawn
 *
 * @see promiseSpawn
 * @see spawn
 *
 * @returns SpawnResult { status: SUCCESS | ERROR; data: string }
 */
export async function codifySpawn(
  cmd: string,
  args?: string[],
  opts?: Omit<CodifySpawnOptions, 'stdio' | 'stdioString'> & { throws?: boolean },
  extras?: Record<any, any>,
): Promise<SpawnResult> {
  try {
    // TODO: Need to benchmark the effects of using sh vs zsh for shell.
    //  Seems like zsh shells run slower
    const result = await promiseSpawn(
      cmd,
      args ?? [],
      { ...opts, stdio: 'pipe', stdioString: true, shell: opts?.shell ?? process.env.SHELL },
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
    const shouldThrow = opts?.throws ?? true;
    if (isDebug() || shouldThrow) {
      console.error(`CodifySpawn Error for command ${cmd} ${args}`, error);
    }

    if (shouldThrow) {
      throw error;
    }

    return {
      status: SpawnStatus.ERROR,
      data: error as string,
    }
  }
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify'); // TODO: replace with debug library
}

export function splitUserConfig<T extends StringIndexedObject>(
  config: T & ResourceConfig
): { parameters: T;  resourceInfo: ResourceConfig} {
  const resourceInfo = {
    type: config.type,
    name: config.name,
    dependsOn: config.dependsOn,
  };

  const { type, name, dependsOn, ...parameters } = config;
  return {
    parameters: parameters as T,
    resourceInfo
  };
}
