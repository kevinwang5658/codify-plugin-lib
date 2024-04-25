import { Plan } from './plan.js';

export interface StatefulParameterParams<T, K extends keyof T> {
  name: K;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'object';
  isEqual?: (a: any, b: any) => boolean;
}

export interface StatefulArrayParameterParams<T, K extends keyof T> extends StatefulParameterParams<T, K>{
  isArrayElementEqual?: (a: any, b: any) => boolean;
}


export abstract class StatefulParameter<T, K extends keyof T> {
  readonly name: K;

  protected constructor(params: StatefulParameterParams<T, K>) {
    this.name = params.name;
  }

  abstract getCurrent(desiredValue: T[K]): Promise<T[K]>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: K, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: K, previousValue: K, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: K, plan: Plan<T>): Promise<void>;
}

export abstract class StatefulArrayParameter<T, K extends keyof T> extends StatefulParameter<T, K>{
  protected constructor(params: StatefulParameterParams<T, K>) {
    super(params);
  }

  async applyAdd(valueToAdd: K, plan: Plan<T>): Promise<void> {
    const newValues = valueToAdd as unknown as Array<any>;

    for (const value of newValues) {
      await this.applyAddItem(value, plan);
    }
  }

  async applyModify(newValue: K, previousValue: K, plan: Plan<T>): Promise<void> {
    const _newValue = newValue as unknown as Array<any>;
    const _previousValue = previousValue as unknown as Array<any>;

    const valuesToAdd = _newValue.filter((n) => !_previousValue.includes(n));
    const valuesToRemove = _previousValue.filter((n) => !_newValue.includes(n));

    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan)
    }

    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value, plan)
    }
  }

  async applyRemove(valueToRemove: K, plan: Plan<T>): Promise<void> {
    const previousValues = valueToRemove as unknown as Array<any>;

    for (const value of previousValues) {
      await this.applyRemoveItem(value, plan);
    }
  }

  abstract applyAddItem(item: K[any], plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: K[any], plan: Plan<T>): Promise<void>;
}
