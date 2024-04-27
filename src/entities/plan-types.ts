import { ResourceOperation } from 'codify-schemas';

/**
 * Customize properties for specific parameters. This will alter the way the library process changes to the parameter.
 */
export interface ParameterConfiguration {
  /**
   * Chose if the resource should be re-created or modified if this parameter is changed. Defaults to re-create.
   */
  planOperation?: ResourceOperation.MODIFY | ResourceOperation.RECREATE;
  /**
   * Customize the equality comparison for a parameter.
   * @param a
   * @param b
   */
  isEqual?: (desired: any, current: any) => boolean;

  isStatefulParameter?: boolean;
}

export interface PlanConfiguration<T> {
  statefulMode: boolean;
  parameterConfigurations?: Record<keyof T, ParameterConfiguration>;
}
