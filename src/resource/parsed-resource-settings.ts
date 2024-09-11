import { StringIndexedObject } from 'codify-schemas';

import {
  ArrayParameter,
  ParameterEqualsDefaults,
  ParameterSetting,
  ResourceSettings,
  StatefulParameter
} from './resource-settings.js';
import { StatefulParameter as StatefulParameterImpl } from './stateful-parameter.js'

export class ParsedResourceSettings<T extends StringIndexedObject> {
  private settings: ResourceSettings<T>;
  private cache = new Map<string, unknown>();

  constructor(options: ResourceSettings<T>) {
    this.settings = options;

    this.validateSettings();
  }

  get typeId(): string {
    return this.settings.type;
  }

  get statefulParameters(): Map<keyof T, StatefulParameterImpl<T, T[keyof T]>> {
    return this.getFromCacheOrCreate('statefulParameters', () => {

      const statefulParameters = Object.entries(this.settings.parameterSettings ?? {})
        .filter(([, p]) => p?.type === 'stateful')
        .map(([k, v]) => [k, (v as StatefulParameter<T>).definition] as const)

      return new Map(statefulParameters);
    })
  }

  get parameterSettings(): Record<keyof T, ParameterSetting> {
    return this.getFromCacheOrCreate('parameterSetting', () => {

      const settings = Object.entries(this.settings.parameterSettings ?? {})
        .map(([k, v]) => [k, v!] as const)
        .map(([k, v]) => {
          v.isEqual = this.resolveEqualsFn(v, k);

          return [k, v];
        })

      return Object.fromEntries(settings);
    });
  }

  get defaultValues(): Partial<Record<keyof T, unknown>> {
    return this.getFromCacheOrCreate('defaultValues', () => {

      if (!this.settings.parameterSettings) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(this.settings.parameterSettings)
          .filter(([, v]) => v!.default !== undefined)
          .map(([k, v]) => [k, v!.default])
      ) as Partial<Record<keyof T, unknown>>;
    });
  }

  get inputTransformations(): Partial<Record<keyof T, (a: unknown) => unknown>> {
    return this.getFromCacheOrCreate('inputTransformations', () => {
      if (!this.settings.parameterSettings) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(this.settings.parameterSettings)
          .filter(([, v]) => v!.inputTransformation !== undefined)
          .map(([k, v]) => [k, v!.inputTransformation!] as const)
      ) as Record<keyof T, (a: unknown) => unknown>;
    });
  }

  get statefulParameterOrder(): Map<keyof T, number> {
    return this.getFromCacheOrCreate('stateParameterOrder', () => {

      const entries = Object.entries(this.settings.parameterSettings ?? {})
        .filter(([, v]) => v?.type === 'stateful')
        .map(([k, v]) => [k, v as StatefulParameter<T>] as const)

      const orderedEntries = entries.filter(([, v]) => v.order !== undefined)
      const unorderedEntries = entries.filter(([, v]) => v.order === undefined)

      orderedEntries.sort((a, b) => a[1].order! - b[1].order!);

      const resultArray = [
        ...orderedEntries.map(([k]) => k),
        ...unorderedEntries.map(([k]) => k)
      ]

      return new Map(resultArray.map((key, idx) => [key, idx]));
    });
  }

  private validateSettings(): void {
    // validate parameter settings
    if (this.settings.parameterSettings) {
      for (const [k, v] of Object.entries(this.settings.parameterSettings)) {
        if (!v) {
          throw new Error(`Resource: ${this.settings.type}. Parameter setting ${k} was left undefined`);
        }

        this.validateParameterEqualsFn(v, k);
      }
    }

    if (this.settings.allowMultiple
      && Object.values(this.parameterSettings).some((v) => v.type === 'stateful')) {
      throw new Error(`Resource: ${this.settings.type}. Stateful parameters are not allowed if multiples of a resource exist`)
    }
  }

  private validateParameterEqualsFn(parameter: ParameterSetting, key: string): void {
    // Type any has no defaults and so isEquals must be specified
    if (parameter.type === 'any' && !parameter.isEqual) {
      throw new Error(`Type any has no defaults and so isEquals must be specified for ${key}`);
    }

    if (parameter.type === 'stateful') {
      const nestedSettings = (parameter as StatefulParameter<T>).definition.options;

      if (nestedSettings.type === 'stateful') {
        throw new Error(`Nested stateful parameters are not allowed for ${key}`);
      }

      this.validateParameterEqualsFn(nestedSettings, key);
    }

    // The rest of the types have defaults set already
  }

  private resolveEqualsFn(parameter: ParameterSetting, key: string): (desired: unknown, current: unknown) => boolean {
    if (parameter.type === 'array') {
      return parameter.isEqual ?? areArraysEqual.bind(areArraysEqual, parameter as ArrayParameter, key)
    }

    if (parameter.type === 'stateful') {
      return this.resolveEqualsFn((parameter as StatefulParameter<T>).definition.options, key)
    }

    return parameter.isEqual ?? ParameterEqualsDefaults[parameter.type]!;
  }

  private getFromCacheOrCreate<T2>(key: string, create: () => T2): T2 {
    if (this.cache.has(key)) {
      return this.cache.get(key) as T2
    }

    const result = create();

    this.cache.set(key, result)
    return result;
  }
}

function areArraysEqual(parameter: ArrayParameter, key: string, desired: unknown, current: unknown) {
  if (!Array.isArray(desired) || !Array.isArray(current)) {
    throw new Error(`A non-array value:
          
Desired: ${JSON.stringify(desired, null, 2)}

Current: ${JSON.stringify(desired, null, 2)}

Was provided to ${key} even though type array was specified.
`)
  }

  if (desired.length !== current.length) {
    return false;
  }

  const desiredCopy = [...desired];
  const currentCopy = [...current];

  // Algorithm for to check equality between two un-ordered; un-hashable arrays using
  // an isElementEqual method. Time: O(n^2)
  for (let counter = desiredCopy.length - 1; counter--; counter >= 0) {
    const idx = currentCopy.findIndex((e2) => parameter.isElementEqual!(desiredCopy[counter], e2))

    if (idx === -1) {
      return false;
    }

    desiredCopy.splice(counter, 1)
    currentCopy.splice(idx, 1)
  }

  return currentCopy.length === 0;
}
