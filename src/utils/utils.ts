import { ResourceConfig, StringIndexedObject } from 'codify-schemas';
import os from 'node:os';

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

export function areArraysEqual(
  isElementEqual: ((desired: unknown, current: unknown) => boolean) | undefined,
  desired: unknown,
  current: unknown
): boolean {
  if (!desired || !current) {
    return false;
  }

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
    const idx = currentCopy.findIndex((e2) => (
      isElementEqual
      ?? ((a, b) => a === b))(desiredCopy[counter], e2
    ))

    if (idx === -1) {
      return false;
    }

    desiredCopy.splice(counter, 1)
    currentCopy.splice(idx, 1)
  }

  return currentCopy.length === 0;
}
