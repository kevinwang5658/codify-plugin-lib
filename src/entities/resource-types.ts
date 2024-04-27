import { StatefulParameter } from './stateful-parameter.js';
import { ResourceOperation, StringIndexedObject } from 'codify-schemas';

export type ErrorMessage = string;

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ResourceParameterConfiguration {
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
}

/**
 * @param
 */
export interface ResourceConfiguration<T extends StringIndexedObject> {
  type: string;
  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,
  dependencies?: string[];
  statefulParameters?: Array<StatefulParameter<T, T[keyof T]>>;
  parameterConfigurations?: Partial<Record<keyof T, ResourceParameterConfiguration>>
}

export interface ResourceDefinition {
  [x: string]: {
    type: string;
  }
}

export interface ValidationResult {
  isValid: boolean;
  errors?: unknown[],
}
