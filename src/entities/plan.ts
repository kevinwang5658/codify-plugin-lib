import { ChangeSet } from './change-set';
import {
  PlanResponseData,
  ResourceConfig,
} from 'codify-schemas';
import { randomUUID } from 'crypto';

export class Plan<T extends ResourceConfig> {
  id: string;
  changeSet: ChangeSet;
  resourceConfig: T

  constructor(id: string, changeSet: ChangeSet, resourceConfig: T) {
    this.id = id;
    this.changeSet = changeSet;
    this.resourceConfig = resourceConfig;
  }

  static create<T extends ResourceConfig>(changeSet: ChangeSet, resourceConfig: T): Plan<T> {
    return new Plan(
      randomUUID(),
      changeSet,
      resourceConfig,
    )
  }

  getResourceType(): string {
    return this.resourceConfig.type;
  }

  toResponse(): PlanResponseData {
    return {
      planId: this.id,
      operation: this.changeSet.operation,
      resourceName: this.resourceConfig.name,
      resourceType: this.resourceConfig.type,
      parameters: this.changeSet.parameterChanges,
    }
  }
}
