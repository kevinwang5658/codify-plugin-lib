import { StatefulParameter } from './stateful-parameter.js';
import { ResourceOperation } from 'codify-schemas';
import { Resource } from './resource.js';

export type ErrorMessage = string;

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ParameterConfiguration {
  /**
   * Chose if the resource should be re-created or modified if this parameter is changed. Defaults to re-create.
   */
  planOperation?: ResourceOperation.MODIFY | ResourceOperation.RECREATE;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  isEqual?: (a: any, b: any) => boolean;
}

/**
 * @param
 */
export interface ResourceConfiguration<T> {
  type: string;
  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,
  dependencies?: Resource<any>[];
  statefulParameters?: Array<StatefulParameter<T, T[keyof T]>>;
  parameterConfigurations?: Partial<Record<keyof T, ParameterConfiguration>>
}

export interface ResourceDefinition {
  [x: string]: {
    type: string;
  }
}
