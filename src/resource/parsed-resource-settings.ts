import { StringIndexedObject } from 'codify-schemas';

import { ParameterSetting, resolveEqualsFn, ResourceSettings, StatefulParameterSetting } from './resource-settings.js';
import { StatefulParameter as StatefulParameterImpl } from './stateful-parameter.js'

export class ParsedResourceSettings<T extends StringIndexedObject> implements ResourceSettings<T> {
  private cache = new Map<string, unknown>();
  id!: string;
  schema?: unknown;
  allowMultiple?: { matcher: (desired: Partial<T>, current: Partial<T>[]) => Partial<T>; } | undefined;
  removeStatefulParametersBeforeDestroy?: boolean | undefined;
  dependencies?: string[] | undefined;
  inputTransformation?: ((desired: Partial<T>) => unknown) | undefined;
  private settings: ResourceSettings<T>;

  constructor(settings: ResourceSettings<T>) {
    this.settings = settings;
    this.id = settings.id;
    this.schema = settings.schema;
    this.allowMultiple = settings.allowMultiple;
    this.removeStatefulParametersBeforeDestroy = settings.removeStatefulParametersBeforeDestroy;
    this.dependencies = settings.dependencies;
    this.inputTransformation = settings.inputTransformation;

    this.validateSettings();
  }

  get typeId(): string {
    return this.id;
  }

  get statefulParameters(): Map<keyof T, StatefulParameterImpl<T, T[keyof T]>> {
    return this.getFromCacheOrCreate('statefulParameters', () => {

      const statefulParameters = Object.entries(this.settings.parameterSettings ?? {})
        .filter(([, p]) => p?.type === 'stateful')
        .map(([k, v]) => [k, (v as StatefulParameterSetting).definition] as const)

      return new Map(statefulParameters) as Map<keyof T, StatefulParameterImpl<T, T[keyof T]>>;
    })
  }

  get parameterSettings(): Record<keyof T, ParameterSetting> {
    return this.getFromCacheOrCreate('parameterSetting', () => {

      const settings = Object.entries(this.settings.parameterSettings ?? {})
        .map(([k, v]) => [k, v!] as const)
        .map(([k, v]) => {
          v.isEqual = resolveEqualsFn(v, k);

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
          .filter(([, v]) => (v as StatefulParameterSetting).definition.getSettings().default !== undefined)
          .map(([k, v]) => [k, (v as StatefulParameterSetting).definition.getSettings().default] as const)
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
        .map(([k, v]) => [k, v as StatefulParameterSetting] as const)

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
          throw new Error(`Resource: ${this.id}. Parameter setting ${k} was left undefined`);
        }

        this.validateParameterEqualsFn(v, k);
      }
    }

    if (this.allowMultiple
      && Object.values(this.parameterSettings).some((v) => v.type === 'stateful')) {
      throw new Error(`Resource: ${this.id}. Stateful parameters are not allowed if multiples of a resource exist`)
    }
  }

  private validateParameterEqualsFn(parameter: ParameterSetting, key: string): void {
    if (parameter.type === 'stateful') {
      const nestedSettings = (parameter as StatefulParameterSetting).definition.getSettings();

      if (nestedSettings.type === 'stateful') {
        throw new Error(`Nested stateful parameters are not allowed for ${key}`);
      }

      this.validateParameterEqualsFn(nestedSettings, key);
    }

    // The rest of the types have defaults set already
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
