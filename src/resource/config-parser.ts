import { ResourceConfig, StringIndexedObject } from 'codify-schemas';

import { splitUserConfig } from '../utils/utils.js';
import { StatefulParameter } from './stateful-parameter.js';

export class ConfigParser<T extends StringIndexedObject> {
  private desiredConfig: Partial<T> & ResourceConfig | null;
  private stateConfig: Partial<T> & ResourceConfig | null;
  private statefulParametersMap: Map<keyof T, StatefulParameter<T, T[keyof T]>>;

  constructor(
    desiredConfig: Partial<T> & ResourceConfig | null,
    stateConfig: Partial<T> & ResourceConfig | null,
    statefulParameters: Map<keyof T, StatefulParameter<T, T[keyof T]>>,
  ) {
    this.desiredConfig = desiredConfig;
    this.stateConfig = stateConfig
    this.statefulParametersMap = statefulParameters;
  }

  get coreParameters(): ResourceConfig {
    const desiredCoreParameters = this.desiredConfig ? splitUserConfig(this.desiredConfig).coreParameters : undefined;
    const currentCoreParameters = this.stateConfig ? splitUserConfig(this.stateConfig).coreParameters : undefined;

    if (!desiredCoreParameters && !currentCoreParameters) {
      throw new Error(`Unable to parse resource core parameters from:
       
 Desired: ${JSON.stringify(this.desiredConfig, null, 2)}
  
 Current: ${JSON.stringify(this.stateConfig, null, 2)}`)
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

  get stateParameters(): Partial<T> | null {
    if (!this.stateConfig) {
      return null;
    }

    const { parameters } = splitUserConfig(this.stateConfig);
    return parameters;
  }


  get allParameters(): Partial<T> {
    return { ...this.desiredParameters, ...this.stateParameters } as Partial<T>;
  }

  get allNonStatefulParameters(): Partial<T> {
    const {
      allParameters,
      statefulParametersMap,
    } = this;

    return Object.fromEntries(
      Object.entries(allParameters).filter(([key]) => !statefulParametersMap.has(key))
    ) as Partial<T>;
  }

  get allStatefulParameters(): Partial<T> {
    const { allParameters, statefulParametersMap } = this;

    return Object.fromEntries(
      Object.entries(allParameters).filter(([key]) => statefulParametersMap.has(key))
    ) as Partial<T>;
  }
}
