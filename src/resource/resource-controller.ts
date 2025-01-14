import { Ajv, ValidateFunction } from 'ajv';
import {
  ParameterOperation,
  ResourceConfig,
  ResourceJson,
  ResourceOperation,
  StringIndexedObject,
  ValidateResponseData
} from 'codify-schemas';

import { ParameterChange } from '../plan/change-set.js';
import { Plan } from '../plan/plan.js';
import { CreatePlan, DestroyPlan, ModifyPlan } from '../plan/plan-types.js';
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
    core: ResourceConfig,
    parameters: Partial<T>,
  ): Promise<ValidateResponseData['resourceValidations'][0]> {
    await this.applyTransformParameters(parameters);
    this.addDefaultValues(parameters);

    if (this.schemaValidator) {
      // Schema validator uses pre transformation parameters
      const isValid = this.schemaValidator(parameters);

      if (!isValid) {
        return {
          isValid: false,
          resourceName: core.name,
          resourceType: core.type,
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
        resourceName: core.name,
        resourceType: core.type,
        schemaValidationErrors: this.schemaValidator?.errors ?? [],
      }
    }

    return {
      isValid: true,
      resourceName: core.name,
      resourceType: core.type,
      schemaValidationErrors: [],
    }
  }

  async plan(
    core: ResourceConfig,
    desired: Partial<T> | null,
    state: Partial<T> | null,
    isStateful = false,
  ): Promise<Plan<T>> {
    this.validatePlanInputs(core, desired, state, isStateful);

    this.addDefaultValues(desired);
    await this.applyTransformParameters(desired);

    this.addDefaultValues(state);
    await this.applyTransformParameters(state);

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(desired, state, this.parsedSettings.statefulParameters)
    const {
      allParameters,
      allNonStatefulParameters,
      allStatefulParameters,
    } = parsedConfig;

    // Refresh resource parameters. This refreshes the parameters that configure the resource itself
    const currentArray = await this.refreshNonStatefulParameters(allNonStatefulParameters);

    // Short circuit here. If the resource is non-existent, there's no point checking stateful parameters
    if (currentArray === null
      || currentArray === undefined
      || this.settings.allowMultiple // Stateful parameters are not supported currently if allowMultiple is true
      || currentArray.length === 0
      || currentArray.filter(Boolean).length === 0
    ) {
      return Plan.calculate({
        desired,
        currentArray,
        state,
        core,
        settings: this.parsedSettings,
        isStateful,
      });
    }

    // Refresh stateful parameters. These parameters have state external to the resource. allowMultiple
    // does not work together with stateful parameters
    const statefulCurrentParameters = await this.refreshStatefulParameters(allStatefulParameters, allParameters);

    return Plan.calculate({
      desired,
      currentArray: [{ ...currentArray[0], ...statefulCurrentParameters }] as Partial<T>[],
      state,
      core,
      settings: this.parsedSettings,
      isStateful
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

  async import(
    core: ResourceConfig,
    parameters: Partial<T>
  ): Promise<Array<ResourceJson> | null> {
    this.addDefaultValues(parameters);
    await this.applyTransformParameters(parameters);

    // Use refresh parameters if specified, otherwise try to refresh as many parameters as possible here
    const parametersToRefresh = this.settings.import?.refreshKeys
      ? {
        ...Object.fromEntries(
          this.settings.import?.refreshKeys.map((k) => [k, null])
        ),
        ...this.settings.import?.defaultRefreshValues,
        ...parameters,
      }
      : {
        ...Object.fromEntries(
          this.getAllParameterKeys().map((k) => [k, null])
        ),
        ...this.settings.import?.defaultRefreshValues,
        ...parameters,
      };

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(parametersToRefresh, null, this.parsedSettings.statefulParameters)
    const {
      allNonStatefulParameters,
      allStatefulParameters,
    } = parsedConfig;

    const currentParametersArray = await this.refreshNonStatefulParameters(allNonStatefulParameters);

    if (currentParametersArray === null
      || currentParametersArray === undefined
      || this.settings.allowMultiple // Stateful parameters are not supported currently if allowMultiple is true
      || currentParametersArray.filter(Boolean).length === 0
    ) {
      return currentParametersArray
          ?.map((r) => ({ core, parameters: r }))
        ?? null;
    }

    const statefulCurrentParameters = await this.refreshStatefulParameters(allStatefulParameters, parametersToRefresh);
    return [{ core, parameters: { ...currentParametersArray[0], ...statefulCurrentParameters } }];
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

  private async applyTransformParameters(config: Partial<T> | null): Promise<void> {
    if (!config) {
      return;
    }

    for (const [key, inputTransformation] of Object.entries(this.parsedSettings.inputTransformations)) {
      if (config[key] === undefined || !inputTransformation) {
        continue;
      }

      (config as Record<string, unknown>)[key] = await inputTransformation(config[key], this.settings.parameterSettings![key]!);
    }

    if (this.settings.inputTransformation) {
      const transformed = await this.settings.inputTransformation({ ...config })
      Object.keys(config).forEach((k) => delete config[k])
      Object.assign(config, transformed);
    }
  }

  private addDefaultValues(config: Partial<T> | null): void {
    if (!config) {
      return;
    }

    for (const [key, defaultValue] of Object.entries(this.parsedSettings.defaultValues)) {
      if (defaultValue !== undefined && (config[key] === undefined || config[key] === null)) {
        (config as Record<string, unknown>)[key] = defaultValue;
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

    await Promise.all(sortedEntries.map(async ([key, desiredValue]) => {
      const statefulParameter = this.parsedSettings.statefulParameters.get(key);
      if (!statefulParameter) {
        throw new Error(`Stateful parameter ${key} was not found`);
      }

      (result as Record<string, unknown>)[key] = await statefulParameter.refresh(desiredValue ?? null, allParameters)
    }))

    return result;
  }

  private validatePlanInputs(
    core: ResourceConfig,
    desired: Partial<T> | null,
    current: Partial<T> | null,
    isStateful: boolean,
  ) {
    if (!core || !core.type) {
      throw new Error('Core parameters type must be defined');
    }

    if (!desired && !current) {
      throw new Error('Desired config and current config cannot both be missing')
    }

    if (!isStateful && !desired) {
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

  private getAllParameterKeys(): string[] {
    return this.settings.schema
      ? Object.keys((this.settings.schema as any)?.properties)
      : Object.keys(this.parsedSettings.parameterSettings);
  }
}

