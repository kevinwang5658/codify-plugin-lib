import { StringIndexedObject } from 'codify-schemas';

import { Plan } from '../plan/plan.js';
import { ParameterSettingType } from './resource-settings.js';

export interface StatefulParameterOptions {

  type: Omit<ParameterSettingType, 'stateful'>

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

  default?: unknown;
  inputTransformation?: (input: unknown) => unknown;
  isEqual?: (desired: unknown, current: unknown) => boolean
}

export abstract class StatefulParameter<T extends StringIndexedObject, V extends T[keyof T]> {
  readonly options: StatefulParameterOptions<V>;

  constructor(options: StatefulParameterOptions<V> = {}) {
    this.options = options
  }

  abstract refresh(desired: V | null): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: V, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: V, previousValue: V, allowDeletes: boolean, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{
  options: ArrayStatefulParameterOptions<V>;

  constructor(options: ArrayStatefulParameterOptions<V> = {}) {
    super(options);
    this.options = options;
  }

  async applyAdd(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan);
    }
  }

  async applyModify(newValues: V[], previousValues: V[], allowDeletes: boolean, plan: Plan<T>): Promise<void> {
    const options = this.options as ArrayStatefulParameterOptions<V>;

    const valuesToAdd = newValues.filter((n) => !previousValues.some((p) => {
      if (options.isElementEqual) {
        return options.isElementEqual(n, p);
      }

      return n === p;
    }));

    const valuesToRemove = previousValues.filter((p) => !newValues.some((n) => {
      if (options.isElementEqual) {
        return options.isElementEqual(n, p);
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
