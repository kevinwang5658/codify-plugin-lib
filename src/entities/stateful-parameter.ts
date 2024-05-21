import { Plan } from './plan.js';
import { StringIndexedObject } from 'codify-schemas';

export interface StatefulParameterConfiguration<T> {
  name: keyof T;
  isEqual?: (desired: any, current: any) => boolean;

  /**
   * In stateless mode, array refresh results (current) will be automatically filtered by the user config (desired).
   * This is done to ensure that for modify operations, stateless mode will not try to delete existing resources.
   *
   * Ex: System has python 3.11.9 and 3.12.7 installed (current). Desired is 3.11. Without filtering 3.12.7 will be deleted
   * in the next modify
   *
   * Set this flag to true to disable this behaviour
   */
  disableStatelessModeArrayFiltering?: boolean;
}

export interface ArrayStatefulParameterConfiguration<T> extends StatefulParameterConfiguration<T> {
  isEqual?: (desired: any[], current: any[]) => boolean;
  isElementEqual?: (desired: any, current: any) => boolean;
}


export abstract class StatefulParameter<T extends StringIndexedObject, V extends T[keyof T]> {
  readonly name: keyof T;
  readonly options: StatefulParameterConfiguration<T>;

  protected constructor(configuration: StatefulParameterConfiguration<T>) {
    this.name = configuration.name;
    this.options = configuration
  }

  abstract refresh(desired: V | null): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: V, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: V, previousValue: V, allowDeletes: boolean, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{
  options: ArrayStatefulParameterConfiguration<T>;

  constructor(configuration: ArrayStatefulParameterConfiguration<T>) {
    super(configuration);
    this.options = configuration;
  }

  async applyAdd(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan);
    }
  }

  async applyModify(newValues: V[], previousValues: V[], allowDeletes: boolean, plan: Plan<T>): Promise<void> {
    const configuration = this.options as ArrayStatefulParameterConfiguration<T>;

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

  abstract refresh(desired: V[] | null): Promise<V[] | null>;
  abstract applyAddItem(item: V, plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: V, plan: Plan<T>): Promise<void>;
}
