import { StringIndexedObject } from 'codify-schemas';

import { Plan } from '../plan/plan.js';
import { ParsedResourceSettings } from '../resource/parsed-resource-settings.js';
import { ParameterSetting } from '../resource/resource-settings.js';
import { StatefulParameter } from './stateful-parameter.js';

export class StatefulParameterController<T extends StringIndexedObject, V extends T[keyof T]> {
  readonly statefulParameter: StatefulParameter<T, V>
  readonly settings: ParameterSetting;
  readonly parsedSettings: ParsedResourceSettings<T>

  constructor(
    statefulParameter: StatefulParameter<T, V>
  ) {
    this.statefulParameter = statefulParameter;
    this.settings = statefulParameter.getSettings();

    // this.parsedSettings = new ParsedResourceSettings<T>();
  }

  async refresh(desired: V | null, config: Partial<T>): Promise<V | null> {
    return this.statefulParameter.refresh(desired, config);
  }

  async add(valueToAdd: V, plan: Plan<T>): Promise<void> {
    return this.statefulParameter.add(valueToAdd, plan);
  }

  async modify(newValue: V, previousValue: V, plan: Plan<T>): Promise<void> {
    return this.statefulParameter.modify(newValue, previousValue, plan);
  }

  async remove(valueToRemove: V, plan: Plan<T>): Promise<void> {
    return this.statefulParameter.remove(valueToRemove, plan);
  }


}
