import { StringIndexedObject } from 'codify-schemas';
import { StatefulParameter } from './stateful-parameter.js';
import { TransformParameter } from './transform-parameter.js';
import { ResourceParameterOptions } from './resource-types.js';
import { ParameterOptions } from './plan-types.js';

export interface ResourceOptions<T extends StringIndexedObject> {
  type: string;
  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,
  dependencies?: string[];
  parameterOptions?: Partial<Record<keyof T,
    ResourceParameterOptions
    | StatefulParameter<T, T[keyof T]>
    | TransformParameter<T>
  >>
}

export class ResourceOptionsParser<T extends StringIndexedObject> {
  private options: ResourceOptions<T>;

  constructor(options: ResourceOptions<T>) {
    this.options = options;
  }

  get statefulParameters(): Map<keyof T, StatefulParameter<T, T[keyof T]>> {
    const statefulParameters =
      Object.entries(this.options.parameterOptions ?? {})
      .filter(([, v]) => v instanceof StatefulParameter)

    return new Map(statefulParameters) as Map<keyof T, StatefulParameter<T, T[keyof T]>>;
  }

  get transformParameters(): Map<keyof T, TransformParameter<T>> {
    const transformParameters =
      Object.entries(this.options.parameterOptions ?? {})
        .filter(([, v]) => v instanceof TransformParameter)

    return new Map(transformParameters) as Map<keyof T, TransformParameter<T>>;
  }

  get resourceParameters(): Map<keyof T, ResourceParameterOptions> {
    const resourceParameters =
      Object.entries(this.options.parameterOptions ?? {})
        .filter(([, v]) => !(v instanceof TransformParameter || v instanceof StatefulParameter))

    return new Map(resourceParameters) as Map<keyof T, ResourceParameterOptions>;
  }

  get changeSetParameterOptions(): Record<keyof T, ParameterOptions>  {
    const resourceParameters = Object.fromEntries(
      [...this.resourceParameters.entries()]
        .map(([name, value]) => ([name, { ...value, isStatefulParameter: false }]))
    );

    const statefulParameters = [...this.statefulParameters.entries()]
      ?.reduce((obj, sp) => {
        return {
          ...obj,
          [sp[0]]: {
            ...sp[1],
            isStatefulParameter: true,
          }
        }
      }, {} as Record<keyof T, ParameterOptions>)

    return {
      ...resourceParameters,
      ...statefulParameters,
    }
  }

  get defaultValues(): Partial<Record<keyof T, unknown>>  {
    if (!this.options.parameterOptions) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(this.options.parameterOptions)
        .filter(([, v]) => !(v instanceof TransformParameter || v instanceof StatefulParameter) )
        .filter((config) => (config[1] as ResourceParameterOptions).defaultValue !== undefined)
        .map((config) => [config[0], (config[1] as ResourceParameterOptions).defaultValue])
    ) as Partial<Record<keyof T, unknown>>;
  }
}
