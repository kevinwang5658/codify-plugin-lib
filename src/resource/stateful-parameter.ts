import { StringIndexedObject } from 'codify-schemas';

import { Plan } from '../plan/plan.js';
import { ArrayParameterSetting, ParameterSetting } from './resource-settings.js';

export abstract class StatefulParameter<T extends StringIndexedObject, V extends T[keyof T]> {

  getSettings(): ParameterSetting {
    return {}
  }

  abstract refresh(desired: V | null): Promise<V | null>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract add(valueToAdd: V, plan: Plan<T>): Promise<void>;

  abstract modify(newValue: V, previousValue: V, plan: Plan<T>): Promise<void>;

  abstract remove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T extends StringIndexedObject, V> extends StatefulParameter<T, any>{

  getSettings(): ArrayParameterSetting {
    return { type: 'array' }
  }

  async add(valuesToAdd: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.addItem(value, plan);
    }
  }

  async modify(newValues: V[], previousValues: V[], plan: Plan<T>): Promise<void> {

    // TODO: I don't think this works with duplicate elements. Solve at another time
    const valuesToAdd = newValues.filter((n) => !previousValues.some((p) => {
      if (this.getSettings()?.isElementEqual) {
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
      await this.addItem(value, plan)
    }

    for (const value of valuesToRemove) {
      await this.removeItem(value, plan)
    }
  }

  async remove(valuesToRemove: V[], plan: Plan<T>): Promise<void> {
    for (const value of valuesToRemove) {
      await this.removeItem(value as V, plan);
    }
  }

  abstract refresh(desired: V[] | null): Promise<V[] | null>;

  abstract addItem(item: V, plan: Plan<T>): Promise<void>;

  abstract removeItem(item: V, plan: Plan<T>): Promise<void>;
}
