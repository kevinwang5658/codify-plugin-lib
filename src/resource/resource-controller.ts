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
import { CreatePlan, DestroyPlan, ModifyPlan } from '../plan/plan-types.js';
import { splitUserConfig } from '../utils/utils.js';
import { ConfigParser } from './config-parser.js';
import { ParsedResourceSettings } from './parsed-resource-settings.js';
import { Resource } from './resource.js';
import { ResourceSettings } from './resource-settings.js';

export class ResourceController<T extends StringIndexedObject> {
  readonly resource: Resource<T>
  readonly settings: ResourceSettings<T>
  readonly parsedSettings: ParsedResourceSettings<T>

  readonly typeId: string;
  readonly dependencies: string[];

  protected ajv?: Ajv;
  protected schemaValidator?: ValidateFunction;

  constructor(
    resource: Resource<T>,
  ) {
    this.resource = resource;
    this.settings = resource.getSettings();

    this.typeId = this.settings.id;
    this.dependencies = this.settings.dependencies ?? [];

    if (this.settings.schema) {
      this.ajv = new Ajv({
        allErrors: true,
        strict: true,
        strictRequired: false,
        allowUnionTypes: true
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
    stateConfig: Partial<T> & ResourceConfig | null = null,
    statefulMode = false,
  ): Promise<Plan<T>> {
    this.validatePlanInputs(desiredConfig, stateConfig, statefulMode);

    this.addDefaultValues(desiredConfig);
    await this.applyTransformParameters(desiredConfig);

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(desiredConfig, stateConfig, this.parsedSettings.statefulParameters)
    const {
      coreParameters,
      desiredParameters,
      stateParameters,
      allParameters,
      allNonStatefulParameters,
      allStatefulParameters,
    } = parsedConfig;

    // Refresh resource parameters. This refreshes the parameters that configure the resource itself
    const currentParametersArray = await this.refreshNonStatefulParameters(allNonStatefulParameters);

    // Short circuit here. If the resource is non-existent, there's no point checking stateful parameters
    if (currentParametersArray === null
      || currentParametersArray === undefined
      || this.settings.allowMultiple // Stateful parameters are not supported currently if allowMultiple is true
      || currentParametersArray.length === 0
      || currentParametersArray.filter(Boolean).length === 0
    ) {
      return Plan.calculate({
        desiredParameters,
        currentParametersArray,
        stateParameters,
        coreParameters,
        settings: this.parsedSettings,
        statefulMode,
      });
    }

    // Refresh stateful parameters. These parameters have state external to the resource. allowMultiple
    // does not work together with stateful parameters
    const statefulCurrentParameters = await this.refreshStatefulParameters(allStatefulParameters, allParameters);

    return Plan.calculate({
      desiredParameters,
      currentParametersArray: [{ ...currentParametersArray[0], ...statefulCurrentParameters }] as Partial<T>[],
      stateParameters,
      coreParameters,
      settings: this.parsedSettings,
      statefulMode
    })
  }

  async apply(plan: Plan<T>): Promise<void> {
    if (plan.getResourceType() !== this.typeId) {
      throw new Error(`Internal error: Plan set to wrong resource during apply. Expected ${this.typeId} but got: ${plan.getResourceType()}`);
    }

    switch (plan.changeSet.operation) {
      case ResourceOperation.CREATE: {
        return this.applyCreate(plan);
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
      await statefulParameter.add(parameterChange.newValue, plan);
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
      await this.resource.modify(pc, plan as ModifyPlan<T>);
    }

    const statefulParameterChanges = this.getSortedStatefulParameterChanges(plan.changeSet.parameterChanges)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.parsedSettings.statefulParameters.get(parameterChange.name)!;

      switch (parameterChange.operation) {
        case ParameterOperation.ADD: {
          await statefulParameter.add(parameterChange.newValue, plan);
          break;
        }

        case ParameterOperation.MODIFY: {
          await statefulParameter.modify(parameterChange.newValue, parameterChange.previousValue, plan);
          break;
        }

        case ParameterOperation.REMOVE: {
          await statefulParameter.remove(parameterChange.previousValue, plan);
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
        await statefulParameter.remove(parameterChange.previousValue, plan);
      }
    }

    await this.resource.destroy(plan as DestroyPlan<T>);
  }

  private validateRefreshResults(refresh: Array<Partial<T>> | null) {
    if (!refresh) {
      return;
    }

    if (!this.settings.allowMultiple && refresh.length > 1) {
      throw new Error(`Resource: ${this.settings.id}. Allow multiple was set to false but multiple refresh results were returned.

${JSON.stringify(refresh, null, 2)}     
`)
    }
  }

  private async applyTransformParameters(desired: Partial<T> & ResourceConfig | null): Promise<void> {
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
      const { parameters, coreParameters } = splitUserConfig(desired);

      const transformed = await this.settings.inputTransformation(parameters)
      Object.keys(desired).forEach((k) => delete desired[k])
      Object.assign(desired, transformed, coreParameters);
    }
  }

  private addDefaultValues(desired: Partial<T> | null): void {
    if (!desired) {
      return;
    }

    for (const [key, defaultValue] of Object.entries(this.parsedSettings.defaultValues)) {
      if (defaultValue !== undefined && (desired[key] === undefined || desired[key] === null)) {
        (desired as Record<string, unknown>)[key] = defaultValue;
      }
    }
  }

  private async refreshNonStatefulParameters(resourceParameters: Partial<T>): Promise<Array<Partial<T>> | null> {
    const result = await this.resource.refresh(resourceParameters);

    const currentParametersArray = Array.isArray(result) || result === null
      ? result
      : [result]

    this.validateRefreshResults(currentParametersArray);
    return currentParametersArray;
  }

  // Refresh stateful parameters
  // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)
  private async refreshStatefulParameters(statefulParametersConfig: Partial<T>, allParameters: Partial<T>): Promise<Partial<T>> {
    const result: Partial<T> = {}
    const sortedEntries = Object.entries(statefulParametersConfig)
      .sort(
        ([key1], [key2]) => this.parsedSettings.statefulParameterOrder.get(key1)! - this.parsedSettings.statefulParameterOrder.get(key2)!
      )

    for (const [key, desiredValue] of sortedEntries) {
      const statefulParameter = this.parsedSettings.statefulParameters.get(key);
      if (!statefulParameter) {
        throw new Error(`Stateful parameter ${key} was not found`);
      }

      (result as Record<string, unknown>)[key] = await statefulParameter.refresh(desiredValue ?? null, allParameters)
    }

    return result;
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

