import { ChangeSet, ParameterChange } from './change-set.js';
import {
  ApplyRequestData,
  ParameterOperation,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
  StringIndexedObject,
} from 'codify-schemas';
import { randomUUID } from 'crypto';
import { ParameterOptions, PlanOptions } from './plan-types.js';

export class Plan<T extends StringIndexedObject> {
  id: string;
  changeSet: ChangeSet<T>;
  resourceMetadata: ResourceConfig

  constructor(id: string, changeSet: ChangeSet<T>, resourceMetadata: ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.resourceMetadata = resourceMetadata;
  }

  static create<T extends StringIndexedObject>(
    desiredParameters: Partial<T> | null,
    currentParameters: Partial<T> | null,
    resourceMetadata: ResourceConfig,
    options: PlanOptions<T>
  ): Plan<T> {
    const parameterOptions = options.parameterOptions ?? {} as Record<keyof T, ParameterOptions>;
    const statefulParameterNames = new Set(
      [...Object.entries(parameterOptions)]
        .filter(([k, v]) => v.isStatefulParameter)
        .map(([k, v]) => k)
    );

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to ChangeSet to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(
      desiredParameters,
      currentParameters,
      { statefulMode: options.statefulMode, parameterOptions }
    );

    let resourceOperation: ResourceOperation;
    if (!currentParameters && desiredParameters) {
      resourceOperation = ResourceOperation.CREATE;
    } else if (currentParameters && !desiredParameters) {
      resourceOperation = ResourceOperation.DESTROY;
    } else {
      resourceOperation = parameterChangeSet
        .filter((change) => change.operation !== ParameterOperation.NOOP)
        .reduce((operation: ResourceOperation, curr: ParameterChange<T>) => {
          let newOperation: ResourceOperation;
          if (statefulParameterNames.has(curr.name)) {
            newOperation = ResourceOperation.MODIFY // All stateful parameters are modify only
          } else if (parameterOptions[curr.name]?.planOperation) {
            newOperation = parameterOptions[curr.name].planOperation!;
          } else {
            newOperation = ResourceOperation.RECREATE; // Default to Re-create. Should handle the majority of use cases
          }
          return ChangeSet.combineResourceOperations(operation, newOperation);
        }, ResourceOperation.NOOP);
    }

    return new Plan(
      randomUUID(),
      new ChangeSet<T>(resourceOperation, parameterChangeSet),
      resourceMetadata,
    );
  }

  getResourceType(): string {
    return this.resourceMetadata.type
  }

  static fromResponse<T extends ResourceConfig>(data: ApplyRequestData['plan'], defaultValues: Partial<Record<keyof T, unknown>>): Plan<T> {
    if (!data) {
      throw new Error('Data is empty');
    }

    addDefaultValues();

    return new Plan(
      randomUUID(),
      new ChangeSet<T>(
        data.operation,
        data.parameters
      ),
      {
        type: data.resourceType,
        name: data.resourceName,
      },
    );

   function addDefaultValues(): void {
      Object.entries(defaultValues)
        .forEach(([key, defaultValue]) => {
          const configValueExists = data
            ?.parameters
            .find((p) => p.name === key) !== undefined;

          if (!configValueExists) {
            switch (data?.operation) {
              case ResourceOperation.CREATE: {
                data?.parameters.push({
                  name: key,
                  operation: ParameterOperation.ADD,
                  previousValue: null,
                  newValue: defaultValue,
                });
                break;
              }

              case ResourceOperation.DESTROY: {
                data?.parameters.push({
                  name: key,
                  operation: ParameterOperation.REMOVE,
                  previousValue: defaultValue,
                  newValue: null,
                });
                break;
              }

              case ResourceOperation.MODIFY:
              case ResourceOperation.RECREATE:
              case ResourceOperation.NOOP: {
                data?.parameters.push({
                  name: key,
                  operation: ParameterOperation.NOOP,
                  previousValue: defaultValue,
                  newValue: defaultValue,
                });
                break;
              }
            }
          }
        });
    }

  }

  get desiredConfig(): T {
    return {
      ...this.resourceMetadata,
      ...this.changeSet.desiredParameters,
    }
  }

  get currentConfig(): T {
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
