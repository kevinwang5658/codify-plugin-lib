import { ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { ResourceConfig } from 'codify-schemas';

export abstract class StatefulParameter<T extends ResourceConfig, K extends keyof T> {
  abstract get name(): K;

  abstract getCurrent(desiredValue: T[K]): Promise<T[K]>;

  abstract applyAdd(parameterChange: ParameterChange, plan: Plan<T>): Promise<void>;
  abstract applyModify(parameterChange: ParameterChange, plan: Plan<T>): Promise<void>;
  abstract applyRemove(parameterChange: ParameterChange, plan: Plan<T>): Promise<void>;
}
