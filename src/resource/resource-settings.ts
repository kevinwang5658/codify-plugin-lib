import { StringIndexedObject } from 'codify-schemas';
import path from 'node:path';

import { areArraysEqual, untildify } from '../utils/utils.js';
import { StatefulParameter } from './stateful-parameter.js';

/**
 * The configuration and settings for a resource.
 */
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
   * multiples are allowed, for example for applications, there can be multiple copy of the same application installed
   * on the system. Or there can be multiple git repos. Defaults to false.
   */
  allowMultiple?: {

    /**
     * If multiple copies are allowed then a matcher must be defined to match the desired
     * config with one of the resources currently existing on the system. Return null if there is no match.
     *
     * @param current An array of resources found installed on the system
     * @param desired The desired config to match.
     *
     * @return The matched resource.
     */
    matcher: (desired: Partial<T>, current: Partial<T>[],) => Partial<T>
  }

  /**
   * If true, {@link StatefulParameter} remove() will be called before resource destruction. This is useful
   * if the stateful parameter needs to be first uninstalled (cleanup) before the overall resource can be
   * uninstalled. Defaults to false.
   */
  removeStatefulParametersBeforeDestroy?: boolean;

  /**
   * An array of type ids of resources that this resource depends on. This affects the order in which multiple resources are
   * planned and applied.
   */
  dependencies?: string[];

  /**
   * Options for configuring parameters operations including overriding the equals function, adding default values
   * and applying any input transformations. Use parameter settings to define stateful parameters as well.
   */
  parameterSettings?: Partial<Record<keyof T, ParameterSetting>>;

  /**
   * A config level transformation that is only applied to the user supplied desired config. This transformation is allowed
   * to add, remove or modify keys as well as values. Changing this transformation for existing libraries will mess up existing states.
   *
   * @param desired
   */
  inputTransformation?: (desired: Partial<T>) => Promise<unknown> | unknown;
}

/**
 * The type of parameter. This value is mainly used to determine a pre-set equality method for comparing the current
 * config with desired config. Certain types will have additional options to help support it. For example the type
 * stateful requires a stateful parameter definition and type array takes an isElementEqual method.
 */
export type ParameterSettingType =
  'any'
  | 'array'
  | 'boolean'
  | 'directory'
  | 'number'
  | 'stateful'
  | 'string'
  | 'version';

/**
 * Typing information for the parameter setting. This represents a setting on a specific parameter within a
 * resource. Options for configuring parameters operations including overriding the equals function, adding default values
 * and applying any input transformations. See {@link DefaultParameterSetting } for more information.
 * Use parameter settings to define stateful parameters as well.
 */

export type ParameterSetting =
  ArrayParameterSetting
  | DefaultParameterSetting
  | StatefulParameterSetting

/**
 * The parent class for parameter settings. The options are applicable to array parameter settings
 * as well.
 */
export interface DefaultParameterSetting {
  /**
   * The type of the value of this parameter. See {@link ParameterSettingType} for the available options. This value
   * is mainly used to determine the equality method when performing diffing.
   */
  type?: ParameterSettingType;

  /**
   * Default value for the parameter. If a value is not provided in the config, then this value will be used.
   */
  default?: unknown;

  /**
   * A transformation of the input value for this parameter. This transformation is only applied to the desired parameter
   * value supplied by the user.
   *
   * @param input The original parameter value from the desired config.
   */
  inputTransformation?: (input: any) => Promise<any> | any;

  /**
   * Customize the equality comparison for a parameter. This is used in the diffing algorithm for generating the plan.
   * This value will override the pre-set equality function from the type. Return true if the desired value is
   * equivalent to the current value.
   *
   * @param desired The desired value.
   * @param current The current value.
   *
   * @return Return true if equal
   */
  isEqual?: (desired: any, current: any) => boolean;

  /**
   * Chose if the resource can be modified instead of re-created when there is a change to this parameter.
   * Defaults to false (re-create).
   *
   * Examples:
   * 1. Settings like git user name and git user email that have setter calls and don't require the re-installation of git
   * 2. AWS profile secret keys that can be updated without the re-installation of AWS CLI
   */
  canModify?: boolean
}

/**
 * Array type specific settings. See {@link DefaultParameterSetting } for a full list of options.
 */
export interface ArrayParameterSetting extends DefaultParameterSetting {
  type: 'array'

  /**
   * An element level equality function for arrays. The diffing algorithm will take isElementEqual and use it in a
   * O(n^2) equality comparison to determine if the overall array is equal. This value will override the pre-set equality
   * function for arrays (desired === current). Return true if the desired element is equivalent to the current element.
   *
   * @param desired An element of the desired array
   * @param current An element of the current array
   *
   * @return Return true if desired is equivalent to current.
   */
  isElementEqual?: (desired: any, current: any) => boolean
}

/**
 * Stateful parameter type specific settings. A stateful parameter is a sub-resource that can hold its own
 * state but is still tied to the overall state of the resource. For example 'homebrew' is represented
 * as a resource and taps, formulas and casks are represented as a stateful parameter. A formula can be installed,
 * modified and removed (has state) but it is still tied to the overall lifecycle of homebrew.
 *
 */
export interface StatefulParameterSetting extends DefaultParameterSetting {
  type: 'stateful',

  /**
   * The stateful parameter definition. A stateful parameter is a sub-resource that can hold its own
   * state but is still tied to the overall state of the resource. For example 'homebrew' is represented
   * as a resource and taps, formulas and casks are represented as a stateful parameter. A formula can be installed,
   * modified and removed (has state) but it is still tied to the overall lifecycle of homebrew.
   */
  definition: StatefulParameter<any, unknown>,

  /**
   * The order multiple stateful parameters should be applied in. The order is applied in ascending order (1, 2, 3...).
   */
  order?: number,
}

const ParameterEqualsDefaults: Partial<Record<ParameterSettingType, (a: unknown, b: unknown) => boolean>> = {
  'boolean': (a: unknown, b: unknown) => Boolean(a) === Boolean(b),
  'directory': (a: unknown, b: unknown) => path.resolve(untildify(String(a))) === path.resolve(untildify(String(b))),
  'number': (a: unknown, b: unknown) => Number(a) === Number(b),
  'string': (a: unknown, b: unknown) => String(a) === String(b),
  'version': (desired: unknown, current: unknown) => String(current).includes(String(desired))
}


export function resolveEqualsFn(parameter: ParameterSetting, key: string): (desired: unknown, current: unknown) => boolean {
  if (parameter.type === 'array') {
    return parameter.isEqual ?? areArraysEqual.bind(areArraysEqual, parameter as ArrayParameterSetting)
  }

  if (parameter.type === 'stateful') {
    return resolveEqualsFn((parameter as StatefulParameterSetting).definition.getSettings(), key)
  }

  return parameter.isEqual ?? ParameterEqualsDefaults[parameter.type as ParameterSettingType] ?? (((a, b) => a === b));
}
