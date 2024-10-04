import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';

import { ParameterSetting } from '../resource/resource-settings.js';

/**
 * A parameter change describes a parameter level change to a resource.
 */
export interface ParameterChange<T extends StringIndexedObject> {
  /**
   * The name of the parameter
   */
  name: keyof T & string;

  /**
   * The operation to be performed on the parameter.
   */
  operation: ParameterOperation;

  /**
   * The previous value of the resource (the current value on the system)
   */
  previousValue: any | null;

  /**
   * The new value of the resource (the desired value)
   */
  newValue: any | null;
}

// Change set will coerce undefined values to null because undefined is not valid JSON
export class ChangeSet<T extends StringIndexedObject> {
  operation: ResourceOperation
  parameterChanges: Array<ParameterChange<T>>

  constructor(
    operation: ResourceOperation,
    parameterChanges: Array<ParameterChange<T>>
  ) {
    this.operation = operation;
    this.parameterChanges = parameterChanges;
  }

  get desiredParameters(): T {
    return this.parameterChanges
      .reduce((obj, pc) => ({
        ...obj,
        [pc.name]: pc.newValue,
      }), {}) as T;
  }

  get currentParameters(): T {
    return this.parameterChanges
      .reduce((obj, pc) => ({
        ...obj,
        [pc.name]: pc.previousValue,
      }), {}) as T;
  }

  static empty<T extends StringIndexedObject>(): ChangeSet<T> {
    return new ChangeSet<T>(ResourceOperation.NOOP, []);
  }

  static create<T extends StringIndexedObject>(desired: Partial<T>): ChangeSet<T> {
    const parameterChanges = Object.entries(desired)
      .map(([k, v]) => ({
        name: k,
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: v ?? null,
      }))

    return new ChangeSet(ResourceOperation.CREATE, parameterChanges);
  }

  static destroy<T extends StringIndexedObject>(current: Partial<T>): ChangeSet<T> {
    const parameterChanges = Object.entries(current)
      .map(([k, v]) => ({
        name: k,
        operation: ParameterOperation.REMOVE,
        previousValue: v ?? null,
        newValue: null,
      }))

    return new ChangeSet(ResourceOperation.DESTROY, parameterChanges);
  }

  static calculateModification<T extends StringIndexedObject>(
    desired: Partial<T>,
    current: Partial<T>,
    parameterSettings: Partial<Record<keyof T, ParameterSetting>> = {},
  ): ChangeSet<T> {
    const pc = ChangeSet.calculateParameterChanges(desired, current, parameterSettings);

    const statefulParameterKeys = new Set(
      Object.entries(parameterSettings)
        .filter(([, v]) => v?.type === 'stateful')
        .map(([k]) => k)
    )

    const resourceOperation = pc
      .filter((change) => change.operation !== ParameterOperation.NOOP)
      .reduce((operation: ResourceOperation, curr: ParameterChange<T>) => {
        let newOperation: ResourceOperation;
        if (statefulParameterKeys.has(curr.name)) {
          newOperation = ResourceOperation.MODIFY // All stateful parameters are modify only
        } else if (parameterSettings[curr.name]?.canModify) {
          newOperation = ResourceOperation.MODIFY
        } else {
          newOperation = ResourceOperation.RECREATE; // Default to Re-create. Should handle the majority of use cases
        }

        return ChangeSet.combineResourceOperations(operation, newOperation);
      }, ResourceOperation.NOOP);

    return new ChangeSet<T>(resourceOperation, pc);
  }

  /**
   * Calculates the differences between the desired and current parameters,
   * and returns a list of parameter changes that describe what needs to be added,
   * removed, or modified to match the desired state.
   *
   * @param {Partial<T>} desiredParameters - The desired target state of the parameters.
   * @param {Partial<T>} currentParameters - The current state of the parameters.
   * @param {Partial<Record<keyof T, ParameterSetting>>} [parameterOptions] - Optional settings used when comparing parameters.
   * @return {ParameterChange<T>[]} A list of changes required to transition from the current state to the desired state.
   */
  private static calculateParameterChanges<T extends StringIndexedObject>(
    desiredParameters: Partial<T>,
    currentParameters: Partial<T>,
    parameterOptions?: Partial<Record<keyof T, ParameterSetting>>,
  ): ParameterChange<T>[] {
    const parameterChangeSet = new Array<ParameterChange<T>>();

    // Filter out null and undefined values or else the diff below will not work
    const desired = Object.fromEntries(
      Object.entries(desiredParameters).filter(([, v]) => v !== null && v !== undefined)
    ) as Partial<T>

    const current = Object.fromEntries(
      Object.entries(currentParameters).filter(([, v]) => v !== null && v !== undefined)
    ) as Partial<T>

    for (const [k, v] of Object.entries(current)) {
      if (desired?.[k] === null || desired?.[k] === undefined) {
        parameterChangeSet.push({
          name: k,
          previousValue: v ?? null,
          newValue: null,
          operation: ParameterOperation.REMOVE,
        })

        delete current[k];
        continue;
      }

      if (!ChangeSet.isSame(desired[k], current[k], parameterOptions?.[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v ?? null,
          newValue: desired[k] ?? null,
          operation: ParameterOperation.MODIFY,
        })

        delete current[k];
        delete desired[k];
        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v ?? null,
        newValue: desired[k] ?? null,
        operation: ParameterOperation.NOOP,
      })

      delete current[k];
      delete desired[k];
    }

    if (Object.keys(current).length > 0) {
      throw new Error('Diff algorithm error');
    }

    for (const [k, v] of Object.entries(desired)) {
      parameterChangeSet.push({
        name: k,
        previousValue: null,
        newValue: v ?? null,
        operation: ParameterOperation.ADD,
      })
    }

    return parameterChangeSet;
  }

  private static combineResourceOperations(prev: ResourceOperation, next: ResourceOperation) {
    const orderOfOperations = [
      ResourceOperation.NOOP,
      ResourceOperation.MODIFY,
      ResourceOperation.RECREATE,
      ResourceOperation.CREATE,
      ResourceOperation.DESTROY,
    ]

    const indexPrev = orderOfOperations.indexOf(prev);
    const indexNext = orderOfOperations.indexOf(next);

    return orderOfOperations[Math.max(indexPrev, indexNext)];
  }

  private static isSame(
    desired: unknown,
    current: unknown,
    setting?: ParameterSetting,
  ): boolean {
    return (setting?.isEqual ?? ((a, b) => a === b))(desired, current)
  }
}
