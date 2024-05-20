import { StringIndexedObject } from 'codify-schemas';

export abstract class TransformParameter<T extends StringIndexedObject> {

  abstract transform(value: any): Promise<Partial<T>>

}
