import { StringIndexedObject } from 'codify-schemas';
import { StatefulParameter } from './stateful-parameter.js';
import { TransformParameter } from './transform-parameter.js';
import { ResourceParameterOptions } from './resource-types.js';
import { ParameterOptions } from './plan-types.js';

export interface ResourceOptions<T extends StringIndexedObject> {

  /**
   * The id of the resource.
   */
  type: string;

  /**
   * Schema to validate user configs with. Must be in the format JSON Schema 2020-12
   */
  schema?: JSON

  /**
   * If true, statefulParameter.applyRemove() will be called before resource destruction.
   * Defaults to false.
   */
  callStatefulParameterRemoveOnDestroy?: boolean,

  /**
   * An array of type ids of resources that this resource depends on. This affects the order in which the resources are
   * planned and applied.
   */
  dependencies?: string[];

  /**
   * Additional options for configuring parameters.
   */
  parameterOptions?: Partial<Record<keyof T,
    ResourceParameterOptions
    | ResourceStatefulParameterOptions<T>
    | ResourceTransformParameterOptions<T>
  >>
}

export interface ResourceStatefulParameterOptions<T extends StringIndexedObject> {
  statefulParameter: StatefulParameter<T, T[keyof T]>;
  order?: number;
}

export interface ResourceTransformParameterOptions<T extends StringIndexedObject> {
  transformParameter: TransformParameter<T>;
  order?: number;
}

export class ResourceOptionsParser<T extends StringIndexedObject> {
  private options: ResourceOptions<T>;

  constructor(options: ResourceOptions<T>) {
    this.options = options;
  }

  get statefulParameters(): Map<keyof T, StatefulParameter<T, T[keyof T]>> {
    const statefulParameters = Object.entries(this.options.parameterOptions ?? {})
        .filter(([, p]) => p?.hasOwnProperty('statefulParameter'))
        .map(([k, v]) => [k, v as ResourceStatefulParameterOptions<T>] as const)
        .map(([k, v]) => [k, v.statefulParameter] as const)

    return new Map(statefulParameters);
  }

  get transformParameters(): Map<keyof T, TransformParameter<T>> {
    const transformParameters =
      Object.entries(this.options.parameterOptions ?? {})
        .filter(([, p]) => p?.hasOwnProperty('transformParameter'))
        .map(([k, v]) => [k, v as ResourceTransformParameterOptions<T>] as const)
        .map(([k, v]) => [k, v.transformParameter] as const)

    return new Map(transformParameters);
  }

  get resourceParameters(): Map<keyof T, ResourceParameterOptions> {
    const resourceParameters =
      Object.entries(this.options.parameterOptions ?? {})
        .filter(([, p]) => !(p?.hasOwnProperty('statefulParameter') || p?.hasOwnProperty('transformParameter')))
        .map(([k, v]) => [k, v as ResourceParameterOptions] as const)

    return new Map(resourceParameters);
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
            ...sp[1].options,
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
      [...this.resourceParameters.entries()]
        .filter(([, rp]) => rp.defaultValue !== undefined)
        .map(([name, rp]) => [name, rp.defaultValue])
    ) as Partial<Record<keyof T, unknown>>;
  }

  get statefulParameterOrder(): Map<keyof T, number> {
    const entries = Object.entries(this.options.parameterOptions ?? {})
      .filter(([, v]) => v?.hasOwnProperty('statefulParameter'))
      .map(([k, v]) => [k, v as ResourceStatefulParameterOptions<T>] as const)

    const orderedEntries = entries.filter(([, v]) => v.order !== undefined)
    const unorderedEntries = entries.filter(([, v]) => v.order === undefined)

    orderedEntries.sort((a, b) => a[1].order! - b[1].order!);

    const resultArray = [
      ...orderedEntries.map(([k]) => k),
      ...unorderedEntries.map(([k]) => k)
    ]

    return new Map(resultArray.map((key, idx) => [key, idx]));
  }

  get transformParameterOrder(): Map<keyof T, number> {
    const entries = Object.entries(this.options.parameterOptions ?? {})
      .filter(([, v]) => v?.hasOwnProperty('transformParameter'))
      .map(([k, v]) => [k, v as ResourceTransformParameterOptions<T>] as const)

    const orderedEntries = entries.filter(([, v]) => v.order !== undefined)
    const unorderedEntries = entries.filter(([, v]) => v.order === undefined)

    orderedEntries.sort((a, b) => a[1].order! - b[1].order!);

    const resultArray = [
      ...orderedEntries.map(([k]) => k),
      ...unorderedEntries.map(([k]) => k)
    ]

    return new Map(resultArray.map((key, idx) => [key, idx]));
  }
}
