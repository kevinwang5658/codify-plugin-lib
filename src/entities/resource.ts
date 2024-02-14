import { ParameterOperation, ResourceConfig, ResourceOperation } from 'codify-schemas';
import { ChangeSet, ParameterChange } from './change-set';
import { Plan } from './plan';

export abstract class Resource<T extends ResourceConfig> {
  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Calculate change set from current config -> state -> desired in the future
  async plan(desiredConfig: T): Promise<Plan> {
    await this.validate(desiredConfig);

    const currentConfig = await this.getCurrentConfig();
    if (!currentConfig) {
      return Plan.create(ChangeSet.createForNullCurrentConfig(desiredConfig), desiredConfig);
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

  async apply(plan: Plan): Promise<any> {
    if (plan.getResourceType()) {
      throw new Error('Internal error: Plan set to wrong resource during apply');
    }

    const changeSet = plan.changeSet;
    switch (plan.changeSet.operation) {
      case ResourceOperation.CREATE: return this.applyCreate(changeSet);
      case ResourceOperation.MODIFY: return this.applyModify(changeSet);
      case ResourceOperation.RECREATE: return this.applyRecreate(changeSet);
      case ResourceOperation.DESTROY: return this.applyDestroy(changeSet);
    }
  }

  abstract validate(config: ResourceConfig): Promise<boolean>;

  abstract getCurrentConfig(): Promise<T | null>;

  abstract calculateOperation(change: ParameterChange): ResourceOperation.MODIFY | ResourceOperation.RECREATE;

  abstract applyCreate(changeSet: ChangeSet): Promise<void>;

  abstract applyModify(changeSet: ChangeSet): Promise<void>;

  abstract applyRecreate(changeSet: ChangeSet): Promise<void>;

  abstract applyDestroy(changeSet: ChangeSet): Promise<void>;
}
