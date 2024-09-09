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

  abstract getSettings(): ResourceOptions<T>;

  async initialize(): Promise<void> {
  };

  /**
   * Add custom validation logic in-addition to the default schema validation.
   * In this method throw an error if the object did not validate. The message of the
   * error will be shown to the user.
   * @param parameters
   */
  async validate(parameters: Partial<T>): Promise<void> {
  };

  abstract refresh(parameters: Partial<T>): Promise<Partial<T> | null>;

  abstract create(plan: CreatePlan<T>): Promise<void>;

  async modify(pc: ParameterChange<T>, plan: ModifyPlan<T>): Promise<void> {
  };

  abstract destroy(plan: DestroyPlan<T>): Promise<void>;
}
