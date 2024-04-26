import { Resource } from './resource.js';
import { ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { ParameterChange } from './change-set.js';
import { spy } from 'sinon';
import { Plan } from './plan.js';
import { StatefulParameter } from './stateful-parameter.js';
import { describe, expect, it } from 'vitest'
import { ResourceConfiguration } from './resource-types.js';

interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

class TestResource extends Resource<TestConfig> {
  constructor(options: ResourceConfiguration<TestConfig>) {
    super(options);
  }

  applyCreate(plan: Plan): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyModify(parameterName: string, newValue: unknown, previousValue: unknown, plan: Plan): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }

  async validate(config: unknown): Promise<string[] | undefined> {
    return undefined;
  }
}

describe('Resource tests', () => {
  it('plans correctly', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'type' });
      }

      async refresh(): Promise<TestConfig> {
        return {
          propA: 'propABefore',
          propB: 10,
        };
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.plan({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
    })

    expect(result.desiredConfig).to.deep.eq({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
    });
    expect(result.changeSet.operation).to.eq(ResourceOperation.RECREATE);
    expect(result.changeSet.parameterChanges[0]).to.deep.eq({
      name: 'propA',
      previousValue: 'propABefore',
      newValue: 'propA',
      operation: 'modify'
    })
    expect(result.changeSet.parameterChanges[1]).to.deep.eq({
      name: 'propB',
      previousValue: 10,
      newValue: 10,
      operation: 'noop'
    })
  })

  it('creates the resource if it doesnt exist', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'type' });
      }

      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async refresh(): Promise<TestConfig | null> {
        return null;
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.plan({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
      propC: 'somethingAfter'
    })

    expect(result.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(result.changeSet.parameterChanges.length).to.eq(3);
  })

  it('chooses the create apply properly', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        { type: 'resource', propA: 'a', propB: 0 },
        { type: 'resource' },
        { statefulMode: false },
      )
    )

    expect(resourceSpy.applyCreate.calledOnce).to.be.true;
  })

  it('chooses the destroy apply properly', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        { type: 'resource' },
        { type: 'resource', propA: 'a', propB: 0 },
        { statefulMode: true },
      )
    )

    expect(resourceSpy.applyDestroy.calledOnce).to.be.true;
  })

  it('Defaults parameter changes to recreate', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        { type: 'resource', propA: 'a', propB: 0 },
        { type: 'resource', propA: 'b', propB: -1 },
        { statefulMode: true },
      )
    );

    expect(resourceSpy.applyDestroy.calledOnce).to.be.true;
    expect(resourceSpy.applyCreate.calledOnce).to.be.true;
  })

  it('Allows modification of parameter behavior to allow modify for parameters', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          parameterConfigurations: {
            propA: { planOperation: ResourceOperation.MODIFY },
            propB: { planOperation: ResourceOperation.MODIFY },
          }
        });
      }

      async refresh(): Promise<TestConfig | null> {
        return { propA: 'b', propB: -1 };
      }
    }

    const plan = await resource.plan({ type: 'resource', propA: 'a', propB: 0 })

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      plan
    );

    expect(resourceSpy.applyModify.calledTwice).to.be.true;
  })

  it('supports the creation of stateful parameters', async () => {
    const statefulParameter = new class extends StatefulParameter<TestConfig, string> {
      constructor() {
        super({
          name: 'propA',
        })
      }

      applyAdd(valueToAdd: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
      applyModify(newValue: string, previousValue: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
      applyRemove(valueToRemove: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
      async refresh(): Promise<string | null> {
        return '';
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
      Plan.create(
        { type: 'resource', propA: 'a', propB: 0, propC: 'b' },
        null,
        { statefulMode: false },
      )
    );

    expect(statefulParameterSpy.applyAdd.calledOnce).to.be.true;
    expect(resourceSpy.applyCreate.calledOnce).to.be.true;
  })

  it('supports the modification of stateful parameters', async () => {
    const statefulParameter = new class extends StatefulParameter<TestConfig, string> {
      constructor() {
        super({
          name: 'propA',
        })
      }

      applyAdd(valueToAdd: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
      applyModify(newValue: string, previousValue: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
      applyRemove(valueToRemove: string, plan: Plan): Promise<void> {
        return Promise.resolve();
      }
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
})
