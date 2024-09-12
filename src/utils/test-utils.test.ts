import { ResourceConfig, StringIndexedObject } from 'codify-schemas';
import { ResourceSettings } from '../resource/resource-settings.js';
import { Plan } from '../plan/plan.js';
import { Resource } from '../resource/resource.js';
import { CreatePlan, DestroyPlan } from '../plan/plan-types.js';
import { ArrayStatefulParameter, StatefulParameter } from '../resource/stateful-parameter.js';
import { ParsedResourceSettings } from '../resource/parsed-resource-settings.js';

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
    settings: params.settings ?
      new ParsedResourceSettings<T>(params.settings)
      : new ParsedResourceSettings<T>({ type: 'type' }),
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

export class TestArrayStatefulParameter extends ArrayStatefulParameter<TestConfig, string> {
  async refresh(): Promise<any | null> {
    return ['3.11.9']
  }

  addItem(item: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  removeItem(item: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }
}
