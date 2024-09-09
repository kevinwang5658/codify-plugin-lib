import { Resource } from './resource.js';
import { ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { spy } from 'sinon';
import { Plan } from '../plan/plan.js';
import { describe, expect, it } from 'vitest'
import { StatefulParameter } from './stateful-parameter.js';
import { ResourceOptions } from './resource-options.js';
import { CreatePlan, DestroyPlan, ModifyPlan } from '../plan/plan-types.js';
import { ParameterChange } from '../plan/change-set.js';

export interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

export class TestResource extends Resource<TestConfig> {
  constructor(options: ResourceOptions<TestConfig>) {
    super(options);
  }

  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
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

describe('Resource tests', () => {

  it('Plans successfully', async () => {
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
        null,
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
        null,
        { propA: 'a', propB: 0 },
        { type: 'resource' },
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
        { propA: 'a', propB: 0 },
        { propA: 'b', propB: -1 },
        { type: 'resource' },
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
          parameterOptions: {
            propA: { modifyOnChange: true },
            propB: { modifyOnChange: true },
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

  it('Validates the resource options correct (pass)', () => {
    const statefulParameter = new class extends StatefulParameter<TestConfig, string> {
      async refresh(): Promise<string | null> {
        return null;
      }

      applyAdd(valueToAdd: string, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }

      applyModify(newValue: string, previousValue: string, allowDeletes: boolean, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }

      applyRemove(valueToRemove: string, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }
    }

    expect(() => new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          dependencies: ['homebrew', 'python'],
          parameterOptions: {
            propA: { modifyOnChange: true },
            propB: { statefulParameter },
            propC: { isEqual: (a, b) => true },
          }
        });
      }
    }).to.not.throw;
  })

  it('Validates the resource options correct (fail)', () => {
    const statefulParameter = new class extends StatefulParameter<TestConfig, string> {
      async refresh(): Promise<string | null> {
        return null;
      }

      applyAdd(valueToAdd: string, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }

      applyModify(newValue: string, previousValue: string, allowDeletes: boolean, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }

      applyRemove(valueToRemove: string, plan: Plan<TestConfig>): Promise<void> {
        throw new Error('Method not implemented.');
      }
    }

    expect(() => new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          dependencies: ['homebrew', 'python'],
          parameterOptions: {
            propA: { modifyOnChange: true },
            propB: { statefulParameter },
            propC: { isEqual: (a, b) => true },
          }
        });
      }
    }).to.not.throw;
  })

  it('Allows default values to be added', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          parameterOptions: {
            propA: { default: 'propADefault' }
          }
        });
      }

      // @ts-ignore
      async refresh(desired: Partial<TestConfig>): Promise<Partial<TestConfig>> {
        expect(desired['propA']).to.be.eq('propADefault');

        return {
          propA: 'propAAfter'
        };
      }
    }

    const plan = await resource.plan({ type: 'resource' })
    expect(plan.currentConfig?.propA).to.eq('propAAfter');
    expect(plan.desiredConfig?.propA).to.eq('propADefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.RECREATE);
  })

  it('Allows default values to be added to both desired and current', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          parameterOptions: {
            propE: { default: 'propEDefault' }
          }
        });
      }

      async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig> | null> {
        expect(parameters['propE']).to.exist;

        return {
          propE: parameters['propE'],
        };
      }
    }

    const plan = await resource.plan({ type: 'resource' })
    expect(plan.currentConfig?.propE).to.eq('propEDefault');
    expect(plan.desiredConfig?.propE).to.eq('propEDefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })

  it('Allows default values to be added even when refresh returns null', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          parameterOptions: {
            propE: { default: 'propEDefault' }
          }
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }

    const plan = await resource.plan({ type: 'resource' })
    expect(plan.currentConfig).to.be.null
    expect(plan.desiredConfig!.propE).to.eq('propEDefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
  })

  it('Allows default values to be added (ignore default value if already present)', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          parameterOptions: {
            propA: { default: 'propADefault' }
          }
        });
      }

      // @ts-ignore
      async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig>> {
        expect(parameters['propA']).to.be.eq('propA');

        return {
          propA: 'propAAfter'
        };
      }
    }

    const plan = await resource.plan({ type: 'resource', propA: 'propA' })
    expect(plan.currentConfig?.propA).to.eq('propAAfter');
    expect(plan.desiredConfig?.propA).to.eq('propA');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.RECREATE);
  });

  it('Sets the default value properly on the resource', () => {
    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'type',
          parameterOptions: {
            propA: { default: 'propADefault' }
          }
        });
      }
    }

    expect(resource.defaultValues).to.deep.eq({
      propA: 'propADefault',
    })
  })

  it('Has the correct typing for applys', () => {
    const resource = new class extends Resource<TestConfig> {
      constructor() {
        super({ type: 'type' });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }

      async applyCreate(plan: CreatePlan<TestConfig>): Promise<void> {
        plan.desiredConfig.propA
      }

      async applyDestroy(plan: DestroyPlan<TestConfig>): Promise<void> {
        plan.currentConfig.propB
      }

      async applyModify(pc: ParameterChange<TestConfig>, plan: ModifyPlan<TestConfig>): Promise<void> {
        plan.desiredConfig.propA
        plan.currentConfig.propB
      }
    }
  })
});
