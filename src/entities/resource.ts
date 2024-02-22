import { ParameterOperation, ResourceConfig, ResourceOperation } from 'codify-schemas';
import { ChangeSet, ParameterChange } from './change-set';
import { Plan } from './plan';
import { StatefulParameter } from './stateful-parameter';

export abstract class Resource<T extends ResourceConfig> {

  private statefulParameters: Map<string, StatefulParameter<T, keyof T>> = new Map();

  constructor(
    private dependencies: Resource<any>[] = [],
  ) {}

  abstract getTypeId(): string;

  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Calculate change set from current config -> state -> desired in the future
  async plan(desiredConfig: T): Promise<Plan<T>> {
    await this.validate(desiredConfig);

    const currentConfig = await this.getCurrentConfig(desiredConfig);
    if (!currentConfig) {
      return Plan.create(ChangeSet.createForNullCurrentConfig(desiredConfig), desiredConfig);
    }

    // Fetch the status of stateful parameters separately
    for(const statefulParameter of this.statefulParameters.values()) {
      const parameterCurrentStatus = await statefulParameter.getCurrent();
      if (parameterCurrentStatus) {
        currentConfig[statefulParameter.name] = parameterCurrentStatus;
      }
    }

    // TODO: After adding in state files, need to calculate deletes here
    //  Where current config exists and state config exists but desired config doesn't

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to the subclass to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(currentConfig, desiredConfig);
    const resourceOperation = parameterChangeSet
      .filter((change) => change.operation !== ParameterOperation.NOOP)
      .reduce((operation: ResourceOperation, curr: ParameterChange) => {
        const newOperation = this.calculateOperation(curr);
        return ChangeSet.combineResourceOperations(operation, newOperation);
      }, ResourceOperation.NOOP);

    return Plan.create(
      new ChangeSet(resourceOperation, parameterChangeSet),
      desiredConfig
    );
  }

  async apply(plan: Plan<T>): Promise<void> {
    if (plan.getResourceType() !== this.getTypeId()) {
      throw new Error(`Internal error: Plan set to wrong resource during apply. Expected ${this.getTypeId()} but got: ${plan.getResourceType()}`);
    }

    switch (plan.changeSet.operation) {
      case ResourceOperation.MODIFY: {
        const parameterChanges = plan.changeSet.parameterChanges
          .filter((c) => c.operation !== ParameterOperation.NOOP);

        const statelessParameterChanges = parameterChanges.filter((pc) => !this.statefulParameters.has(pc.name))
        if (statelessParameterChanges.length > 0) {
          await this.applyModify(plan);
        }

        const statefulParameterChanges = parameterChanges.filter((pc) => this.statefulParameters.has(pc.name))
        for (const parameterChange of statefulParameterChanges) {
          const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
          switch (parameterChange.operation) {
            case ParameterOperation.ADD: {
              await statefulParameter.applyAdd(parameterChange, plan);
              break;
            }
            case ParameterOperation.MODIFY: {
              await statefulParameter.applyModify(parameterChange, plan);
              break;
            }
            case ParameterOperation.REMOVE: {
              await statefulParameter.applyRemove(parameterChange, plan);
              break;
            }
          }
        }

        return;
      }
      case ResourceOperation.CREATE: {
        await this.applyCreate(plan);
        const statefulParameterChanges = plan.changeSet.parameterChanges
          .filter((pc) => this.statefulParameters.has(pc.name))

        for (const parameterChange of statefulParameterChanges) {
          const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
          await statefulParameter.applyAdd(parameterChange, plan);
        }

        return;
      }
      case ResourceOperation.RECREATE: return this.applyRecreate(plan);
      case ResourceOperation.DESTROY: return this.applyDestroy(plan);
    }
  }

  protected registerStatefulParameter(parameter: StatefulParameter<T, keyof T>) {
    this.statefulParameters.set(parameter.name as string, parameter);
  }

  abstract validate(config: unknown): Promise<boolean>;

  abstract getCurrentConfig(desiredConfig: T): Promise<T | null>;

  abstract calculateOperation(change: ParameterChange): ResourceOperation.MODIFY | ResourceOperation.RECREATE;

  abstract applyCreate(plan: Plan<T>): Promise<void>;

  abstract applyModify(plan: Plan<T>): Promise<void>;

  abstract applyRecreate(plan: Plan<T>): Promise<void>;

  abstract applyDestroy(plan:Plan<T>): Promise<void>;
}
