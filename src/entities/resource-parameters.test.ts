import { describe, expect, it } from 'vitest';
import { StatefulParameter, StatefulParameterConfiguration } from './stateful-parameter.js';
import { Plan } from './plan.js';
import { spy } from 'sinon';
import { ResourceOperation } from 'codify-schemas';
import { TestConfig, TestResource } from './resource.test.js';

class TestParameter extends StatefulParameter<TestConfig, string> {
  constructor(configuration?: StatefulParameterConfiguration<TestConfig>) {
    super(configuration ?? {
      name: 'propA'
    })
  }

  applyAdd(valueToAdd: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }
  applyModify(newValue: string, previousValue: string, allowDeletes: boolean, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }
  applyRemove(valueToRemove: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }
  async refresh(): Promise<string | null> {
    return '';
  }
}

describe('Resource parameters tests', () => {
  it('supports the creation of stateful parameters', async () => {

    const statefulParameter = new class extends TestParameter {
      async refresh(): Promise<string | null> {
        return null;
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {

      constructor() {
        super({
          type: 'resource',
          statefulParameters: [statefulParameterSpy],
        });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create<TestConfig>(
        { propA: 'a', propB: 0, propC: 'b' },
        null,
        { type: 'resource' },
        { statefulMode: false },
      )
    );

    expect(statefulParameterSpy.applyAdd.calledOnce).to.be.true;
    expect(resourceSpy.applyCreate.calledOnce).to.be.true;
  })

  it('supports the modification of stateful parameters', async () => {
    const statefulParameter = new class extends TestParameter {
      async refresh(): Promise<string | null> {
        return 'b';
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {

      constructor() {
        super({
          type: 'resource',
          statefulParameters: [statefulParameterSpy],
          parameterConfigurations: {
            propB: { planOperation: ResourceOperation.MODIFY },
          }
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return { propB: -1, propC: 'b' }
      }
    }

    const plan = await resource.plan({ type: 'resource', propA: 'a', propB: 0, propC: 'b' })

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(plan);

    expect(statefulParameterSpy.applyModify.calledOnce).to.be.true;
    expect(resourceSpy.applyModify.calledOnce).to.be.true;
  })

  it('Filters array results in stateless mode to prevent modify from being called', async () => {
    const statefulParameter = new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return ['a', 'b', 'c', 'd']
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          statefulParameters: [statefulParameterSpy],
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    }

    const plan = await resource.plan({ type: 'resource', propA: ['a', 'b'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.NOOP,
      }
    })
  })

  it('Filters array results in stateless mode to prevent modify from being called', async () => {
    const statefulParameter = new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return ['a', 'b']
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          statefulParameters: [statefulParameterSpy],
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    }

    const plan = await resource.plan({ type: 'resource', propA: ['a', 'b', 'c', 'd'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.MODIFY,
      }
    })
  })
})
