import promiseSpawn from '@npmcli/promise-spawn';
import { ResourceConfig, StringIndexedObject } from 'codify-schemas';
import { SpawnOptions } from 'node:child_process';
import os from 'node:os';

import { ArrayParameterSetting } from '../resource/resource-settings.js';

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
  config: ResourceConfig & T
): { parameters: T; coreParameters: ResourceConfig } {
  const coreParameters = {
    type: config.type,
    ...(config.name ? { name: config.name } : {}),
    ...(config.dependsOn ? { dependsOn: config.dependsOn } : {}),
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { type, name, dependsOn, ...parameters } = config;

  return {
    parameters: parameters as T,
    coreParameters,
  };
}

export function setsEqual(set1: Set<unknown>, set2: Set<unknown>): boolean {
  return set1.size === set2.size && [...set1].every((v) => set2.has(v));
}

const homeDirectory = os.homedir();

export function untildify(pathWithTilde: string) {
  return homeDirectory ? pathWithTilde.replace(/^~(?=$|\/|\\)/, homeDirectory) : pathWithTilde;
}

export function areArraysEqual(parameter: ArrayParameterSetting, desired: unknown, current: unknown) {
  if (!Array.isArray(desired) || !Array.isArray(current)) {
    throw new Error(`A non-array value:
          
Desired: ${JSON.stringify(desired, null, 2)}

Current: ${JSON.stringify(desired, null, 2)}

Was provided even though type array was specified.
`)
  }

  if (desired.length !== current.length) {
    return false;
  }

  const desiredCopy = [...desired];
  const currentCopy = [...current];

  // Algorithm for to check equality between two un-ordered; un-hashable arrays using
  // an isElementEqual method. Time: O(n^2)
  for (let counter = desiredCopy.length - 1; counter >= 0; counter--) {
    const idx = currentCopy.findIndex((e2) => (parameter.isElementEqual ?? ((a, b) => a === b))(desiredCopy[counter], e2))

    if (idx === -1) {
      return false;
    }

    desiredCopy.splice(counter, 1)
    currentCopy.splice(idx, 1)
  }

  return currentCopy.length === 0;
}
