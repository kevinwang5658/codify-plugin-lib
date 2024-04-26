import { Plan } from './plan.js';

type ArrayElement<ArrayType extends readonly unknown[]> =
  ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

export interface StatefulParameterConfiguration<T> {
  name: keyof T;
  isEqual?: (a: any, b: any) => boolean;
}

export interface ArrayStatefulParameterConfiguration<T> extends StatefulParameterConfiguration<T> {
  isArrayElementEqual?: (a: any, b: any) => boolean;
}


export abstract class StatefulParameter<T, V extends T[keyof T]> {
  readonly name: keyof T;
  readonly configuration: StatefulParameterConfiguration<T>;

  protected constructor(configuration: StatefulParameterConfiguration<T>) {
    this.name = configuration.name;
    this.configuration = configuration
  }

  abstract refresh(value?: V): Promise<V>;

  // TODO: Add an additional parameter here for what has actually changed.
  abstract applyAdd(valueToAdd: V, plan: Plan<T>): Promise<void>;
  abstract applyModify(newValue: V, previousValue: V, plan: Plan<T>): Promise<void>;
  abstract applyRemove(valueToRemove: V, plan: Plan<T>): Promise<void>;
}

export abstract class ArrayStatefulParameter<T, V extends T[keyof T] & Array<unknown>> extends StatefulParameter<T, V>{
  protected constructor(configuration: ArrayStatefulParameterConfiguration<T>) {
    super(configuration);
  }

  async applyAdd(valuesToAdd: V, plan: Plan<T>): Promise<void> {
    for (const value of valuesToAdd) {
      await this.applyAddItem(value as ArrayElement<V>, plan);
    }
  }

  async applyModify(newValues: V, previousValues: V, plan: Plan<T>): Promise<void> {
    const valuesToAdd = newValues.filter((n) => !previousValues.includes(n));
    const valuesToRemove = previousValues.filter((n) => !newValues.includes(n));

    for (const value of valuesToAdd) {
      await this.applyAddItem(value as ArrayElement<V>, plan)
    }

    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value as ArrayElement<V>, plan)
    }
  }

  async applyRemove(valuesToRemove: V, plan: Plan<T>): Promise<void> {
    for (const value of valuesToRemove) {
      await this.applyRemoveItem(value as ArrayElement<V>, plan);
    }
  }

  abstract applyAddItem(item: ArrayElement<V>, plan: Plan<T>): Promise<void>;
  abstract applyRemoveItem(item: ArrayElement<V>, plan: Plan<T>): Promise<void>;
}
