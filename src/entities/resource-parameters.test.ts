import { describe, expect, it } from 'vitest';
import { ArrayStatefulParameter, StatefulParameter, StatefulParameterConfiguration } from './stateful-parameter.js';
import { Plan } from './plan.js';
import { spy } from 'sinon';
import { ResourceOperation } from 'codify-schemas';
import { TestConfig, TestResource } from './resource.test.js';
import { TransformParameter } from './transform-parameter.js';

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

  it('Uses isElementEqual for stateless mode filtering if available', async () => {
    const statefulParameter = new class extends ArrayStatefulParameter<TestConfig, string> {
      constructor() {
        super({
          name: 'propA',
          isElementEqual: (desired, current) => current.includes(desired),
        });
      }

      async refresh(): Promise<any | null> {
        return ['3.11.9']
      }

      async applyAddItem(item: string, plan: Plan<TestConfig>): Promise<void> {}
      async applyRemoveItem(item: string, plan: Plan<TestConfig>): Promise<void> {}
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

    const plan = await resource.plan({ type: 'resource', propA: ['3.11'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.NOOP,
      }
    })
  })

  it('Supports transform parameters', async () => {
    const transformParameter = new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
        return {
          propA: 'propA',
          propB: 10,
        }
      }
    }

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          transformParameters: {
            propC: transformParameter
          },
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'propA',
          propB: 10,
        }
      }
    });

    const plan = await resource.plan({ type: 'resourceType', propC: 'abc' } as any);

    expect(resource.refresh.called).to.be.true;
    expect(resource.refresh.getCall(0).firstArg.has('propA')).to.be.true;
    expect(resource.refresh.getCall(0).firstArg.has('propB')).to.be.true;
    expect(resource.refresh.getCall(0).firstArg.has('propC')).to.be.false;

    expect(plan.desiredConfig.propA).to.eq('propA');
    expect(plan.desiredConfig.propB).to.eq(10);
    expect(plan.desiredConfig.propC).to.be.undefined;

    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })
})
