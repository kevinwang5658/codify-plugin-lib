import { describe } from 'mocha';
import { Resource } from './resource';
import { ResourceConfig, ResourceOperation } from '../../../../codify/codify-schemas';
import { ChangeSet, ParameterChange } from './change-set';
import { spy } from 'sinon';

interface TestConfig extends ResourceConfig {
  propA: string;
  propB: number;
}

describe('Resource tests', () => {
  let resource: Resource<TestConfig>;

  before(() => {
    resource = new class extends Resource<TestConfig> {
      applyCreate(changeSet: ChangeSet): Promise<void> {
        return Promise.resolve(undefined);
      }

      applyDestroy(changeSet: ChangeSet): Promise<void> {
        return Promise.resolve(undefined);
      }

      applyModify(changeSet: ChangeSet): Promise<void> {
        return Promise.resolve(undefined);
      }

      applyRecreate(changeSet: ChangeSet): Promise<void> {
        return Promise.resolve(undefined);
      }

      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async getCurrentConfig(): Promise<TestConfig> {
        return {
          type: 'type',
          name: 'name',
          propA: "propABefore",
          propB: 0,
        };
      }

      validate(config: ResourceConfig): Promise<boolean> {
        return Promise.resolve(false);
      }
    }
  })


  it('plans correctly', async () => {

    const planSpy = spy(resource, "plan");

    const result = await resource.plan({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
    })
  })
})
