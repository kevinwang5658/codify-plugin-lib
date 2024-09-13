import { StringIndexedObject } from 'codify-schemas';

import { Plan } from './plan.js';

export interface CreatePlan<T extends StringIndexedObject> extends Plan<T> {
  desiredConfig: T;
  currentConfig: null;
}

export interface DestroyPlan<T extends StringIndexedObject> extends Plan<T> {
  desiredConfig: null;
  currentConfig: T;
}

export interface ModifyPlan<T extends StringIndexedObject> extends Plan<T> {
  desiredConfig: T;
  currentConfig: T;
}
