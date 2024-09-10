import { ResourceConfig, StringIndexedObject } from 'codify-schemas';

import { splitUserConfig } from '../utils/utils.js';
import { StatefulParameter } from './stateful-parameter.js';

export class ConfigParser<T extends StringIndexedObject> {
  private desiredConfig: Partial<T> & ResourceConfig | null;
  private currentConfig: Partial<T> & ResourceConfig | null;
  private statefulParametersMap: Map<keyof T, StatefulParameter<T, T[keyof T]>>;

  constructor(
    desiredConfig: Partial<T> & ResourceConfig | null,
    currentConfig: Partial<T> & ResourceConfig | null,
    statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>,
  ) {
    this.desiredConfig = desiredConfig;
    this.currentConfig = currentConfig
    this.statefulParametersMap = statefulParameters;
  }

  get coreParameters(): ResourceConfig {
    const desiredCoreParameters = this.desiredConfig ? splitUserConfig(this.desiredConfig).resourceMetadata : undefined;
    const currentCoreParameters = this.currentConfig ? splitUserConfig(this.currentConfig).resourceMetadata : undefined;

    if (!desiredCoreParameters && !currentCoreParameters) {
      throw new Error(`Unable to parse resource core parameters from:
       
 Desired: ${JSON.stringify(this.desiredConfig, null, 2)}
  
 Current: ${JSON.stringify(this.currentConfig, null, 2)}`)
    }

    return desiredCoreParameters ?? currentCoreParameters!;
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
    const {
      parameters,
      statefulParametersMap,
    } = this;

    return Object.fromEntries(
      Object.entries(parameters).filter(([key]) => !statefulParametersMap.has(key))
    ) as Partial<T>;
  }

  get statefulParameters(): Partial<T> {
    const { parameters, statefulParametersMap } = this;

    return Object.fromEntries(
      Object.entries(parameters).filter(([key]) => statefulParametersMap.has(key))
    ) as Partial<T>;
  }
}
