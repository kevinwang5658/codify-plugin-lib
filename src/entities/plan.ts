import { ChangeSet } from './change-set';
import {
  PlanResponseData,
  ResourceConfig,
} from '../../../../codify/codify-schemas';
import { randomUUID } from 'crypto';

export class Plan {
  id: string;
  changeSet: ChangeSet;
  resourceConfig: ResourceConfig

  constructor(id: string, changeSet: ChangeSet, resourceConfig: ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.resourceConfig = resourceConfig;
  }

  static create(changeSet: ChangeSet, resourceConfig: ResourceConfig) {
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
      parameters: [],
      // TODO: Need to calculate this based on resourceConfig and changeSet
      //  It should include the union of both sets of parameters
    }
  }
}
