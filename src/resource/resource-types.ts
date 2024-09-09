export type ErrorMessage = string;

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ResourceParameterOptions {
  /**
   * Default value for the parameter. If a value is not provided in the config, the library will use this value.
   */
  default?: unknown;
  /**
   * Customize the equality comparison for a parameter.
   * @param desired
   * @param current
   */
  isEqual?: (desired: any, current: any) => boolean;
  /**
   * Chose if the resource should be re-created or modified if this parameter is changed. Defaults to false (re-create).
   */
  modifyOnChange?: boolean;
}

/**
 * @param
 */

export interface ResourceDefinition {
  [x: string]: {
    type: string;
  }
}
