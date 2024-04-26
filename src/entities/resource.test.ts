import { Resource } from './resource.js';
import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { ChangeSet, ParameterChange } from './change-set.js';
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

  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyModify(parameterName: string, newValue: unknown, previousValue: unknown, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyRecreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
    return ResourceOperation.MODIFY;
  }

  async refresh(): Promise<TestConfig | null> {
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

      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async refresh(): Promise<TestConfig> {
        return {
          type: 'type',
          name: 'name',
          propA: "propABefore",
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
    expect(result.changeSet.parameterChanges[1]).to.deep.eq(  {
      name: 'propB',
      previousValue: 10,
      newValue: 10,
      operation: 'noop'
    })
  })

  it('calls calculateOperation for only modifications and recreates', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'type' });
      }

      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async refresh(): Promise<TestConfig> {
        return {
          type: 'type',
          name: 'name',
          propA: "propABefore",
          propB: 10,
          propC: 'somethingBefore'
        };
      }
    }

    const resourceSpy = spy(resource);
    await resourceSpy.plan({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
      propC: 'somethingAfter'
    })

    expect(resourceSpy.calculateOperation.calledTwice).to.be.true;
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
        new ChangeSet(ResourceOperation.CREATE, []),
        { type: 'resource', propA: 'a', propB: 0 }
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
        new ChangeSet(ResourceOperation.DESTROY, []),
        { type: 'resource', propA: 'a', propB: 0 }
      )
    )

    expect(resourceSpy.applyDestroy.calledOnce).to.be.true;
  })

  it('calls apply modify', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        new ChangeSet(ResourceOperation.MODIFY, [
          {
            name: 'propA',
            newValue: 'a',
            previousValue: 'b',
            operation: ParameterOperation.ADD,
          },
          {
            name: 'propB',
            newValue: 0,
            previousValue: -1,
            operation: ParameterOperation.ADD,
          },
        ]),
        { type: 'resource', propA: 'a', propB: 0 }
      )
    );

    expect(resourceSpy.applyModify.calledOnce).to.be.true;
  })

  it('supports the creation of stateful parameters', async () => {
    const statefulParameter = new class implements StatefulParameter<TestConfig, 'propA'> {

      applyAdd(valueToAdd: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }
      applyModify(newValue: 'propA', previousValue: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }
      applyRemove(valueToRemove: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }
      get name(): "propA" {
        return 'propA';
      }

      async refresh(): Promise<TestConfig["propA"]> {
        return '';
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {

      constructor() {
        super({
          type: 'resource',
          statefulParameters: {
            propA: statefulParameterSpy
          },
        });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        new ChangeSet(ResourceOperation.CREATE, [
          {
            name: 'propA',
            newValue: 'a',
            previousValue: null,
            operation: ParameterOperation.ADD,
          },
          {
            name: 'propB',
            newValue: 0,
            previousValue: null,
            operation: ParameterOperation.ADD,
          },
          {
            name: 'propC',
            newValue: 'b',
            previousValue: null,
            operation: ParameterOperation.ADD,
          },
        ]),
        { type: 'resource', propA: 'a', propB: 0, propC: 'b' }
      )
    );

    expect(statefulParameterSpy.applyAdd.calledOnce).to.be.true;
    expect(resourceSpy.applyCreate.calledOnce).to.be.true;
  })

  it('supports the modification of stateful parameters', async () => {
    const statefulParameter = new class implements StatefulParameter<TestConfig, 'propA'> {
      applyAdd(valueToAdd: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }

      applyModify(newValue: 'propA', previousValue: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }

      applyRemove(valueToRemove: 'propA', plan: Plan<TestConfig>): Promise<void> {
        return Promise.resolve();
      }

      get name(): "propA" {
        return 'propA';
      }

      async refresh(): Promise<TestConfig["propA"]> {
        return '';
      }
    }
    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {

      constructor() {
        super({
          type: 'resource',
          statefulParameters: {
            propA: statefulParameterSpy,
          },
        });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create(
        new ChangeSet(ResourceOperation.MODIFY, [
          {
            name: 'propA',
            newValue: 'a',
            previousValue: 'b',
            operation: ParameterOperation.MODIFY,
          },
          {
            name: 'propB',
            newValue: 0,
            previousValue: null,
            operation: ParameterOperation.ADD,
          },
          {
            name: 'propC',
            newValue: 'b',
            previousValue: 'b',
            operation: ParameterOperation.NOOP,
          },
        ]),
        { type: 'resource', propA: 'a', propB: 0, propC: 'b' }
      )
    );

    expect(statefulParameterSpy.applyModify.calledOnce).to.be.true;
    expect(resourceSpy.applyModify.calledOnce).to.be.true;
  })
})
