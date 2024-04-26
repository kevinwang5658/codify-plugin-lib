import { ChangeSet, ParameterChange } from './change-set.js';
import {
  ApplyRequestData,
  ParameterOperation,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
} from 'codify-schemas';
import { randomUUID } from 'crypto';
import { PlanConfiguration } from './plan-types.js';

export class Plan<T> {
  id: string;
  changeSet: ChangeSet;
  desiredConfig: Partial<T> & ResourceConfig;

  constructor(id: string, changeSet: ChangeSet, desiredConfig: Partial<T> & ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.desiredConfig = desiredConfig;
  }

  static create<T>(
    desiredConfig: Partial<T> & ResourceConfig,
    currentConfig: Partial<T> & ResourceConfig | null,
    configuration: PlanConfiguration
  ): Plan<T> {
    const { parameterConfigurations } = configuration;
    const statefulParameterNames = new Set(
      [...Object.entries(parameterConfigurations)]
        .filter(([k, v]) => v.isStatefulParameter)
        .map(([k, v]) => k)
    );

    // TODO: After adding in state files, need to calculate deletes here
    //  Where current config exists and state config exists but desired config doesn't

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to ChangeSet to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(
      desiredConfig,
      currentConfig,
      { statefulMode: configuration.statefulMode }
    );

    const resourceOperation = parameterChangeSet
      .filter((change) => change.operation !== ParameterOperation.NOOP)
      .reduce((operation: ResourceOperation, curr: ParameterChange) => {
        let newOperation: ResourceOperation;
        if (statefulParameterNames.has(curr.name)) {
          newOperation = ResourceOperation.MODIFY // All stateful parameters are modify only
        } else if (parameterConfigurations[curr.name]?.planOperation) {
          newOperation = parameterConfigurations[curr.name].planOperation!;
        } else {
          newOperation = ResourceOperation.RECREATE; // Default to Re-create. Should handle the majority of use cases
        }

        return ChangeSet.combineResourceOperations(operation, newOperation);
      }, ResourceOperation.NOOP);

    return new Plan(
      randomUUID(),
      new ChangeSet(resourceOperation, parameterChangeSet),
      desiredConfig
    );
  }

  getResourceType(): string {
    return this.desiredConfig.type;
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
      resourceName: this.desiredConfig.name,
      resourceType: this.desiredConfig.type,
      parameters: this.changeSet.parameterChanges,
    }
  }
}
