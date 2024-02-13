import { ResourceConfig } from 'codify-schemas';

export abstract class Resource<T> {
  async onInitialize(): Promise<void> {}

  async plan(config: ResourceConfig): Promise<any> {

  }

  async apply(): Promise<any> {}

  abstract validate(config: ResourceConfig): Promise<boolean>;

  abstract getCurrentConfig(): T;

  abstract calculateChangeSet(prev: any, next: any): Promise<void>;

  abstract applyCreate(): Promise<void>;

  abstract applyModify(): Promise<void>;

  abstract applyRecreate(): Promise<void>;

  abstract applyDestroy(): Promise<void>;
}
