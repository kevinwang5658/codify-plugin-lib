import { ParameterOperation, ResourceConfig, ResourceOperation } from 'codify-schemas';

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

  static createForNullCurrentConfig(desiredConfig: ResourceConfig) {
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

  static calculateParameterChangeSet(prev: ResourceConfig, next: ResourceConfig): ParameterChange[] {
    const parameterChangeSet = new Array<ParameterChange>();

    const filteredPrev = Object.fromEntries(
      Object.entries(prev)
        .filter(([k,]) => k !== 'type' && k !== 'name')
    );

    const filteredNext = Object.fromEntries(
      Object.entries(next)
        .filter(([k,]) => k !== 'type' && k !== 'name')
    );

    for (const [k, v] of Object.entries(filteredPrev)) {
      if (!filteredNext[k]) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: null,
          operation: ParameterOperation.REMOVE,
        })

        delete filteredPrev[k];
        continue;
      }

      if (!ChangeSet.isSame(filteredPrev[k], filteredNext[k])) {
        parameterChangeSet.push({
          name: k,
          previousValue: v,
          newValue: filteredNext[k],
          operation: ParameterOperation.MODIFY,
        })

        delete filteredPrev[k];
        delete filteredNext[k];
        continue;
      }

      parameterChangeSet.push({
        name: k,
        previousValue: v,
        newValue: filteredNext[k],
        operation: ParameterOperation.NOOP,
      })

      delete filteredPrev[k];
      delete filteredNext[k];
    }

    if (Object.keys(filteredPrev).length !== 0) {
      throw Error('Diff algorithm error');
    }

    for (const [k, v] of Object.entries(filteredNext)) {
      parameterChangeSet.push({
        name: k,
        previousValue: null,
        newValue: v,
        operation: ParameterOperation.ADD,
      })
    }

    return parameterChangeSet;
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
}
