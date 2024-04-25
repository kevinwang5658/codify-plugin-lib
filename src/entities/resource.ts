import { ParameterOperation, ResourceConfig, ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { ChangeSet, ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { StatefulParameter } from './stateful-parameter.js';
import { ErrorMessage, ResourceConfiguration } from './resource-types.js';
import { splitUserConfig } from '../utils/utils.js';

/**
 * Description of resource here
 * Two main functions:
 * - Plan
 * - Apply
 *
 */
export abstract class Resource<T extends StringIndexedObject> {

  readonly typeId: string;
  readonly statefulParameters: Map<string, StatefulParameter<T, keyof T>>;
  readonly dependencies: Resource<any>[]; // TODO: Change this to a string

  private readonly options: ResourceConfiguration<T>;

  protected constructor(configuration: ResourceConfiguration<T>) {
    this.validateResourceConfiguration(configuration);

    this.typeId = configuration.name;
    this.statefulParameters = new Map(Object.entries(/*config.statefulParameters ?? */{}));
    this.dependencies = configuration.dependencies ?? [];
    this.options = configuration;
  }

  getDependencyTypeIds(): string[] {
    return this.dependencies.map((d) => d.typeId)
  }

  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Calculate change set from current config -> state -> desired in the future
  //  Currently only calculating how to add things to reach desired state. Can't delete resources.
  async plan(desiredConfig: T & ResourceConfig): Promise<Plan<T>> {
    const { resourceMetadata, parameters: desiredParameters } = splitUserConfig(desiredConfig);

    const currentParameters = await this.getCurrent(desiredParameters);
    if (!currentParameters) {
      return Plan.create(ChangeSet.newCreate(desiredConfig), desiredConfig);
    }

    // Check that the config doesn't contain any stateful parameters
    if (Object.keys(currentParameters).some((k) => this.statefulParameters.has(k))) {
      throw new Error(`Resource ${this.typeId} is returning stateful parameters in getCurrentConfig`);
    }

    // Fetch the status of stateful parameters separately
    const statefulParameters = [...this.statefulParameters.values()]
      .filter((sp) => desiredParameters[sp.name] !== undefined)

    for(const statefulParameter of statefulParameters) {
      const parameterConfig = await statefulParameter.getCurrent(desiredParameters[statefulParameter.name]);
      if (parameterConfig) {
        currentParameters[statefulParameter.name] = parameterConfig;
      }
    }

    return Plan.createNew(
      desiredConfig,
      { ...currentParameters, ...resourceMetadata },
    )

    // return Plan.create(
    //   new ChangeSet(resourceOperation, parameterChangeSet),
    //   desiredConfig
    // );
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
      .filter((pc: ParameterChange) => this.statefulParameters.has(pc.name))
    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
      await statefulParameter.applyAdd(parameterChange.newValue, plan);
    }
  }

  private async _applyModify(plan: Plan<T>): Promise<void> {
    const parameterChanges = plan
      .changeSet
      .parameterChanges
      .filter((c: ParameterChange) => c.operation !== ParameterOperation.NOOP);

    const statelessParameterChanges = parameterChanges
      .filter((pc: ParameterChange) => !this.statefulParameters.has(pc.name))
    for (const pc of statelessParameterChanges) {
      await this.applyModify(pc.name, pc.newValue, pc.previousValue, plan);
    }

    const statefulParameterChanges = parameterChanges
      .filter((pc: ParameterChange) => this.statefulParameters.has(pc.name))
    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;

      switch (parameterChange.operation) {
        case ParameterOperation.ADD: {
          await statefulParameter.applyAdd(parameterChange.newValue, plan);
          break;
        }
        case ParameterOperation.MODIFY: {
          await statefulParameter.applyModify(parameterChange.newValue, parameterChange.previousValue, plan);
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
        .filter((pc: ParameterChange) => this.statefulParameters.has(pc.name))
      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.applyDestroy(plan);
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

  abstract validate(config: unknown): Promise<ErrorMessage[] | undefined>;

  abstract getCurrent(desiredConfig: T): Promise<T | null>;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  abstract applyModify(parameterName: string, newValue: unknown, previousValue: unknown, plan: Plan<T>): Promise<void>;

  abstract applyDestroy(plan:Plan<T>): Promise<void>;
}
