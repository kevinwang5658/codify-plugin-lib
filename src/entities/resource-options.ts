import { StringIndexedObject } from 'codify-schemas';
import { StatefulParameter } from './stateful-parameter.js';
import { TransformParameter } from './transform-parameter.js';
import { ResourceParameterOptions } from './resource-types.js';
import { ParameterConfiguration } from './plan-types.js';

export interface ResourceOptions<T extends StringIndexedObject> {
  type: string;
  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,
  dependencies?: string[];
  parameters?: Partial<Record<keyof T,
    ResourceParameterOptions
    | StatefulParameter<T, T[keyof T]>
    | TransformParameter<T>
  >>
}

export class ResourceOptions<T extends StringIndexedObject> {
  readonly typeId: string;
  readonly raw: ResourceOptions<T>;

  readonly statefulParameters: Map<keyof T, ParameterConfiguration>;
  readonly transformParameters: Map<keyof T, ParameterConfiguration>;
  readonly resourceParameters: Map<keyof T, ResourceParameterOptions>;
  readonly defaultValues: Partial<Record<keyof T, unknown>>
  readonly changeSetParameterOptions: Record<keyof T, ParameterConfiguration>;


  constructor(options: ResourceOptions<T>) {
    this.typeId = options.type;
    this.raw = options;

    this.statefulParameters = this.parseStatefulParameters(options);
    this.transformParameters = this.parseTransformParameters(options);
    this.resourceParameters = this.parseResourceParameters(options);
    this.defaultValues = this.parseDefaultValues(options);

    this.changeSetParameterOptions = this.calculateChangeSetParameterOptions();
  }

  private parseStatefulParameters(options: ResourceOptions<T>): any {
    const statefulParameters =
      Object.entries(this.parameters ?? {})
      .filter(([, v]) => v instanceof StatefulParameter)

    return new Map(statefulParameters);
  }

  private parseTransformParameters(options: ResourceOptions<T>): any {
    const transformParameters =
      Object.entries(this.parameters ?? {})
        .filter(([, v]) => v instanceof TransformParameter)

    return new Map(transformParameters);
  }

  private parseResourceParameters(options: ResourceOptions<T>): any {
    const resourceParameters =
      Object.entries(this.parameters ?? {})
        .filter(([, v]) => !(v instanceof TransformParameter || v instanceof StatefulParameter))

    return new Map(resourceParameters);
  }


  private calculateChangeSetParameterOptions(
  ): Record<keyof T, ParameterConfiguration>  {
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
      }, {} as Record<keyof T, ParameterConfiguration>)

    return {
      ...resourceParameters,
      ...statefulParameters,
    }
  }

  private parseDefaultValues(
    options: ResourceOptions<T>
  ): Partial<Record<keyof T, unknown>>  {
    if (!options.parameters) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(options.parameters)
        .filter(([, v]) => !(v instanceof TransformParameter || v instanceof StatefulParameter) )
        .filter((config) => (config[1] as ResourceParameterOptions).defaultValue !== undefined)
        .map((config) => [config[0], (config[1] as ResourceParameterOptions).defaultValue])
    ) as Partial<Record<keyof T, unknown>>;
  }
}
