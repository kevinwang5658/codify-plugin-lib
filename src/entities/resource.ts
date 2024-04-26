import { ParameterOperation, ResourceConfig, ResourceOperation, StringIndexedObject, } from 'codify-schemas';
import { ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { StatefulParameter } from './stateful-parameter.js';
import { ResourceConfiguration, ValidationResult } from './resource-types.js';
import { setsEqual, splitUserConfig } from '../utils/utils.js';
import { ParameterConfiguration, PlanConfiguration } from './plan-types.js';

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
  readonly dependencies: Resource<any>[]; // TODO: Change this to a string
  readonly parameterConfigurations: Record<string, ParameterConfiguration>

  private readonly options: ResourceConfiguration<T>;

  protected constructor(configuration: ResourceConfiguration<T>) {
    this.validateResourceConfiguration(configuration);

    this.typeId = configuration.type;
    this.statefulParameters = new Map(configuration.statefulParameters?.map((sp) => [sp.name, sp]));
    this.parameterConfigurations = this.generateParameterConfigurations(configuration);

    this.dependencies = configuration.dependencies ?? [];
    this.options = configuration;
  }

  getDependencyTypeIds(): string[] {
    return this.dependencies.map((d) => d.typeId)
  }

  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Currently only calculating how to add things to reach desired state. Can't delete resources.
  //  Add previousConfig as a parameter for plan(desired, previous);
  async plan(desiredConfig: Partial<T> & ResourceConfig): Promise<Plan<T>> {

    // Explanation: these are settings for how the plan will be generated
    const planConfiguration: PlanConfiguration = {
      statefulMode: false,
      parameterConfigurations: this.parameterConfigurations,
    }

    const { resourceMetadata, parameters: desiredParameters } = splitUserConfig(desiredConfig);

    // Refresh resource parameters
    // This refreshes the parameters that configure the resource itself

    const resourceParameters = Object.fromEntries([
      ...Object.entries(desiredParameters).filter(([key]) => !this.statefulParameters.has(key)),
    ]) as Partial<T>;

    const keysToRefresh = new Set(Object.keys(resourceParameters));
    const currentParameters = await this.refresh(keysToRefresh);
    if (!currentParameters) {
      return Plan.create(desiredConfig, null, planConfiguration);
    }

    this.validateRefreshResults(currentParameters, keysToRefresh);

    // Refresh stateful parameters
    // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)

    const statefulParameters = [...this.statefulParameters.values()]
      .filter((sp) => desiredParameters[sp.name] !== undefined) // Checking for undefined is fine here because JSONs can only have null.

    for(const statefulParameter of statefulParameters) {
      currentParameters[statefulParameter.name] = await statefulParameter.refresh(
        desiredParameters[statefulParameter.name] ?? null
      ) ?? undefined;
    }

    return Plan.create(
      desiredConfig,
      { ...currentParameters, ...resourceMetadata } as Partial<T> & ResourceConfig,
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
    if (this.options.callStatefulParameterRemoveOnDestroy) {
      const statefulParameterChanges = plan.changeSet.parameterChanges
        .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.applyDestroy(plan);
  }

  private generateParameterConfigurations(
    resourceConfiguration: ResourceConfiguration<T>
  ): Record<string, ParameterConfiguration>  {
    const resourceParameters: Record<string, ParameterConfiguration> = Object.fromEntries(
      Object.entries(resourceConfiguration.parameterConfigurations ?? {})
        ?.map(([name, value]) => ([name, { ...value, isStatefulParameter: false }]))
    )

    const statefulParameters: Record<string, ParameterConfiguration> = resourceConfiguration.statefulParameters
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

  private validateResourceConfiguration(data: ResourceConfiguration<T>) {
    // A parameter cannot be both stateful and stateless
    if (data.parameterConfigurations && data.statefulParameters) {
      const parameters = [...Object.keys(data.parameterConfigurations)];
      const statefulParameterSet = new Set(Object.keys(data.statefulParameters));

      const intersection = parameters.some((p) => statefulParameterSet.has(p));
      if (intersection) {
        throw new Error(`Resource ${this.typeId} cannot declare a parameter as both stateful and non-stateful`);
      }
    }
  }

  private validateRefreshResults(refresh: Partial<T>, desiredKeys: Set<keyof T>) {
    const refreshKeys = new Set(Object.keys(refresh)) as Set<keyof T>;

    if (!setsEqual(desiredKeys, refreshKeys)) {
      throw new Error(
        `Resource ${this.options.type}
refresh() must return back exactly the keys that were provided
Missing: ${[...desiredKeys].filter((k) => !refreshKeys.has(k))};
Additional: ${[...refreshKeys].filter(k => !desiredKeys.has(k))};`
      );
    }
  }

  abstract validate(config: unknown): Promise<ValidationResult>;

  abstract refresh(keys: Set<keyof T>): Promise<Partial<T> | null>;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  async applyModify(parameterName: keyof T, newValue: unknown, previousValue: unknown, allowDeletes: boolean, plan: Plan<T>): Promise<void> {};

  abstract applyDestroy(plan: Plan<T>): Promise<void>;
}
