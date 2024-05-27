import { ParameterOperation, ResourceConfig, ResourceOperation, StringIndexedObject, } from 'codify-schemas';
import { ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { StatefulParameter } from './stateful-parameter.js';
import { ResourceParameterOptions, ValidationResult } from './resource-types.js';
import { setsEqual, splitUserConfig } from '../utils/utils.js';
import { ParameterOptions, PlanOptions } from './plan-types.js';
import { TransformParameter } from './transform-parameter.js';
import { ResourceOptions, ResourceOptionsParser } from './resource-options.js';
import Ajv from 'ajv';
import Ajv2020, { ValidateFunction } from 'ajv/dist/2020.js';

/**
 * Description of resource here
 * Two main functions:
 * - Plan
 * - Apply
 *
 */
export abstract class Resource<T extends StringIndexedObject> {
  readonly typeId: string;
  readonly statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>;
  readonly transformParameters: Map<keyof T, TransformParameter<T>>
  readonly resourceParameters: Map<keyof T, ResourceParameterOptions>;

  readonly statefulParameterOrder: Map<keyof T, number>;
  readonly transformParameterOrder: Map<keyof T, number>;

  readonly dependencies: string[]; // TODO: Change this to a string
  readonly parameterOptions: Record<keyof T, ParameterOptions>
  readonly options: ResourceOptions<T>;
  readonly defaultValues: Partial<Record<keyof T, unknown>>;

  protected ajv?: Ajv.default;
  protected schemaValidator?: ValidateFunction;

  protected constructor(options: ResourceOptions<T>) {
    this.typeId = options.type;
    this.dependencies = options.dependencies ?? [];
    this.options = options;

    if (this.options.schema) {
      this.ajv = new Ajv2020.default({
        strict: true,
        strictRequired: false,
      })
      this.schemaValidator = this.ajv.compile(this.options.schema);
    }

    const parser = new ResourceOptionsParser<T>(options);
    this.statefulParameters = parser.statefulParameters;
    this.transformParameters = parser.transformParameters;
    this.resourceParameters = parser.resourceParameters;
    this.parameterOptions = parser.changeSetParameterOptions;
    this.defaultValues = parser.defaultValues;
    this.statefulParameterOrder = parser.statefulParameterOrder;
    this.transformParameterOrder = parser.transformParameterOrder;
  }

  async onInitialize(): Promise<void> {}

  async validateResource(parameters: unknown): Promise<ValidationResult> {
    if (this.schemaValidator) {
      const isValid = this.schemaValidator(parameters);

      if (!isValid) {
        return {
          isValid: false,
          errors: this.schemaValidator?.errors ?? [],
        }
      }
    }

    return this.validate(parameters);
  }

  // TODO: Add state in later.
  //  Currently only calculating how to add things to reach desired state. Can't delete resources.
  //  Add previousConfig as a parameter for plan(desired, previous);
  async plan(desiredConfig: Partial<T> & ResourceConfig): Promise<Plan<T>> {
    const planOptions: PlanOptions<T> = {
      statefulMode: false,
      parameterOptions: this.parameterOptions,
    }

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(desiredConfig, this.statefulParameters, this.transformParameters)
    const {
      parameters: desiredParameters,
      resourceMetadata,
      resourceParameters,
      statefulParameters,
      transformParameters,
    } = parsedConfig;

    this.addDefaultValues(resourceParameters);
    await this.applyTransformParameters(transformParameters, resourceParameters);

    // Refresh resource parameters. This refreshes the parameters that configure the resource itself
    const currentParameters = await this.refreshResourceParameters(resourceParameters);

    // Short circuit here. If the resource is non-existent, there's no point checking stateful parameters
    if (currentParameters == null) {
      return Plan.create(desiredParameters, null, resourceMetadata, planOptions);
    }

    // Refresh stateful parameters. These parameters have state external to the resource
    const statefulCurrentParameters = await this.refreshStatefulParameters(statefulParameters, planOptions.statefulMode);

    return Plan.create(
      { ...resourceParameters, ...statefulParameters },
      { ...currentParameters, ...statefulCurrentParameters } as Partial<T>,
      resourceMetadata,
      planOptions,
    )
  }

  async apply(plan: Plan<T>): Promise<void> {
    if (plan.getResourceType() !== this.typeId) {
      throw new Error(`Internal error: Plan set to wrong resource during apply. Expected ${this.typeId} but got: ${plan.getResourceType()}`);
    }

    switch (plan.changeSet.operation) {
      case ResourceOperation.CREATE: {
        return this._applyCreate(plan); // TODO: Add new parameters value so that apply
      }
      case ResourceOperation.MODIFY: {
        return this._applyModify(plan);
      }
      case ResourceOperation.RECREATE: {
        await this._applyDestroy(plan);
        return this._applyCreate(plan);
      }
      case ResourceOperation.DESTROY: {
        return this._applyDestroy(plan);
      }
    }
  }

  private async _applyCreate(plan: Plan<T>): Promise<void> {
    await this.applyCreate(plan);

    const statefulParameterChanges = plan.changeSet.parameterChanges
      .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
      await statefulParameter.applyAdd(parameterChange.newValue, plan);
    }
  }

  private async _applyModify(plan: Plan<T>): Promise<void> {
    const parameterChanges = plan
      .changeSet
      .parameterChanges
      .filter((c: ParameterChange<T>) => c.operation !== ParameterOperation.NOOP);

    const statelessParameterChanges = parameterChanges
      .filter((pc: ParameterChange<T>) => !this.statefulParameters.has(pc.name))

    for (const pc of statelessParameterChanges) {
      // TODO: When stateful mode is added in the future. Dynamically choose if deletes are allowed
      await this.applyModify(pc.name, pc.newValue, pc.previousValue, false, plan);
    }

    const statefulParameterChanges = parameterChanges
      .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;

      switch (parameterChange.operation) {
        case ParameterOperation.ADD: {
          await statefulParameter.applyAdd(parameterChange.newValue, plan);
          break;
        }
        case ParameterOperation.MODIFY: {
          // TODO: When stateful mode is added in the future. Dynamically choose if deletes are allowed
          await statefulParameter.applyModify(parameterChange.newValue, parameterChange.previousValue, false, plan);
          break;
        }
        case ParameterOperation.REMOVE: {
          await statefulParameter.applyRemove(parameterChange.previousValue, plan);
          break;
        }
      }
    }
  }

  private async _applyDestroy(plan: Plan<T>): Promise<void> {
    // If this option is set (defaults to false), then stateful parameters need to be destroyed
    // as well. This means that the stateful parameter wouldn't have been normally destroyed with applyDestroy()
    if (this.options.callStatefulParameterRemoveOnDestroy) {
      const statefulParameterChanges = plan.changeSet.parameterChanges
        .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
        .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.applyDestroy(plan);
  }

  private validateRefreshResults(refresh: Partial<T> | null, desiredMap: Map<keyof T, T[keyof T]>) {
    if (!refresh) {
      return;
    }

    const desiredKeys = new Set<keyof T>(desiredMap.keys());
    const refreshKeys = new Set(Object.keys(refresh)) as Set<keyof T>;

    if (!setsEqual(desiredKeys, refreshKeys)) {
      throw new Error(
        `Resource ${this.typeId}
refresh() must return back exactly the keys that were provided
Missing: ${[...desiredKeys].filter((k) => !refreshKeys.has(k))};
Additional: ${[...refreshKeys].filter(k => !desiredKeys.has(k))};`
      );
    }
  }

  private async applyTransformParameters(transformParameters: Partial<T>, desired: Partial<T>): Promise<void> {
    const orderedEntries = [...Object.entries(transformParameters)]
      .sort(([keyA], [keyB]) => this.transformParameterOrder.get(keyA)! - this.transformParameterOrder.get(keyB)!)

    for (const [key, value] of orderedEntries) {
      const transformedValue = await this.transformParameters.get(key)!.transform(value);

      if (Object.keys(transformedValue).some((k) => desired[k] !== undefined)) {
        throw new Error(`Transform parameter ${key as string} is attempting to override existing values ${JSON.stringify(transformedValue, null, 2)}`);
      }

      Object.entries(transformedValue).forEach(([tvKey, tvValue]) => {
        // @ts-ignore
        desired[tvKey] = tvValue;
      })
    }
  }

  private addDefaultValues(desired: Partial<T>): void {
    Object.entries(this.defaultValues)
      .forEach(([key, defaultValue]) => {
        if (defaultValue !== undefined && desired[key as any] === undefined) {
          // @ts-ignore
          desired[key] = defaultValue;
        }
      });
  }

  private async refreshResourceParameters(resourceParameters: Partial<T>): Promise<Partial<T> | null> {
    const entriesToRefresh = new Map(Object.entries(resourceParameters));
    const currentParameters = await this.refresh(entriesToRefresh);

    this.validateRefreshResults(currentParameters, entriesToRefresh);
    return currentParameters;
  }

  // Refresh stateful parameters
  // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)
  private async refreshStatefulParameters(statefulParametersConfig: Partial<T>, isStatefulMode: boolean): Promise<Partial<T>> {
    const currentParameters: Partial<T> = {}
    const sortedEntries = Object.entries(statefulParametersConfig)
      .sort(([key1], [key2]) => this.statefulParameterOrder.get(key1)! - this.statefulParameterOrder.get(key2)!)

    for(const [key, desiredValue] of sortedEntries) {
      const statefulParameter = this.statefulParameters.get(key);
      if (!statefulParameter) {
        throw new Error(`Stateful parameter ${key} was not found`);
      }

      let currentValue = await statefulParameter.refresh(desiredValue ?? null);

      // In stateless mode, filter the refreshed parameters by the desired to ensure that no deletes happen
      // Otherwise the change set will pick up the extra keys from the current and try to delete them
      // This allows arrays within stateful parameters to be first class objects
      if (Array.isArray(currentValue)
        && Array.isArray(desiredValue)
        && !isStatefulMode
        && !statefulParameter.options.disableStatelessModeArrayFiltering
      ) {
        currentValue = currentValue.filter((c) => desiredValue?.some((d) => {
          const parameterOptions = statefulParameter.options as any;
          if (parameterOptions && parameterOptions.isElementEqual) {
            return parameterOptions.isElementEqual(d, c);
          }

          return d === c;
        })) as any;
      }

      // @ts-ignore
      currentParameters[key] = currentValue;
    }

    return currentParameters;
  }

  async validate(parameters: unknown): Promise<ValidationResult> {
    return {
      isValid: true,
    }
  };

  abstract refresh(keys: Map<keyof T, T[keyof T]>): Promise<Partial<T> | null>;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  async applyModify(parameterName: keyof T, newValue: unknown, previousValue: unknown, allowDeletes: boolean, plan: Plan<T>): Promise<void> {};

  abstract applyDestroy(plan: Plan<T>): Promise<void>;
}

class ConfigParser<T extends StringIndexedObject> {
  private config: Partial<T> & ResourceConfig;
  private statefulParametersMap: Map<keyof T, StatefulParameter<T, T[keyof T]>>;
  private transformParametersMap: Map<keyof T, TransformParameter<T>>;

  constructor(
    config: Partial<T> & ResourceConfig,
    statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>,
  transformParameters: Map<keyof T, TransformParameter<T>>,
  ) {
    this.config = config;
    this.statefulParametersMap = statefulParameters;
    this.transformParametersMap = transformParameters;
  }

  get resourceMetadata(): ResourceConfig {
    const { resourceMetadata } = splitUserConfig(this.config);
    return resourceMetadata;
  }

  get parameters(): Partial<T> {
    const { parameters } = splitUserConfig(this.config);
    return parameters;
  }

  get resourceParameters(): Partial<T> {
    const parameters = this.parameters;

    return Object.fromEntries([
      ...Object.entries(parameters).filter(([key]) => !(this.statefulParametersMap.has(key) || this.transformParametersMap.has(key))),
    ]) as Partial<T>;
  }

  get statefulParameters(): Partial<T> {
    const parameters = this.parameters;

    return Object.fromEntries([
      ...Object.entries(parameters).filter(([key]) => this.statefulParametersMap.has(key)),
    ]) as Partial<T>;
  }

  get transformParameters(): Partial<T> {
    const parameters = this.parameters;

    return Object.fromEntries([
      ...Object.entries(parameters).filter(([key]) => this.transformParametersMap.has(key)),
    ]) as Partial<T>;
  }
}
