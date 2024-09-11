import { StringIndexedObject } from 'codify-schemas';

import { areArraysEqual } from '../utils/utils.js';
import {
  ArrayParameter,
  ParameterEqualsDefaults,
  ParameterSetting,
  ParameterSettingType,
  ResourceSettings,
  StatefulParameter
} from './resource-settings.js';
import { StatefulParameter as StatefulParameterImpl, StatefulParameterSetting } from './stateful-parameter.js'

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

      const defaultValues = Object.fromEntries(
        Object.entries(this.settings.parameterSettings)
          .filter(([, v]) => v!.default !== undefined)
          .map(([k, v]) => [k, v!.default] as const)
      )

      const statefulParameterDefaultValues = Object.fromEntries(
        Object.entries(this.settings.parameterSettings)
          .filter(([, v]) => v?.type === 'stateful')
          .filter(([, v]) => (v as StatefulParameter<T>).definition.getSettings().default !== undefined)
          .map(([k, v]) => [k, (v as StatefulParameter<T>).definition.getSettings().default] as const)
      )

      return { ...defaultValues, ...statefulParameterDefaultValues } as Partial<Record<keyof T, unknown>>;
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

  private validateParameterEqualsFn(parameter: ParameterSetting | StatefulParameterSetting, key: string): void {
    if (parameter.type === 'stateful') {
      const nestedSettings = (parameter as StatefulParameter<T>).definition.getSettings();

      if (nestedSettings.type === 'stateful') {
        throw new Error(`Nested stateful parameters are not allowed for ${key}`);
      }

      this.validateParameterEqualsFn(nestedSettings, key);
    }

    // The rest of the types have defaults set already
  }

  private resolveEqualsFn(parameter: ParameterSetting | StatefulParameterSetting, key: string): (desired: unknown, current: unknown) => boolean {
    if (parameter.type === 'array') {
      return parameter.isEqual ?? areArraysEqual.bind(areArraysEqual, parameter as ArrayParameter)
    }

    if (parameter.type === 'stateful') {
      return this.resolveEqualsFn((parameter as StatefulParameter<T>).definition.getSettings(), key)
    }

    return parameter.isEqual ?? ParameterEqualsDefaults[parameter.type as ParameterSettingType] ?? (((a, b) => a === b));
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
