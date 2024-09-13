import { StringIndexedObject } from 'codify-schemas';
import path from 'node:path';

import { untildify } from '../utils/utils.js';
import { StatefulParameter as StatefulParameterObj } from './stateful-parameter.js';

export interface ResourceSettings<T extends StringIndexedObject> {

  /**
   * The typeId of the resource.
   */
  id: string;

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
    matcher: (desired: Partial<T>, current: Partial<T>[],) => Partial<T>
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
  parameterSettings?: Partial<Record<keyof T, ParameterSetting>>;

  inputTransformation?: (desired: Partial<T>) => Promise<unknown> | unknown;
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

export type ParameterSetting =
  ArrayParameterSetting
  | DefaultParameterSetting
  | StatefulParameterSetting

export interface DefaultParameterSetting {
  type?: ParameterSettingType;

  /**
   * Default value for the parameter. If a value is not provided in the config, then this value will be used.
   */
  default?: unknown;

  inputTransformation?: (input: any) => Promise<any> | unknown;

  /**
   * Customize the equality comparison for a parameter.
   * @param desired
   * @param current
   */
  isEqual?: (desired: any, current: any) => boolean;

  /**
   * Chose if the resource can be modified instead of re-created to change this parameter. Defaults to false (re-create).
   */
  canModify?: boolean
}

export interface ArrayParameterSetting extends DefaultParameterSetting {
  type: 'array'
  isElementEqual?: (desired: any, current: any) => boolean
}

export interface StatefulParameterSetting extends DefaultParameterSetting {
  type: 'stateful',
  definition: StatefulParameterObj<any, unknown>,
  order?: number,
}

export const ParameterEqualsDefaults: Partial<Record<ParameterSettingType, (a: unknown, b: unknown) => boolean>> = {
  'boolean': (a: unknown, b: unknown) => Boolean(a) === Boolean(b),
  'directory': (a: unknown, b: unknown) => path.resolve(untildify(String(a))) === path.resolve(untildify(String(b))),
  'number': (a: unknown, b: unknown) => Number(a) === Number(b),
  'string': (a: unknown, b: unknown) => String(a) === String(b),
  'version': (desired: unknown, current: unknown) => String(current).includes(String(desired))
}
