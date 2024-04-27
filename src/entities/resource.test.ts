import { Resource } from './resource.js';
import { ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { spy } from 'sinon';
import { Plan } from './plan.js';
import { describe, expect, it } from 'vitest'
import { ResourceConfiguration, ValidationResult } from './resource-types.js';

export interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

export class TestResource extends Resource<TestConfig> {
  constructor(options: ResourceConfiguration<TestConfig>) {
    super(options);
  }

  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }

  async validate(config: unknown): Promise<ValidationResult> {
    return {
      isValid: true
    }
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

  it('handles empty parameters', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'type' });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.plan({ type: 'type' })

    expect(result.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(result.changeSet.parameterChanges.length).to.eq(0);
  })

  it('chooses the create apply properly', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.create<TestConfig>(
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
      Plan.create<TestConfig>(
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
      Plan.create<TestConfig>(
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
});
