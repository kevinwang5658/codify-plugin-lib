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

  abstract refresh(previousValue: V | null): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: V, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: V, previousValue: V, allowDeletes: boolean, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{

  constructor(configuration: ArrayStatefulParameterConfiguration<T>) {
    super(configuration);
  }

  async applyAdd(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan);
    }
  }

  async applyModify(newValues: V[], previousValues: V[], allowDeletes: boolean, plan: Plan<T>): Promise<void> {
    const valuesToAdd = newValues.filter((n) => !previousValues.includes(n));
    const valuesToRemove = previousValues.filter((n) => !newValues.includes(n));

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

  abstract refresh(previousValue: V[] | null): Promise<V[] | null>;
  abstract applyAddItem(item: V, plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: V, plan: Plan<T>): Promise<void>;
}
