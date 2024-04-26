import { Plan } from './plan.js';
import { Resource } from './resource.js';
import { ResourceConfig } from 'codify-schemas';

interface TestConfig extends ResourceConfig {
  propA: string;
  propB: string;
}

class Test extends Resource<TestConfig> {
    validate(config: unknown): Promise<string[] | undefined> {
        throw new Error('Method not implemented.');
    }

    async refresh(keys: Set<keyof TestConfig>): Promise<Partial<TestConfig> | null> {
      const result: any = {}
      if (keys.has('propA')) {
        result['propA'] = 'abc';
      }

      return result;
    }
    applyCreate(plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
    }
    applyModify(parameterName: keyof TestConfig, newValue: unknown, previousValue: unknown, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
    }
    applyDestroy(plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
    }

}
