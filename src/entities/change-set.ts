import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';
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

  // static create<T extends Record<string, unknown>>(prev: T, next: T, options: {
  //   statefulMode: boolean,
  // }): ChangeSet {
  //   const parameterChanges = ChangeSet.calculateParameterChangeSet(prev, prev, options);
  //   const operation = ChangeSet.combineResourceOperations(prev, );
  // }

  // static newCreate<T extends {}>(desiredConfig: T) {
  //   const parameterChangeSet = Object.entries(desiredConfig)
  //     .filter(([k,]) => k !== 'type' && k !== 'name')
  //     .map(([k, v]) => {
  //       return {
  //         name: k,
  //         operation: ParameterOperation.ADD,
  //         previousValue: null,
  //         newValue: v,
  //       }
  //     })
  //
  //   return new ChangeSet(ResourceOperation.CREATE, parameterChangeSet);
  // }

  static calculateParameterChangeSet<T extends StringIndexedObject>(
    desired: T | null,
    current: T | null,
    options: { statefulMode: boolean, parameterOptions?: Record<keyof T, ParameterOptions> },
  ): ParameterChange<T>[] {
    if (options.statefulMode) {
      return ChangeSet.calculateStatefulModeChangeSet(desired, current, options.parameterOptions);
    } else {
      return ChangeSet.calculateStatelessModeChangeSet(desired, current, options.parameterOptions);
    }
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

  // Explanation: Stateful mode means that codify maintains a stateful to keep track of resources it has added. 
  // When a resource is removed from a stateful config, it will be deleted from the system.
  private static calculateStatefulModeChangeSet<T extends StringIndexedObject>(
    desired: T | null,
    current: T | null,
    parameterOptions?: Record<keyof T, ParameterOptions>,
  ): ParameterChange<T>[] {
    const parameterChangeSet = new Array<ParameterChange<T>>();
    
    const _desired = Object.fromEntries(Object.entries(desired ?? {}).filter(([, v]) => v != null));
    const _current = Object.fromEntries(Object.entries(current ?? {}).filter(([, v]) => v != null));

    this.addDefaultValues(_desired, parameterOptions);

    for (const [k, v] of Object.entries(_current)) {
      if (_desired[k] == null) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: null,
          operation: ParameterOperation.REMOVE,
        })

        delete _current[k];
        continue;
      }

      if (!ChangeSet.isSame(_desired[k], _current[k], parameterOptions?.[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: _desired[k],
          operation: ParameterOperation.MODIFY,
        })

        delete _current[k];
        delete _desired[k];
        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: _desired[k],
        operation: ParameterOperation.NOOP,
      })

      delete _current[k];
      delete _desired[k];
    }

    if (Object.keys(_current).length !== 0) {
      throw Error('Diff algorithm error');
    }

    for (const [k, v] of Object.entries(_desired)) {
      parameterChangeSet.push({
        name: k,
        previousValue: null,
        newValue: v,
        operation: ParameterOperation.ADD,
      })
    }

    return parameterChangeSet;
  }

  // Explanation: Stateful mode means that codify does not keep track of state. Resources in stateless mode can only
  // be added by Codify and not destroyed.
  private static calculateStatelessModeChangeSet<T extends StringIndexedObject>(
    desired: T | null,
    current: T | null,
    parameterOptions?: Record<keyof T, ParameterOptions>,
  ): ParameterChange<T>[] {
    const parameterChangeSet = new Array<ParameterChange<T>>();

    const _desired = Object.fromEntries(Object.entries(desired ?? {}).filter(([, v]) => v != null));
    const _current = Object.fromEntries(Object.entries(current ?? {}).filter(([, v]) => v != null));


    this.addDefaultValues(_desired, parameterOptions);

    for (const [k, v] of Object.entries(_desired)) {
      if (_current[k] == null) {
        parameterChangeSet.push({
          name: k,
          previousValue: null,
          newValue: v,
          operation: ParameterOperation.ADD,
        });

        continue;
      }

      if (!ChangeSet.isSame(_desired[k], _current[k], parameterOptions?.[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: _current[k],
          newValue: _desired[k],
          operation: ParameterOperation.MODIFY,
        });

        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: v,
        operation: ParameterOperation.NOOP,
      })
    }

    return parameterChangeSet;
  }

  private static addDefaultValues<T extends StringIndexedObject>(obj: Record<string, unknown>, options?: Record<keyof T, ParameterOptions>) {
    Object.entries(options ?? {})
      .filter(([, option]) => option.default !== undefined)
      .map(([name, option]) => [name, option.default] as const)
      .forEach(([key, defaultValue]) => {
        if (obj[key] === undefined) {
          obj[key] = defaultValue;
        }
      })
  }
    
}
