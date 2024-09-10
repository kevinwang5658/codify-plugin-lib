import { StringIndexedObject } from 'codify-schemas';
import path from 'node:path';

import { untildify } from '../utils/utils.js';
import { StatefulParameter as StatefulParameterObj } from './stateful-parameter.js';

export interface ResourceSettings<T extends StringIndexedObject> {

  /**
   * The id of the resource.
   */
  type: string;

  /**
   * Schema to validate user configs with. Must be in the format JSON Schema draft07
   */
  schema?: unknown;

  /**
   * Allow multiple of the same resource to unique. Set truthy if
   * multiples are allowed, for example the same application in differnet folders
   * or multiple git repos. Defaults to false.
   */
  allowMultiple?: {

    /**
     * If multiples are allowed then a matcher must be defined to match the desired
     * config with which resource it represents on the system. Return null if not found.
     * @param current An array of resources found installed on the system
     * @param desired The desired config to match.
     * @return The config from current which matches desired.
     */
    matcher: (current: T[], desired: T) => T
  }

  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  removeStatefulParametersBeforeDestroy?: boolean;

  /**
   * An array of type ids of resources that this resource depends on. This affects the order in which the resources are
   * planned and applied.
   */
  dependencies?: string[];

  /**
   * Additional options for configuring parameters.
   */
  parameterOptions?: Partial<Record<keyof T,
    ArrayParameter
    | ParameterSetting
    | StatefulParameter<T, T[keyof T]>
  >>;
}

export type ParameterSettingType =
  'any'
  | 'array'
  | 'boolean'
  | 'directory'
  | 'number'
  | 'stateful'
  | 'string'
  | 'version';

export interface ParameterSetting {
  type: ParameterSettingType;
  default?: unknown;
  inputTransformation?: (input: unknown) => unknown;
  isEqual?: (desired: unknown, current: unknown) => boolean
}

export interface ArrayParameter extends ParameterSetting {
  type: 'array'
  isElementEqual?: (desired: unknown, current: unknown) => boolean
}

export interface StatefulParameter<T extends StringIndexedObject, V> extends ParameterSetting {
  type: 'stateful',
  definition: StatefulParameterObj<T, T[keyof T]>,
  order?: number,
}

export interface AnyParameter extends ParameterSetting {
  type: 'any',
  isEqual: (a: unknown, b: unknown) => boolean
}

export const ParameterEqualsDefaults: Partial<Record<ParameterSettingType, (a: unknown, b: unknown) => boolean>> = {
  'boolean': (a: unknown, b: unknown) => Boolean(a) === Boolean(b),
  'directory': (a: unknown, b: unknown) => path.resolve(untildify(String(a))) === path.resolve(untildify(String(b))),
  'number': (a: unknown, b: unknown) => Number(a) === Number(b),
  'string': (a: unknown, b: unknown) => String(a) === String(b),
  'version': (desired: unknown, current: unknown) => String(current).includes(String(desired))
}
