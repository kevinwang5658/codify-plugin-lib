import { Plan } from './plan.js';
import { StringIndexedObject } from 'codify-schemas';

export interface StatefulParameterConfiguration<T> {
  name: keyof T;
  isEqual?: (desired: any, current: any) => boolean;
}

export interface ArrayStatefulParameterConfiguration<T> extends StatefulParameterConfiguration<T> {
  isEqual?: (desired: any[], current: any[]) => boolean;
  isElementEqual?: (desired: any, current: any) => boolean;
}


export abstract class StatefulParameter<T extends StringIndexedObject, V extends T[keyof T]> {
  readonly name: keyof T;
  readonly configuration: StatefulParameterConfiguration<T>;

  protected constructor(configuration: StatefulParameterConfiguration<T>) {
    this.name = configuration.name;
    this.configuration = configuration
  }

  abstract refresh(): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: V, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: V, previousValue: V, allowDeletes: boolean, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{
  configuration: ArrayStatefulParameterConfiguration<T>;

  constructor(configuration: ArrayStatefulParameterConfiguration<T>) {
    super(configuration);
    this.configuration = configuration;
  }

  async applyAdd(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan);
    }
  }

  async applyModify(newValues: V[], previousValues: V[], allowDeletes: boolean, plan: Plan<T>): Promise<void> {
    const configuration = this.configuration as ArrayStatefulParameterConfiguration<T>;

    const valuesToAdd = newValues.filter((n) => !previousValues.some((p) => {
      if ((configuration).isElementEqual) {
        return configuration.isElementEqual(n, p);
      }
      return n === p;
    }));

    const valuesToRemove = previousValues.filter((p) => !newValues.some((n) => {
      if ((configuration).isElementEqual) {
        return configuration.isElementEqual(n, p);
      }
      return n === p;
    }));

    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan)
    }

    if (allowDeletes) {
      for (const value of valuesToRemove) {
        await this.applyRemoveItem(value, plan)
      }
    }
  }

  async applyRemove(valuesToRemove: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value as V, plan);
    }
  }

  abstract refresh(): Promise<V[] | null>;
  abstract applyAddItem(item: V, plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: V, plan: Plan<T>): Promise<void>;
}
