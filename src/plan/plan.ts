import {
  ApplyRequestData,
  ParameterOperation,
  PlanResponseData,
  ResourceConfig,
  ResourceOperation,
  StringIndexedObject,
} from 'codify-schemas';
import { v4 as uuidV4 } from 'uuid';

import { ParsedResourceSettings } from '../resource/parsed-resource-settings.js';
import { ResourceSettings, StatefulParameter } from '../resource/resource-settings.js';
import { ChangeSet } from './change-set.js';

export class Plan<T extends StringIndexedObject> {
  id: string;
  changeSet: ChangeSet<T>;
  coreParameters: ResourceConfig

  constructor(id: string, changeSet: ChangeSet<T>, resourceMetadata: ResourceConfig) {
    this.id = id;
    this.changeSet = changeSet;
    this.coreParameters = resourceMetadata;
  }

  get desiredConfig(): T | null {
    if (this.changeSet.operation === ResourceOperation.DESTROY) {
      return null;
    }

    return {
      ...this.coreParameters,
      ...this.changeSet.desiredParameters,
    }
  }

  get currentConfig(): T | null {
    if (this.changeSet.operation === ResourceOperation.CREATE) {
      return null;
    }

    return {
      ...this.coreParameters,
      ...this.changeSet.currentParameters,
    }
  }

  static calculate<T extends StringIndexedObject>(params: {
    desiredParameters: Partial<T> | null,
    currentParametersArray: Partial<T>[] | null,
    stateParameters: Partial<T> | null,
    coreParameters: ResourceConfig,
    settings: ParsedResourceSettings<T>,
    statefulMode: boolean,
  }): Plan<T> {
    const {
      desiredParameters,
      currentParametersArray,
      stateParameters,
      coreParameters,
      settings,
      statefulMode
    } = params

    const currentParameters = Plan.matchCurrentParameters<T>({
      desiredParameters,
      currentParametersArray,
      stateParameters,
      settings,
      statefulMode
    });

    const filteredCurrentParameters = Plan.filterCurrentParams<T>({
      desiredParameters,
      currentParameters,
      stateParameters,
      settings,
      statefulMode
    });

    // Empty
    if (!filteredCurrentParameters && !desiredParameters) {
      return new Plan(
        uuidV4(),
        ChangeSet.empty<T>(),
        coreParameters,
      )
    }

    // CREATE
    if (!filteredCurrentParameters && desiredParameters) {
      return new Plan(
        uuidV4(),
        ChangeSet.create(desiredParameters),
        coreParameters
      )
    }

    // DESTROY
    if (filteredCurrentParameters && !desiredParameters) {
      return new Plan(
        uuidV4(),
        ChangeSet.destroy(filteredCurrentParameters),
        coreParameters
      )
    }

    // NO-OP, MODIFY or RE-CREATE
    const changeSet = ChangeSet.calculateModification(
      desiredParameters!,
      filteredCurrentParameters!,
      settings.parameterSettings,
    );

    return new Plan(
      uuidV4(),
      changeSet,
      coreParameters,
    );
  }

  /**
   *  Only keep relevant params for the plan. We don't want to change settings that were not already
   *  defined.
   *
   *  1. In stateless mode, filter current by desired. We only want to know about settings that the user has specified
   *  2. In stateful mode, filter current by state and desired. We only know about the settings the user has previously set
   *  or wants to set. If a parameter is not specified then it's not managed by Codify.
   */

  private static filterCurrentParams<T extends StringIndexedObject>(params: {
    desiredParameters: Partial<T> | null,
    currentParameters: Partial<T> | null,
    stateParameters: Partial<T> | null,
    settings: ResourceSettings<T>,
    statefulMode: boolean,
  }): Partial<T> | null {
    const {
      desiredParameters: desired,
      currentParameters: current,
      stateParameters: state,
      settings,
      statefulMode
    } = params;

    if (!current) {
      return null;
    }

    const filteredCurrent = filterCurrent()
    if (!filteredCurrent) {
      return null
    }

    // For stateful mode, we're done after filtering by the keys of desired + state. Stateless mode
    // requires additional filtering for stateful parameter arrays and objects.
    if (statefulMode) {
      return filteredCurrent;
    }

    // TODO: Add object handling here in addition to arrays in the future
    const arrayStatefulParameters = Object.fromEntries(
      Object.entries(filteredCurrent)
        .filter(([k, v]) => isArrayStatefulParameter(k, v))
        .map(([k, v]) => [k, filterArrayStatefulParameter(k, v)])
    )

    return { ...filteredCurrent, ...arrayStatefulParameters }

    function filterCurrent(): Partial<T> | null {
      if (!current) {
        return null;
      }

      if (statefulMode) {
        const keys = new Set([...Object.keys(state ?? {}), ...Object.keys(desired ?? {})]);
        return Object.fromEntries(
          Object.entries(current)
            .filter(([k]) => keys.has(k))
        ) as Partial<T>;
      }

      // Stateless mode
      const keys = new Set(Object.keys(desired ?? {}));
      return Object.fromEntries(
        Object.entries(current)
          .filter(([k]) => keys.has(k))
      ) as Partial<T>;
    }

    function isArrayStatefulParameter(k: string, v: T[keyof T]): boolean {
      return settings.parameterSettings?.[k]?.type === 'stateful'
        && (settings.parameterSettings[k] as StatefulParameter).definition.getSettings().type === 'array'
        && !(settings.parameterSettings[k] as StatefulParameter).definition.getSettings().disableStatelessModeArrayFiltering
        && Array.isArray(v)
    }

    function filterArrayStatefulParameter(k: string, v: unknown[]): unknown[] {
      const desiredArray = desired![k] as unknown[];
      const matcher = (settings.parameterSettings![k] as StatefulParameter)
        .definition
        .getSettings()
        .isElementEqual;

      return v.filter((cv) =>
        desiredArray.find((dv) => (matcher ?? ((a: any, b: any) => a === b))(dv, cv))
      )
    }
  }

  getResourceType(): string {
    return this.coreParameters.type
  }

  static fromResponse<T extends ResourceConfig>(data: ApplyRequestData['plan'], defaultValues?: Partial<Record<keyof T, unknown>>): Plan<T> {
    if (!data) {
      throw new Error('Data is empty');
    }

    addDefaultValues();

    return new Plan(
      uuidV4(),
      new ChangeSet<T>(
        data.operation,
        data.parameters
      ),
      {
        type: data.resourceType,
        name: data.resourceName,
      },
    );

   function addDefaultValues(): void {
      Object.entries(defaultValues ?? {})
        .forEach(([key, defaultValue]) => {
          const configValueExists = data!
            .parameters
            .some((p) => p.name === key);

          // Only set default values if the value does not exist in the config
          if (configValueExists) {
            return;
          }

          switch (data!.operation) {
            case ResourceOperation.CREATE: {
              data!.parameters.push({
                name: key,
                operation: ParameterOperation.ADD,
                previousValue: null,
                newValue: defaultValue,
              });
              break;
            }

            case ResourceOperation.DESTROY: {
              data!.parameters.push({
                name: key,
                operation: ParameterOperation.REMOVE,
                previousValue: defaultValue,
                newValue: null,
              });
              break;
            }

            case ResourceOperation.MODIFY:
            case ResourceOperation.RECREATE:
            case ResourceOperation.NOOP: {
              data!.parameters.push({
                name: key,
                operation: ParameterOperation.NOOP,
                previousValue: defaultValue,
                newValue: defaultValue,
              });
              break;
            }
          }
        });
    }

  }

  private static matchCurrentParameters<T extends StringIndexedObject>(params: {
    desiredParameters: Partial<T> | null,
    currentParametersArray: Partial<T>[] | null,
    stateParameters: Partial<T> | null,
    settings: ResourceSettings<T>,
    statefulMode: boolean,
  }): Partial<T> | null {
    const {
      desiredParameters,
      currentParametersArray,
      stateParameters,
      settings,
      statefulMode
    } = params;

    if (!settings.allowMultiple) {
      return currentParametersArray?.[0] ?? null;
    }

    if (!currentParametersArray) {
      return null;
    }

    if (statefulMode) {
      return stateParameters
        ? settings.allowMultiple.matcher(stateParameters, currentParametersArray)
        : null
    }

    return settings.allowMultiple.matcher(desiredParameters!, currentParametersArray);
  }

  toResponse(): PlanResponseData {
    return {
      planId: this.id,
      operation: this.changeSet.operation,
      resourceName: this.coreParameters.name,
      resourceType: this.coreParameters.type,
      parameters: this.changeSet.parameterChanges,
    }
  }


}
