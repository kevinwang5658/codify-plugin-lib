import { Ajv, ValidateFunction } from 'ajv';
import {
  ParameterOperation,
  ResourceConfig,
  ResourceOperation,
  StringIndexedObject,
  ValidateResponseData
} from 'codify-schemas';

import { ParameterChange } from '../plan/change-set.js';
import { Plan } from '../plan/plan.js';
import { CreatePlan, DestroyPlan, ModifyPlan, PlanOptions } from '../plan/plan-types.js';
import { setsEqual } from '../utils/utils.js';
import { ConfigParser } from './config-parser.js';
import { ParsedResourceSettings } from './parsed-resource-settings.js';
import { Resource } from './resource.js';
import { ResourceSettings } from './resource-settings.js';

export class ResourceController<T extends StringIndexedObject> {
  readonly resource: Resource<T>
  readonly settings: ResourceSettings<T>
  readonly parsedSettings: ParsedResourceSettings<T>

  readonly typeId: string;

  readonly dependencies: string[]; // TODO: Change this to a string

  protected ajv?: Ajv;
  protected schemaValidator?: ValidateFunction;

  constructor(
    resource: Resource<T>,
  ) {
    this.resource = resource;
    this.settings = resource.getSettings();

    this.typeId = this.settings.type;
    this.dependencies = this.settings.dependencies ?? [];

    if (this.settings.schema) {
      this.ajv = new Ajv({
        allErrors: true,
        strict: true,
        strictRequired: false,
      })
      this.schemaValidator = this.ajv.compile(this.settings.schema);
    }

    this.parsedSettings = new ParsedResourceSettings<T>(this.settings);
  }

  async initialize(): Promise<void> {
    return this.resource.initialize();
  }

  async validate(
    parameters: Partial<T>,
    resourceMetaData: ResourceConfig
  ): Promise<ValidateResponseData['resourceValidations'][0]> {
    if (this.schemaValidator) {
      const isValid = this.schemaValidator(parameters);

      if (!isValid) {
        return {
          isValid: false,
          resourceName: resourceMetaData.name,
          resourceType: resourceMetaData.type,
          schemaValidationErrors: this.schemaValidator?.errors ?? [],
        }
      }
    }

    let isValid = true;
    let customValidationErrorMessage;
    try {
      await this.resource.validate(parameters);
    } catch (error) {
      isValid = false;
      customValidationErrorMessage = (error as Error).message;
    }

    if (!isValid) {
      return {
        customValidationErrorMessage,
        isValid: false,
        resourceName: resourceMetaData.name,
        resourceType: resourceMetaData.type,
        schemaValidationErrors: this.schemaValidator?.errors ?? [],
      }
    }

    return {
      isValid: true,
      resourceName: resourceMetaData.name,
      resourceType: resourceMetaData.type,
      schemaValidationErrors: [],
    }
  }

  async plan(
    desiredConfig: Partial<T> & ResourceConfig | null,
    currentConfig: Partial<T> & ResourceConfig | null = null,
    statefulMode = false,
  ): Promise<Plan<T>> {
    this.validatePlanInputs(desiredConfig, currentConfig, statefulMode);

    const planOptions: PlanOptions<T> = {
      parameterSettings: this.parsedSettings.parameterSettings,
      statefulMode,
    }

    this.addDefaultValues(desiredConfig);
    await this.applyTransformParameters(desiredConfig);

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(desiredConfig, currentConfig, this.parsedSettings.statefulParameters)
    const {
      desiredParameters,
      nonStatefulParameters,
      coreParameters,
      statefulParameters,
    } = parsedConfig;

    // Refresh resource parameters. This refreshes the parameters that configure the resource itself
    const currentParameters = await this.refreshNonStatefulParameters(nonStatefulParameters);

    // Short circuit here. If the resource is non-existent, there's no point checking stateful parameters
    if (currentParameters === null || currentParameters === undefined) {
      return Plan.create(
        desiredParameters,
        null,
        coreParameters,
        planOptions,
      );
    }

    // Refresh stateful parameters. These parameters have state external to the resource
    const statefulCurrentParameters = await this.refreshStatefulParameters(statefulParameters, planOptions.statefulMode);

    return Plan.create(
      desiredParameters,
      { ...currentParameters, ...statefulCurrentParameters } as Partial<T>,
      coreParameters,
      planOptions,
    )
  }

  async apply(plan: Plan<T>): Promise<void> {
    if (plan.getResourceType() !== this.typeId) {
      throw new Error(`Internal error: Plan set to wrong resource during apply. Expected ${this.typeId} but got: ${plan.getResourceType()}`);
    }

    switch (plan.changeSet.operation) {
      case ResourceOperation.CREATE: {
        return this.applyCreate(plan); // TODO: Add new parameters value so that apply
      }

      case ResourceOperation.MODIFY: {
        return this.applyModify(plan);
      }

      case ResourceOperation.RECREATE: {
        await this.applyDestroy(plan);
        return this.applyCreate(plan);
      }

      case ResourceOperation.DESTROY: {
        return this.applyDestroy(plan);
      }
    }
  }

  private async applyCreate(plan: Plan<T>): Promise<void> {
    await this.resource.create(plan as CreatePlan<T>);

    const statefulParameterChanges = this.getSortedStatefulParameterChanges(plan.changeSet.parameterChanges)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.parsedSettings.statefulParameters.get(parameterChange.name)!;
      await statefulParameter.applyAdd(parameterChange.newValue, plan);
    }
  }

  private async applyModify(plan: Plan<T>): Promise<void> {
    const parameterChanges = plan
      .changeSet
      .parameterChanges
      .filter((c: ParameterChange<T>) => c.operation !== ParameterOperation.NOOP);

    const statelessParameterChanges = parameterChanges
      .filter((pc: ParameterChange<T>) => !this.parsedSettings.statefulParameters.has(pc.name))

    for (const pc of statelessParameterChanges) {
      // TODO: When stateful mode is added in the future. Dynamically choose if deletes are allowed
      await this.resource.modify(pc, plan as ModifyPlan<T>);
    }

    const statefulParameterChanges = this.getSortedStatefulParameterChanges(plan.changeSet.parameterChanges)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.parsedSettings.statefulParameters.get(parameterChange.name)!;

      switch (parameterChange.operation) {
        case ParameterOperation.ADD: {
          await statefulParameter.applyAdd(parameterChange.newValue, plan);
          break;
        }

        case ParameterOperation.MODIFY: {
          // TODO: When stateful mode is added in the future. Dynamically choose if deletes are allowed
          await statefulParameter.applyModify(parameterChange.newValue, parameterChange.previousValue, false, plan);
          break;
        }

        case ParameterOperation.REMOVE: {
          await statefulParameter.applyRemove(parameterChange.previousValue, plan);
          break;
        }
      }
    }
  }

  private async applyDestroy(plan: Plan<T>): Promise<void> {
    // If this option is set (defaults to false), then stateful parameters need to be destroyed
    // as well. This means that the stateful parameter wouldn't have been normally destroyed with applyDestroy()
    if (this.settings.removeStatefulParametersBeforeDestroy) {
      const statefulParameterChanges = this.getSortedStatefulParameterChanges(plan.changeSet.parameterChanges)

      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.parsedSettings.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.resource.destroy(plan as DestroyPlan<T>);
  }

  private validateRefreshResults(refresh: Partial<T> | null, desired: Partial<T>) {
    if (!refresh) {
      return;
    }

    const desiredKeys = new Set(Object.keys(refresh)) as Set<keyof T>;
    const refreshKeys = new Set(Object.keys(refresh)) as Set<keyof T>;

    // TODO: Need to fix this
    if (!setsEqual(desiredKeys, refreshKeys)) {
      throw new Error(
        `Resource ${this.typeId}
refresh() must return back exactly the keys that were provided
Missing: ${[...desiredKeys].filter((k) => !refreshKeys.has(k))};
Additional: ${[...refreshKeys].filter(k => !desiredKeys.has(k))};`
      );
    }
  }

  private async applyTransformParameters(desired: Partial<T> | null): Promise<void> {
    if (!desired) {
      return;
    }

    for (const [key, inputTransformation] of Object.entries(this.parsedSettings.inputTransformations)) {
      if (desired[key] === undefined || !inputTransformation) {
        continue;
      }

      (desired as Record<string, unknown>)[key] = await inputTransformation(desired[key]);
    }

    if (this.settings.inputTransformation) {
      const transformed = await this.settings.inputTransformation(desired)
      Object.assign(desired, transformed);
    }
  }

  private addDefaultValues(desired: Partial<T> | null): void {
    if (!desired) {
      return;
    }

    for (const [key, defaultValue] of Object.entries(this.parsedSettings.defaultValues)) {
      if (defaultValue !== undefined && desired[key] === undefined) {
        (desired as Record<string, unknown>)[key] = defaultValue;
      }
    }
  }

  private async refreshNonStatefulParameters(resourceParameters: Partial<T>): Promise<Partial<T> | null> {
    const currentParameters = await this.resource.refresh(resourceParameters);
    this.validateRefreshResults(currentParameters, resourceParameters);
    return currentParameters;
  }

  // Refresh stateful parameters
  // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)
  private async refreshStatefulParameters(statefulParametersConfig: Partial<T>, isStatefulMode: boolean): Promise<Partial<T>> {
    const currentParameters: Partial<T> = {}
    const sortedEntries = Object.entries(statefulParametersConfig)
      .sort(
        ([key1], [key2]) => this.parsedSettings.statefulParameterOrder.get(key1)! - this.parsedSettings.statefulParameterOrder.get(key2)!
      )

    for (const [key, desiredValue] of sortedEntries) {
      const statefulParameter = this.parsedSettings.statefulParameters.get(key);
      if (!statefulParameter) {
        throw new Error(`Stateful parameter ${key} was not found`);
      }

      let currentValue = await statefulParameter.refresh(desiredValue ?? null);

      // TODO move this to the plan / change set
      // In stateless mode, filter the refreshed parameters by the desired to ensure that no deletes happen
      // Otherwise the change set will pick up the extra keys from the current and try to delete them
      // This allows arrays within stateful parameters to be first class objects
      if (Array.isArray(currentValue)
        && Array.isArray(desiredValue)
        && !isStatefulMode
        && !statefulParameter.options.disableStatelessModeArrayFiltering
      ) {
        currentValue = currentValue.filter((c) => desiredValue?.some((d) => {
          const parameterOptions = statefulParameter.options;
          if (parameterOptions && parameterOptions.isElementEqual) {
            return parameterOptions.isElementEqual(d, c);
          }

          return d === c;
        }));
      }

      (currentParameters as Record<string, unknown>)[key] = currentValue;
    }

    return currentParameters;
  }

  private validatePlanInputs(
    desired: Partial<T> & ResourceConfig | null,
    current: Partial<T> & ResourceConfig | null,
    statefulMode: boolean,
  ) {
    if (!desired && !current) {
      throw new Error('Desired config and current config cannot both be missing')
    }

    if (!statefulMode && !desired) {
      throw new Error('Desired config must be provided in non-stateful mode')
    }
  }

  private getSortedStatefulParameterChanges(parameterChanges: ParameterChange<T>[]) {
    return parameterChanges
      .filter((pc: ParameterChange<T>) => this.parsedSettings.statefulParameters.has(pc.name))
      .sort((a, b) =>
        this.parsedSettings.statefulParameterOrder.get(a.name)! - this.parsedSettings.statefulParameterOrder.get(b.name)!
      )
  }

}

