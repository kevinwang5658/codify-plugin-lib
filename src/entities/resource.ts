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

  protected constructor(config: ResourceConfiguration<T>) {
    this.validateConstructorParams(config);

    this.typeId = config.name;
    this.statefulParameters = new Map(Object.entries(/*config.statefulParameters ?? */{}));
    this.dependencies = config.dependencies ?? [];
    this.options = config;
  }

  getDependencyTypeIds(): string[] {
    return this.dependencies.map((d) => d.typeId)
  }

  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Calculate change set from current config -> state -> desired in the future
  //  Currently only calculating how to add things to reach desired state. Can't delete resources.
  async plan(desiredConfig: T & ResourceConfig): Promise<Plan<T>> {
    const { resourceInfo, parameters } = splitUserConfig(desiredConfig);

    const currentConfig = await this.getCurrentConfig(parameters);
    if (!currentConfig) {
      return Plan.create(ChangeSet.newCreate(desiredConfig), desiredConfig);
    }

    // Check that the config doesn't contain any stateful parameters
    if (Object.keys(currentConfig).some((k) => this.statefulParameters.has(k))) {
      throw new Error(`Resource ${this.typeId} is returning stateful parameters in getCurrentConfig`);
    }

    // Fetch the status of stateful parameters separately
    const statefulParameters = [...this.statefulParameters.values()]
      .filter((sp) => parameters[sp.name] !== undefined)

    for(const statefulParameter of statefulParameters) {
      const parameterConfig = await statefulParameter.getCurrent(parameters[statefulParameter.name]);
      if (parameterConfig) {
        currentConfig[statefulParameter.name] = parameterConfig;
      }
    }

    // TODO: After adding in state files, need to calculate deletes here
    //  Where current config exists and state config exists but desired config doesn't

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to ChangeSet to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(currentConfig, parameters, { statefulMode: false }); // TODO: Change this in the future for stateful mode
    const resourceOperation = parameterChangeSet
      .filter((change) => change.operation !== ParameterOperation.NOOP)
      .reduce((operation: ResourceOperation, curr: ParameterChange) => {
        let newOperation: ResourceOperation;
        if (this.statefulParameters.has(curr.name)) {
          newOperation = ResourceOperation.MODIFY // All stateful parameters are modify only
        } else if (this.options.parameterOptions?.[curr.name]?.planOperation !== undefined) {
          newOperation = this.options.parameterOptions?.[curr.name]?.planOperation!;
        } else {
          newOperation = ResourceOperation.RECREATE; // Re-create should handle the majority of use cases
        }

        return ChangeSet.combineResourceOperations(operation, newOperation);
      }, ResourceOperation.NOOP);

    return Plan.create(
      new ChangeSet(resourceOperation, parameterChangeSet),
      desiredConfig
    );
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

  private validateConstructorParams(data: ResourceConfiguration<T>) {
    // A parameter cannot be both stateful and stateless
    if (data.parameterOptions && data.statefulParameters) {
      const parameters = [...Object.keys(data.parameterOptions)];
      const statefulParameterSet = new Set(Object.keys(data.statefulParameters));

      const intersection = parameters.some((p) => statefulParameterSet.has(p));
      if (intersection) {
        throw new Error(`Resource ${this.typeId} cannot declare a parameter as both stateful and non-stateful`);
      }
    }
  }

  abstract validate(config: unknown): Promise<ErrorMessage[] | undefined>;

  abstract getCurrentConfig(desiredConfig: T): Promise<T | null>;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  abstract applyModify(parameterName: string, newValue: unknown, previousValue: unknown, plan: Plan<T>): Promise<void>;

  abstract applyDestroy(plan:Plan<T>): Promise<void>;
}
