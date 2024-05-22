import { ResourceOperation } from 'codify-schemas';

export type ErrorMessage = string;

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ResourceParameterOptions {
  /**
   * Chose if the resource should be re-created or modified if this parameter is changed. Defaults to re-create.
   */
  planOperation?: ResourceOperation.MODIFY | ResourceOperation.RECREATE;
  /**
   * Customize the equality comparison for a parameter.
   * @param desired
   * @param current
   */
  isEqual?: (desired: any, current: any) => boolean;
  /**
   * Default value for the parameter. If a value is not provided in the config, the library will use this value.
   */
  default?: unknown,
}

/**
 * @param
 */

export interface ResourceDefinition {
  [x: string]: {
    type: string;
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors?: unknown[],
}
