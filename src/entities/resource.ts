import { ResourceConfig, ResourceOperation } from 'codify-schemas';
import { ChangeSet } from './change-set';
import { Plan } from './plan';

export abstract class Resource<T extends ResourceConfig> {
  async onInitialize(): Promise<void> {}

  // TODO: Add state in later.
  //  Calculate change set from current config -> state -> desired in the future
  async plan(desiredConfig: T): Promise<Plan> {
    await this.validate(desiredConfig);

    const currentConfig = await this.getCurrentConfig();
    const changeSet = await this.calculateChangeSet(currentConfig, desiredConfig);

    return Plan.create(changeSet, desiredConfig);
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

  abstract getCurrentConfig(): Promise<T>;

  abstract calculateChangeSet(prev: T, next: T): Promise<ChangeSet>;

  abstract applyCreate(changeSet: ChangeSet): Promise<void>;

  abstract applyModify(changeSet: ChangeSet): Promise<void>;

  abstract applyRecreate(changeSet: ChangeSet): Promise<void>;

  abstract applyDestroy(changeSet: ChangeSet): Promise<void>;
}
