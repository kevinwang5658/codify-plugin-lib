import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { StringIndexedObject } from '../utils/common-types.js';

export interface ParameterChange {
  name: string;
  operation: ParameterOperation;
  previousValue: any | null;
  newValue: any | null;
}

export class ChangeSet {
  operation: ResourceOperation
  parameterChanges: Array<ParameterChange>

  constructor(
    operation: ResourceOperation,
    parameterChanges: Array<ParameterChange>
  ) {
    this.operation = operation;
    this.parameterChanges = parameterChanges;
  }

  // static create<T extends Record<string, unknown>>(prev: T, next: T, options: {
  //   statefulMode: boolean,
  // }): ChangeSet {
  //   const parameterChanges = ChangeSet.calculateParameterChangeSet(prev, prev, options);
  //   const operation = ChangeSet.combineResourceOperations(prev, );
  // }

  static newCreate<T extends {}>(desiredConfig: T) {
    const parameterChangeSet = Object.entries(desiredConfig)
      .filter(([k,]) => k !== 'type' && k !== 'name')
      .map(([k, v]) => {
        return {
          name: k,
          operation: ParameterOperation.ADD,
          previousValue: null,
          newValue: v,
        }
      })

    return new ChangeSet(ResourceOperation.CREATE, parameterChangeSet);
  }

  static calculateParameterChangeSet<T extends StringIndexedObject>(
    prev: T,
    next: T,
    options: { statefulMode: boolean },
  ): ParameterChange[] {
    if (options.statefulMode) {
      return ChangeSet.calculateStatefulModeChangeSet(prev, next);
    } else {
      return ChangeSet.calculateStatelessModeChangeSet(prev, next);
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

  static isSame(a: unknown, b: unknown): boolean {
    if (Array.isArray(a) && Array.isArray(b)) {
      const sortedPrev = a.map((x) => x).sort();
      const sortedNext = b.map((x) => x).sort();

      return JSON.stringify(sortedPrev) === JSON.stringify(sortedNext);
    }

    return a === b;
  }

  // Explanation: Stateful mode means that codify maintains a stateful to keep track of resources it has added. 
  // When a resource is removed from a stateful config, it will be deleted from the system.
  private static calculateStatefulModeChangeSet<T extends StringIndexedObject>(
    prev: T,
    next: T,
  ): ParameterChange[] {
    const parameterChangeSet = new Array<ParameterChange>();
    
    const _prev = { ...prev };
    const _next = { ...next };

    for (const [k, v] of Object.entries(_prev)) {
      if (!_next[k]) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: null,
          operation: ParameterOperation.REMOVE,
        })

        delete _prev[k];
        continue;
      }

      if (!ChangeSet.isSame(_prev[k], _next[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: _next[k],
          operation: ParameterOperation.MODIFY,
        })

        delete _prev[k];
        delete _next[k];
        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: _next[k],
        operation: ParameterOperation.NOOP,
      })

      delete _prev[k];
      delete _next[k];
    }

    if (Object.keys(_prev).length !== 0) {
      throw Error('Diff algorithm error');
    }

    for (const [k, v] of Object.entries(_next)) {
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
    prev: T,
    next: T,
  ): ParameterChange[] {
    const parameterChangeSet = new Array<ParameterChange>();

    const _prev = { ...prev };
    const _next = { ...next };


    for (const [k, v] of Object.entries(_next)) {
      if (!_prev[k]) {
        parameterChangeSet.push({
          name: k,
          previousValue: null,
          newValue: v,
          operation: ParameterOperation.ADD,
        });

        continue;
      }

      if (!ChangeSet.isSame(_prev[k], _next[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: _next[k],
          operation: ParameterOperation.MODIFY,
        });

        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: _next[k],
        operation: ParameterOperation.NOOP,
      })
    }

    return parameterChangeSet;
  }
    
}
