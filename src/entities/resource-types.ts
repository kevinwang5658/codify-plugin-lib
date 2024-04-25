import { StatefulParameter } from './stateful-parameter.js';
import { ResourceOperation } from 'codify-schemas';
import { Resource } from './resource.js';

export type ErrorMessage = string;

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ParameterConfiguration<T> {
  /**
   * Chose if the resource should be re-created or modified if this parameter is changed. Defaults to re-create.
   */
  planOperation?: ResourceOperation.MODIFY | ResourceOperation.RECREATE;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  isEqual?: (a: any, b: any) => boolean;
  statefulParameter?: StatefulParameter<T, keyof T>
}

/**
 * @param
 */
export interface ResourceConfiguration<T> {
  name: string;
  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,
  dependencies?: Resource<any>[];
  statefulParameters?: Partial<Record<keyof T, StatefulParameter<T, keyof T>>>;
  parameterConfigurations?: Partial<Record<keyof T, ParameterConfiguration<T>>>
}

export interface ResourceDefinition {
  [x: string]: {
    type: string;
  }
}
