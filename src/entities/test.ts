import { Plan } from './plan.js';
import { Resource } from './resource.js';
import { ResourceOperation } from 'codify-schemas';

interface TestConfig {
  propA: string,
  propB: number,
}

export class Test extends Resource<TestConfig> {
  constructor() {
    super({
      name: 'name',
      parameterOptions: {
        propA: {
          planOperation: ResourceOperation.MODIFY,
        },
        propB: {
        }
      }
    });
  }

  validate(config: unknown): Promise<string[] | undefined> {
    throw new Error('Method not implemented.');
  }
  getCurrentConfig(desiredConfig: TestConfig): Promise<TestConfig | null> {
    throw new Error('Method not implemented.');
  }
  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  applyModify(plan: Plan<TestConfig>): Promise<void> {
    throw new Error('Method not implemented.');
  }
  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
