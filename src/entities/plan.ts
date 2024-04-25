import { ChangeSet } from './change-set.js';
import { ApplyRequestData, PlanResponseData, ResourceConfig, } from 'codify-schemas';
import { randomUUID } from 'crypto';

export class Plan<T> {
  id: string;
  changeSet: ChangeSet;
  desiredParameters: T & ResourceConfig;

  constructor(id: string, changeSet: ChangeSet, resourceConfig: T & ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.desiredParameters = resourceConfig;
  }

  static create<T>(changeSet: ChangeSet, desiredConfig: T & ResourceConfig): Plan<T> {
    return new Plan(
      randomUUID(),
      changeSet,
      desiredConfig,
    )
  }

  // static create<T extends StringIndexedObject>(desiredConfig: T, currentConfig: T, resourceConfiguration: ResourceConfiguration<T>): Plan<T> {
  //   const { parameterOptions, statefulParameters } = resourceConfiguration;
  //
  //
  //   // Explanation: This calculates the change set of the parameters between the
  //   // two configs and then passes it to ChangeSet to calculate the overall
  //   // operation for the resource
  //   const parameterChangeSet = ChangeSet.calculateParameterChangeSet(currentConfig, desiredConfig, { statefulMode: false }); // TODO: Change this in the future for stateful mode
  //   const resourceOperation = parameterChangeSet
  //     .filter((change) => change.operation !== ParameterOperation.NOOP)
  //     .reduce((operation: ResourceOperation, curr: ParameterChange) => {
  //       let newOperation: ResourceOperation;
  //       if (statefulParameters.has(curr.name)) {
  //         newOperation = ResourceOperation.MODIFY // All stateful parameters are modify only
  //       } else if (parameterOptions?.[curr.name]?.planOperation !== undefined) {
  //         newOperation = parameterOptions?.[curr.name]?.planOperation!;
  //       } else {
  //         newOperation = ResourceOperation.RECREATE; // Re-create should handle the majority of use cases
  //       }
  //
  //       return ChangeSet.combineResourceOperations(operation, newOperation);
  //     }, ResourceOperation.NOOP);
  // }

  getResourceType(): string {
    return this.desiredParameters.type;
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
      resourceName: this.desiredParameters.name,
      resourceType: this.desiredParameters.type,
      parameters: this.changeSet.parameterChanges,
    }
  }
}
