import { StringIndexedObject, } from 'codify-schemas';

import { ParameterChange } from '../plan/change-set.js';
import { CreatePlan, DestroyPlan, ModifyPlan } from '../plan/plan-types.js';
import { ResourceOptions } from './resource-options.js';

/**
 * Description of resource here
 * Two main functions:
 * - Plan
 * - Apply
 *
 */
export abstract class Resource<T extends StringIndexedObject> {

  async onInitialize(): Promise<void> {
  };

  abstract getSettings(): ResourceOptions<T>;

  /**
   * Add custom validation logic in-addition to the default schema validation.
   * In this method throw an error if the object did not validate. The message of the
   * error will be shown to the user.
   * @param parameters
   */
  async customValidation(parameters: Partial<T>): Promise<void> {};

  abstract refresh(parameters: Partial<T>): Promise<Partial<T> | null>;

  abstract applyCreate(plan: CreatePlan<T>): Promise<void>;

  async applyModify(pc: ParameterChange<T>, plan: ModifyPlan<T>): Promise<void> {};

  abstract applyDestroy(plan: DestroyPlan<T>): Promise<void>;
}
