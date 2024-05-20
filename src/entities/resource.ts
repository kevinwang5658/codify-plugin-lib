import { ParameterOperation, ResourceConfig, ResourceOperation, StringIndexedObject, } from 'codify-schemas';
import { ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { StatefulParameter } from './stateful-parameter.js';
import { ResourceConfiguration, ValidationResult } from './resource-types.js';
import { setsEqual, splitUserConfig } from '../utils/utils.js';
import { ParameterConfiguration, PlanConfiguration } from './plan-types.js';
import { TransformParameter } from './transform-parameter.js';

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
  readonly dependencies: string[]; // TODO: Change this to a string
  readonly parameterConfigurations: Record<keyof T, ParameterConfiguration>
  readonly configuration: ResourceConfiguration<T>;
  readonly defaultValues: Partial<Record<keyof T, unknown>>;

  protected constructor(configuration: ResourceConfiguration<T>) {
    this.validateResourceConfiguration(configuration);

    this.typeId = configuration.type;
    this.statefulParameters = new Map(configuration.statefulParameters?.map((sp) => [sp.name, sp]));
    this.transformParameters = new Map(Object.entries(configuration.transformParameters ?? {})) as Map<keyof T, TransformParameter<T>>;
    this.parameterConfigurations = this.initializeParameterConfigurations(configuration);
    this.defaultValues = this.initializeDefaultValues(configuration);

    this.dependencies = configuration.dependencies ?? [];
    this.configuration = configuration;
  }

  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Currently only calculating how to add things to reach desired state. Can't delete resources.
  //  Add previousConfig as a parameter for plan(desired, previous);
  async plan(desiredConfig: Partial<T> & ResourceConfig): Promise<Plan<T>> {

    // Explanation: these are settings for how the plan will be generated
    const planConfiguration: PlanConfiguration<T> = {
      statefulMode: false,
      parameterConfigurations: this.parameterConfigurations,
    }

    const { resourceMetadata, parameters: desiredParameters } = splitUserConfig(desiredConfig);

    this.addDefaultValues(desiredParameters);
    await this.applyTransformParameters(desiredParameters);

    const resourceParameters = Object.fromEntries([
      ...Object.entries(desiredParameters).filter(([key]) => !this.statefulParameters.has(key)),
    ]) as Partial<T>;

    const statefulParameters = [...this.statefulParameters.values()]
      .filter((sp) => desiredParameters[sp.name] !== undefined) // Checking for undefined is fine here because JSONs can only have null.

    // Refresh resource parameters
    // This refreshes the parameters that configure the resource itself
    const entriesToRefresh = new Map(Object.entries(resourceParameters));
    const currentParameters = await this.refresh(entriesToRefresh);

    // Short circuit here. If resource is non-existent, then there's no point checking stateful parameters
    if (currentParameters == null) {
      return Plan.create(desiredParameters, null, resourceMetadata, planConfiguration);
    }

    this.validateRefreshResults(currentParameters, entriesToRefresh);

    // Refresh stateful parameters
    // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)
    for(const statefulParameter of statefulParameters) {
      const desiredValue = desiredParameters[statefulParameter.name];

      let currentValue = await statefulParameter.refresh(desiredValue ?? null) ?? undefined;

      // In stateless mode, filter the refreshed parameters by the desired to ensure that no deletes happen
      if (Array.isArray(currentValue)
        && Array.isArray(desiredValue)
        && !planConfiguration.statefulMode
        && !statefulParameter.configuration.disableStatelessModeArrayFiltering
      ) {
        currentValue = currentValue.filter((c) => desiredValue?.some((d) => {
          const pc = planConfiguration?.parameterConfigurations?.[statefulParameter.name];
          if (pc && pc.isElementEqual) {
            return pc.isElementEqual(d, c);
          }
          return d === c;
        })) as any;
      }

      currentParameters[statefulParameter.name] = currentValue;
    }

    return Plan.create(
      desiredParameters,
      currentParameters as Partial<T>,
      resourceMetadata,
      planConfiguration,
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
    if (this.configuration.callStatefulParameterRemoveOnDestroy) {
      const statefulParameterChanges = plan.changeSet.parameterChanges
        .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.applyDestroy(plan);
  }

  private initializeParameterConfigurations(
    resourceConfiguration: ResourceConfiguration<T>
  ): Record<keyof T, ParameterConfiguration>  {
    const resourceParameters = Object.fromEntries(
      Object.entries(resourceConfiguration.parameterConfigurations ?? {})
        ?.map(([name, value]) => ([name, { ...value, isStatefulParameter: false }]))
    ) as Record<keyof T, ParameterConfiguration>

    const statefulParameters = resourceConfiguration.statefulParameters
      ?.reduce((obj, sp) => {
        return {
          ...obj,
          [sp.name]: {
            ...sp.configuration,
            isStatefulParameter: true,
          }
        }
      }, {}) ?? {}

    return {
      ...resourceParameters,
      ...statefulParameters,
    }
  }

  private initializeDefaultValues(
    resourceConfiguration: ResourceConfiguration<T>
  ): Partial<Record<keyof T, unknown>>  {
    if (!resourceConfiguration.parameterConfigurations) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(resourceConfiguration.parameterConfigurations)
        .filter((p) => p[1]?.defaultValue !== undefined)
        .map((config) => [config[0], config[1]!.defaultValue])
    ) as Partial<Record<keyof T, unknown>>;
  }

  private validateResourceConfiguration(data: ResourceConfiguration<T>) {
    // Stateful parameters are configured within the object not in the resource.
    if (data.parameterConfigurations && data.statefulParameters) {
      const parameters = [...Object.keys(data.parameterConfigurations)];
      const statefulParameterSet = new Set(data.statefulParameters.map((sp) => sp.name));

      const intersection = parameters.some((p) => statefulParameterSet.has(p));
      if (intersection) {
        throw new Error(`Resource ${this.typeId} cannot declare a parameter as both stateful and non-stateful`);
      }
    }
  }

  private validateRefreshResults(refresh: Partial<T> | null, desiredMap: Map<keyof T, T[keyof T]>) {
    if (!refresh) {
      return;
    }

    const desiredKeys = new Set<keyof T>(desiredMap.keys());
    const refreshKeys = new Set(Object.keys(refresh)) as Set<keyof T>;

    if (!setsEqual(desiredKeys, refreshKeys)) {
      throw new Error(
        `Resource ${this.configuration.type}
refresh() must return back exactly the keys that were provided
Missing: ${[...desiredKeys].filter((k) => !refreshKeys.has(k))};
Additional: ${[...refreshKeys].filter(k => !desiredKeys.has(k))};`
      );
    }
  }

  private async applyTransformParameters(desired: Partial<T>): Promise<void> {
    for (const [key, tp] of this.transformParameters.entries()) {
      if (desired[key] !== null) {
        const transformedValue = await tp.transform(desired[key]);

        if (Object.keys(transformedValue).some((k) => desired[k] !== undefined)) {
          throw new Error(`Transform parameter ${key as string} is attempting to override existing value ${desired[key]}`);
        }

        Object.entries(transformedValue).forEach(([tvKey, tvValue]) => {
          // @ts-ignore
          desired[tvKey] = tvValue;
        })

        delete desired[key];
      }
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

  abstract validate(parameters: unknown): Promise<ValidationResult>;

  abstract refresh(keys: Map<keyof T, T[keyof T]>): Promise<Partial<T> | null>;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  async applyModify(parameterName: keyof T, newValue: unknown, previousValue: unknown, allowDeletes: boolean, plan: Plan<T>): Promise<void> {};

  abstract applyDestroy(plan: Plan<T>): Promise<void>;
}
