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
import { ParameterConfiguration, PlanConfiguration } from './plan-types.js';

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
    configuration: PlanConfiguration<T>
  ): Plan<T> {
    const parameterConfigurations = configuration.parameterConfigurations ?? {} as Record<keyof T, ParameterConfiguration>;
    const statefulParameterNames = new Set(
      [...Object.entries(parameterConfigurations)]
        .filter(([k, v]) => v.isStatefulParameter)
        .map(([k, v]) => k)
    );

    // Explanation: This calculates the change set of the parameters between the
    // two configs and then passes it to ChangeSet to calculate the overall
    // operation for the resource
    const parameterChangeSet = ChangeSet.calculateParameterChangeSet(
      desiredParameters,
      currentParameters,
      { statefulMode: configuration.statefulMode, parameterConfigurations }
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

   function addDefaultValues(): void {
      Object.entries(defaultValues)
        .forEach(([key, defaultValue]) => {
          const parameterExists = data
            ?.parameters
            .find((p) => p.name === key) !== undefined;

          if (!parameterExists) {
            data?.parameters.push({
              name: key,
              operation: ParameterOperation.ADD,
              previousValue: null,
              newValue: defaultValue,
            });
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
