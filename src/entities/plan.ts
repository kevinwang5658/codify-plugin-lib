import { ChangeSet } from './change-set.js';
import { ApplyRequestData, PlanResponseData, ResourceConfig, } from 'codify-schemas';
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

  static fromResponse(data: ApplyRequestData['plan']): Plan<ResourceConfig> {
    if (!data) {
      throw new Error('Data is empty');
    }

    return new Plan(
      randomUUID(),
      new ChangeSet(
        data.operation,
        data.parameters.map(value => ({
          ...value,
          previousValue: null,
        })),
      ),
      {
        type: data.resourceType,
        name: data.resourceName,
        ...(data.parameters.reduce(
          (prev, { name, newValue }) => Object.assign(prev, { [name]: newValue }),
          {}
        ))
      },
    );
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
