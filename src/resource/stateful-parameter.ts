import { StringIndexedObject } from 'codify-schemas';

import { Plan } from '../plan/plan.js';
import { ParameterSettingType } from './resource-settings.js';

export interface StatefulParameterSetting {

  type: Omit<ParameterSettingType, 'stateful'>

  default?: unknown;
  inputTransformation?: (input: unknown) => unknown;
  isEqual?: (desired: unknown, current: unknown) => boolean

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
  isElementEqual?: (desired: unknown, current: unknown) => boolean
}


export abstract class StatefulParameter<T extends StringIndexedObject, V extends T[keyof T]> {

  abstract getSettings(): StatefulParameterSetting;

  abstract refresh(desired: V | null): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract add(valueToAdd: V, plan: Plan<T>): Promise<void>;

  abstract modify(newValue: V, previousValue: V, plan: Plan<T>): Promise<void>;

  abstract remove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{

  async add(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan);
    }
  }

  async modify(newValues: V[], previousValues: V[], plan: Plan<T>): Promise<void> {

    // TODO: I don't think this works with duplicate elements. Solve at another time
    const valuesToAdd = newValues.filter((n) => !previousValues.some((p) => {
      if (this.getSettings().isElementEqual) {
        return this.getSettings().isElementEqual!(n, p);
      }

      return n === p;
    }));

    const valuesToRemove = previousValues.filter((p) => !newValues.some((n) => {
      if (this.getSettings().isElementEqual) {
        return this.getSettings().isElementEqual!(n, p);
      }

      return n === p;
    }));

    for (const value of valuesToAdd) {
      await this.applyAddItem(value, plan)
    }

    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value, plan)
    }
  }

  async remove(valuesToRemove: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value as V, plan);
    }
  }

  abstract refresh(desired: V[] | null): Promise<V[] | null>;
  abstract applyAddItem(item: V, plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: V, plan: Plan<T>): Promise<void>;
}
