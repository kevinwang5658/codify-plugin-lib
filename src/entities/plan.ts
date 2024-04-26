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
import { splitUserConfig } from '../utils/utils.js';

export class Plan {
  id: string;
  changeSet: ChangeSet;
  resourceMetadata: ResourceConfig

  constructor(id: string, changeSet: ChangeSet, resourceMetadata: ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.resourceMetadata = resourceMetadata;
  }

  static create(
    desiredConfig: ResourceConfig,
    currentConfig: ResourceConfig | null,
    configuration: PlanConfiguration
  ): Plan {
    const parameterConfigurations = configuration.parameterConfigurations ?? {};
    const statefulParameterNames = new Set(
      [...Object.entries(parameterConfigurations)]
        .filter(([k, v]) => v.isStatefulParameter)
        .map(([k, v]) => k)
    );

    const { resourceMetadata, parameters: desiredParameters } = splitUserConfig(desiredConfig);
    const { parameters: currentParameters } = currentConfig ? splitUserConfig(currentConfig) : { parameters: {} };


    // TODO: After adding in state files, need to calculate deletes here
    //  Where current config exists and state config exists but desired config doesn't

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to ChangeSet to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(
      desiredParameters,
      currentParameters,
      { statefulMode: configuration.statefulMode }
    );

    let resourceOperation: ResourceOperation;
    if (!currentConfig && desiredConfig) {
      resourceOperation = ResourceOperation.CREATE;
    } else if (currentConfig && !desiredConfig) {
      resourceOperation = ResourceOperation.DESTROY;
    } else {
      resourceOperation = parameterChangeSet
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
    }

    return new Plan(
      randomUUID(),
      new ChangeSet(resourceOperation, parameterChangeSet),
      resourceMetadata,
    );
  }

  getResourceType(): string {
    return this.resourceMetadata.type
  }

  static fromResponse(data: ApplyRequestData['plan']): Plan {
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

  get desiredConfig(): ResourceConfig {
    return {
      ...this.resourceMetadata,
      ...this.changeSet.desiredParameters,
    }
  }

  get currentConfig(): ResourceConfig {
    return {
      ...this.resourceMetadata,
      ...this.changeSet.currentParameters,
    }
  }

  toResponse(): PlanResponseData {
    return {
      planId: this.id,
      operation: this.changeSet.operation,
      resourceName: this.resourceMetadata.name,
      resourceType: this.resourceMetadata.type,
      parameters: this.changeSet.parameterChanges,
    }
  }
}
