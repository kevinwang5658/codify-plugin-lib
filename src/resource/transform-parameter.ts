import { StringIndexedObject } from 'codify-schemas';

/**
 * Transform parameters convert the provided value into
 * other parameters. Transform parameters will not show up
 * in the refresh or the plan. Transform parameters get processed after
 * default values.
 */
export abstract class TransformParameter<T extends StringIndexedObject> {

  abstract transform(value: any): Promise<Partial<T>>

}
