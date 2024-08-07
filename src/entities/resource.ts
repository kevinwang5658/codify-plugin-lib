import { Ajv, ValidateFunction } from 'ajv';
import {
  ParameterOperation,
  ResourceConfig,
  ResourceOperation,
  StringIndexedObject,
  ValidateResponseData,
} from 'codify-schemas';

import { setsEqual, splitUserConfig } from '../utils/utils.js';
import { ParameterChange } from './change-set.js';
import { Plan } from './plan.js';
import { CreatePlan, DestroyPlan, ModifyPlan, ParameterOptions, PlanOptions } from './plan-types.js';
import { ResourceOptions, ResourceOptionsParser } from './resource-options.js';
import { ResourceParameterOptions } from './resource-types.js';
import { StatefulParameter } from './stateful-parameter.js';
import { TransformParameter } from './transform-parameter.js';

/**
 * Description of resource here
 * Two main functions:
 * - Plan
 * - Apply
 *
 */
export abstract class Resource<T extends StringIndexedObject> {
  readonly typeId: string;
  readonly statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>;
  readonly transformParameters: Map<keyof T, TransformParameter<T>>
  readonly resourceParameters: Map<keyof T, ResourceParameterOptions>;

  readonly statefulParameterOrder: Map<keyof T, number>;
  readonly transformParameterOrder: Map<keyof T, number>;

  readonly dependencies: string[]; // TODO: Change this to a string
  readonly parameterOptions: Record<keyof T, ParameterOptions>
  readonly options: ResourceOptions<T>;
  readonly defaultValues: Partial<Record<keyof T, unknown>>;

  protected ajv?: Ajv;
  protected schemaValidator?: ValidateFunction;

  protected constructor(options: ResourceOptions<T>) {
    this.typeId = options.type;
    this.dependencies = options.dependencies ?? [];
    this.options = options;

    if (this.options.schema) {
      this.ajv = new Ajv({
        allErrors: true,
        strict: true,
        strictRequired: false,
      })
      this.schemaValidator = this.ajv.compile(this.options.schema);
    }

    const parser = new ResourceOptionsParser<T>(options);
    this.statefulParameters = parser.statefulParameters;
    this.transformParameters = parser.transformParameters;
    this.resourceParameters = parser.resourceParameters;
    this.parameterOptions = parser.changeSetParameterOptions;
    this.defaultValues = parser.defaultValues;
    this.statefulParameterOrder = parser.statefulParameterOrder;
    this.transformParameterOrder = parser.transformParameterOrder;
  }

  async onInitialize(): Promise<void> {}

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
      await this.customValidation(parameters);
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

  // TODO: Currently stateful mode expects that the currentConfig does not need any additional transformations (default and transform parameters)
  //   This may change in the future?
  async plan(
    desiredConfig: Partial<T> & ResourceConfig | null,
    currentConfig: Partial<T> & ResourceConfig | null = null,
    statefulMode = false,
  ): Promise<Plan<T>> {
    this.validatePlanInputs(desiredConfig, currentConfig, statefulMode);

    const planOptions: PlanOptions<T> = {
      parameterOptions: this.parameterOptions,
      statefulMode,
    }

    this.addDefaultValues(desiredConfig);
    await this.applyTransformParameters(desiredConfig);

    // Parse data from the user supplied config
    const parsedConfig = new ConfigParser(desiredConfig, currentConfig, this.statefulParameters, this.transformParameters)
    const {
      desiredParameters,
      nonStatefulParameters,
      resourceMetadata,
      statefulParameters,
    } = parsedConfig;

    // Refresh resource parameters. This refreshes the parameters that configure the resource itself
    const currentParameters = await this.refreshNonStatefulParameters(nonStatefulParameters);

    // Short circuit here. If the resource is non-existent, there's no point checking stateful parameters
    if (currentParameters === null || currentParameters === undefined) {
      return Plan.create(
        desiredParameters,
        null,
        resourceMetadata,
        planOptions,
      );
    }

    // Refresh stateful parameters. These parameters have state external to the resource
    const statefulCurrentParameters = await this.refreshStatefulParameters(statefulParameters, planOptions.statefulMode);

    return Plan.create(
      desiredParameters,
      { ...currentParameters, ...statefulCurrentParameters } as Partial<T>,
      resourceMetadata,
      planOptions,
    )
  }

  async apply(plan: Plan<T>): Promise<void> {
    if (plan.getResourceType() !== this.typeId) {
      throw new Error(`Internal error: Plan set to wrong resource during apply. Expected ${this.typeId} but got: ${plan.getResourceType()}`);
    }

    switch (plan.changeSet.operation) {
      case ResourceOperation.CREATE: {
        return this._applyCreate(plan); // TODO: Add new parameters value so that apply
      }

      case ResourceOperation.MODIFY: {
        return this._applyModify(plan);
      }

      case ResourceOperation.RECREATE: {
        await this._applyDestroy(plan);
        return this._applyCreate(plan);
      }

      case ResourceOperation.DESTROY: {
        return this._applyDestroy(plan);
      }
    }
  }

  private async _applyCreate(plan: Plan<T>): Promise<void> {
    await this.applyCreate(plan as CreatePlan<T>);

    const statefulParameterChanges = plan.changeSet.parameterChanges
      .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
      await statefulParameter.applyAdd(parameterChange.newValue, plan);
    }
  }

  private async _applyModify(plan: Plan<T>): Promise<void> {
    const parameterChanges = plan
      .changeSet
      .parameterChanges
      .filter((c: ParameterChange<T>) => c.operation !== ParameterOperation.NOOP);

    const statelessParameterChanges = parameterChanges
      .filter((pc: ParameterChange<T>) => !this.statefulParameters.has(pc.name))

    for (const pc of statelessParameterChanges) {
      // TODO: When stateful mode is added in the future. Dynamically choose if deletes are allowed
      await this.applyModify(pc, plan as ModifyPlan<T>);
    }

    const statefulParameterChanges = parameterChanges
      .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
      .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

    for (const parameterChange of statefulParameterChanges) {
      const statefulParameter = this.statefulParameters.get(parameterChange.name)!;

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

  private async _applyDestroy(plan: Plan<T>): Promise<void> {
    // If this option is set (defaults to false), then stateful parameters need to be destroyed
    // as well. This means that the stateful parameter wouldn't have been normally destroyed with applyDestroy()
    if (this.options.callStatefulParameterRemoveOnDestroy) {
      const statefulParameterChanges = plan.changeSet.parameterChanges
        .filter((pc: ParameterChange<T>) => this.statefulParameters.has(pc.name))
        .sort((a, b) => this.statefulParameterOrder.get(a.name)! - this.statefulParameterOrder.get(b.name)!)

      for (const parameterChange of statefulParameterChanges) {
        const statefulParameter = this.statefulParameters.get(parameterChange.name)!;
        await statefulParameter.applyRemove(parameterChange.previousValue, plan);
      }
    }

    await this.applyDestroy(plan as DestroyPlan<T>);
  }

  private validateRefreshResults(refresh: Partial<T> | null, desired: Partial<T>) {
    if (!refresh) {
      return;
    }

    const desiredKeys = new Set(Object.keys(refresh)) as Set<keyof T>;
    const refreshKeys = new Set(Object.keys(refresh)) as Set<keyof T>;

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

    const transformParameters = [...this.transformParameters.entries()]
      .sort(([keyA], [keyB]) => this.transformParameterOrder.get(keyA)! - this.transformParameterOrder.get(keyB)!)

    for (const [key, transformParameter] of transformParameters) {
      if (desired[key] === undefined) {
        continue;
      }

      const transformedValue = await transformParameter.transform(desired[key]);

      if (Object.keys(transformedValue).some((k) => desired[k] !== undefined)) {
        throw new Error(`Transform parameter ${key as string} is attempting to override existing values ${JSON.stringify(transformedValue, null, 2)}`);
      }

      // Remove original transform parameter from the config
      delete desired[key];

      // Add the new transformed values
      for (const [tvKey, tvValue] of Object.entries(transformedValue)) {
        // @ts-ignore
        desired[tvKey] = tvValue;
      }
    }
  }

  private addDefaultValues(desired: Partial<T> | null): void {
    if (!desired) {
      return;
    }

    for (const [key, defaultValue] of Object.entries(this.defaultValues)) {
        if (defaultValue !== undefined && desired[key as any] === undefined) {
          // @ts-ignore
          desired[key] = defaultValue;
        }
      }
  }

  private async refreshNonStatefulParameters(resourceParameters: Partial<T>): Promise<Partial<T> | null> {
    const currentParameters = await this.refresh(resourceParameters);
    this.validateRefreshResults(currentParameters, resourceParameters);
    return currentParameters;
  }

  // Refresh stateful parameters
  // This refreshes parameters that are stateful (they can be added, deleted separately from the resource)
  private async refreshStatefulParameters(statefulParametersConfig: Partial<T>, isStatefulMode: boolean): Promise<Partial<T>> {
    const currentParameters: Partial<T> = {}
    const sortedEntries = Object.entries(statefulParametersConfig)
      .sort(([key1], [key2]) => this.statefulParameterOrder.get(key1)! - this.statefulParameterOrder.get(key2)!)

    for(const [key, desiredValue] of sortedEntries) {
      const statefulParameter = this.statefulParameters.get(key);
      if (!statefulParameter) {
        throw new Error(`Stateful parameter ${key} was not found`);
      }

      let currentValue = await statefulParameter.refresh(desiredValue ?? null);

      // In stateless mode, filter the refreshed parameters by the desired to ensure that no deletes happen
      // Otherwise the change set will pick up the extra keys from the current and try to delete them
      // This allows arrays within stateful parameters to be first class objects
      if (Array.isArray(currentValue)
        && Array.isArray(desiredValue)
        && !isStatefulMode
        && !statefulParameter.options.disableStatelessModeArrayFiltering
      ) {
        currentValue = currentValue.filter((c) => desiredValue?.some((d) => {
          const parameterOptions = statefulParameter.options as any;
          if (parameterOptions && parameterOptions.isElementEqual) {
            return parameterOptions.isElementEqual(d, c);
          }

          return d === c;
        })) as any;
      }

      // @ts-ignore
      currentParameters[key] = currentValue;
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

  /**
   * Add custom validation logic in-addition to the default schema validation.
   * In this method throw an error if the object did not validate. The message of the
   * error will be shown to the user.
   * @param parameters
   */
  async customValidation(parameters: Partial<T>): Promise<void> {};

  abstract refresh(parameters: Partial<T>): Promise<Partial<T> | null>;

  abstract applyCreate(plan: CreatePlan<T>): Promise<void>;

  async applyModify(pc: ParameterChange<T>, plan: ModifyPlan<T>): Promise<void> {};

  abstract applyDestroy(plan: DestroyPlan<T>): Promise<void>;
}

class ConfigParser<T extends StringIndexedObject> {
  private desiredConfig: Partial<T> & ResourceConfig | null;
  private currentConfig: Partial<T> & ResourceConfig | null;
  private statefulParametersMap: Map<keyof T, StatefulParameter<T, T[keyof T]>>;
  private transformParametersMap: Map<keyof T, TransformParameter<T>>;

  constructor(
    desiredConfig: Partial<T> & ResourceConfig | null,
    currentConfig: Partial<T> & ResourceConfig | null,
    statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>,
    transformParameters: Map<keyof T, TransformParameter<T>>,
  ) {
    this.desiredConfig = desiredConfig;
    this.currentConfig = currentConfig
    this.statefulParametersMap = statefulParameters;
    this.transformParametersMap = transformParameters;
  }

  get resourceMetadata(): ResourceConfig {
    const desiredMetadata = this.desiredConfig ? splitUserConfig(this.desiredConfig).resourceMetadata : undefined;
    const currentMetadata = this.currentConfig ? splitUserConfig(this.currentConfig).resourceMetadata : undefined;

    if (!desiredMetadata && !currentMetadata) {
      throw new Error(`Unable to parse resource metadata from ${this.desiredConfig}, ${this.currentConfig}`)
    }

    if (currentMetadata && desiredMetadata && (
        Object.keys(desiredMetadata).length !== Object.keys(currentMetadata).length
        || Object.entries(desiredMetadata).some(([key, value]) => currentMetadata[key] !== value)
    )) {
      throw new Error(`The metadata for the current config does not match the desired config. 
Desired metadata:
${JSON.stringify(desiredMetadata, null, 2)}

Current metadata:
${JSON.stringify(currentMetadata, null, 2)}`);
    }

    return desiredMetadata ?? currentMetadata!;
  }

  get desiredParameters(): Partial<T> | null {
    if (!this.desiredConfig) {
      return null;
    }

    const { parameters } = splitUserConfig(this.desiredConfig);
    return parameters;
  }


  get parameters(): Partial<T> {
    const desiredParameters = this.desiredConfig ? splitUserConfig(this.desiredConfig).parameters : undefined;
    const currentParameters = this.currentConfig ? splitUserConfig(this.currentConfig).parameters : undefined;

    return { ...desiredParameters, ...currentParameters } as Partial<T>;
  }

  get nonStatefulParameters(): Partial<T> {
    const { parameters } = this;

    return Object.fromEntries(
      Object.entries(parameters).filter(([key]) => !(this.statefulParametersMap.has(key) || this.transformParametersMap.has(key)))
    ) as Partial<T>;
  }

  get statefulParameters(): Partial<T> {
    const { parameters } = this;

    return Object.fromEntries(
      Object.entries(parameters).filter(([key]) => this.statefulParametersMap.has(key))
    ) as Partial<T>;
  }
}
