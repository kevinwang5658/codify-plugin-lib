import { ResourceConfig, StringIndexedObject } from 'codify-schemas';
import { ResourceSettings } from '../resource/resource-settings.js';
import { Plan } from '../plan/plan.js';
import { Resource } from '../resource/resource.js';
import { CreatePlan, DestroyPlan } from '../plan/plan-types.js';
import { StatefulParameter, StatefulParameterSetting } from '../resource/stateful-parameter.js';

export function testPlan<T extends StringIndexedObject>(params: {
  desired?: Partial<T> | null;
  current?: Partial<T>[] | null;
  state?: Partial<T> | null;
  core?: ResourceConfig;
  settings?: ResourceSettings<T>;
  statefulMode?: boolean;
}) {
  return Plan.calculate({
    desiredParameters: params.desired ?? null,
    currentParametersArray: params.current ?? null,
    stateParameters: params.state ?? null,
    coreParameters: params.core ?? { type: 'type' },
    settings: params.settings ?? { type: 'type' },
    statefulMode: params.statefulMode ?? false,
  })
}

export interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

export class TestResource extends Resource<TestConfig> {
  getSettings(): ResourceSettings<TestConfig> {
    return { type: 'type' }
  }

  create(plan: CreatePlan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  destroy(plan: DestroyPlan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }
}

export class TestStatefulParameter extends StatefulParameter<TestConfig, string> {
  getSettings(): StatefulParameterSetting {
    return {}
  }

  async refresh(desired: string | null): Promise<string | null> {
    return 'd';
  }

  async add(valueToAdd: string, plan: Plan<TestConfig>): Promise<void> {
    return;
  }

  async modify(newValue: string, previousValue: string, plan: Plan<TestConfig>): Promise<void> {
    return;
  }

  async remove(valueToRemove: string, plan: Plan<TestConfig>): Promise<void> {
    return;
  }
}
