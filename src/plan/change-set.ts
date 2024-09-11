import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';

import { ParameterSetting } from '../resource/resource-settings.js';
import { ParameterOptions } from './plan-types.js';

export interface ParameterChange<T extends StringIndexedObject> {
  name: keyof T & string;
  operation: ParameterOperation;
  previousValue: any | null;
  newValue: any | null;
}

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

  static empty<T extends StringIndexedObject>(): ChangeSet<T> {
    return new ChangeSet<T>(ResourceOperation.NOOP, []);
  }

  static create<T extends StringIndexedObject>(desired: Partial<T>): ChangeSet<T> {
    const parameterChanges = Object.entries(desired)
      .map(([k, v]) => ({
        name: k,
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: v
      }))

    return new ChangeSet(ResourceOperation.CREATE, parameterChanges);
  }

  static destroy<T extends StringIndexedObject>(current: Partial<T>): ChangeSet<T> {
    const parameterChanges = Object.entries(current)
      .map(([k, v]) => ({
        name: k,
        operation: ParameterOperation.REMOVE,
        previousValue: v,
        newValue: null,
      }))

    return new ChangeSet(ResourceOperation.DESTROY, parameterChanges);
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

  static calculateModification<T extends StringIndexedObject>(
    desired: Partial<T>,
    current: Partial<T>,
    parameterSettings: Partial<Record<keyof T, ParameterSetting>>,
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

  static combineResourceOperations(prev: ResourceOperation, next: ResourceOperation) {
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

  static isSame(
    desired: unknown,
    current: unknown,
    options?: ParameterOptions,
  ): boolean {
    if (options?.isEqual) {
      return options.isEqual(desired, current);
    }

    if (Array.isArray(desired) && Array.isArray(current)) {
      const sortedDesired = desired.map((x) => x).sort();
      const sortedCurrent = current.map((x) => x).sort();

      if (sortedDesired.length !== sortedCurrent.length) {
        return false;
      }

      if (options?.isElementEqual) {
        return sortedDesired.every((value, index) =>
          options.isElementEqual!(value, sortedCurrent[index])
        );
      }

      return JSON.stringify(sortedDesired) === JSON.stringify(sortedCurrent);
    }

    return desired === current;
  }

  private static calculateParameterChanges<T extends StringIndexedObject>(
    desiredParameters: Partial<T> | null,
    currentParameters: Partial<T> | null,
    parameterOptions?: Partial<Record<keyof T, ParameterSetting>>,
  ): ParameterChange<T>[] {
    const parameterChangeSet = new Array<ParameterChange<T>>();

    const desired = { ...desiredParameters }
    const current = { ...currentParameters }

    for (const [k, v] of Object.entries(current)) {
      if (desired?.[k] === null || desired?.[k] === undefined) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: null,
          operation: ParameterOperation.REMOVE,
        })

        delete current[k];
        continue;
      }

      if (!ChangeSet.isSame(desired[k], current[k], parameterOptions?.[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: desired[k],
          operation: ParameterOperation.MODIFY,
        })

        delete current[k];
        delete desired[k];
        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: desired[k],
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
        newValue: v,
        operation: ParameterOperation.ADD,
      })
    }

    return parameterChangeSet;
  }
}
