import { describe, expect, it } from 'vitest';
import { ArrayStatefulParameter, StatefulParameter, StatefulParameterSetting } from './stateful-parameter.js';
import { Plan } from '../plan/plan.js';
import { spy } from 'sinon';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { TransformParameter } from './transform-parameter.js';
import { TestConfig, TestResource } from '../utils/test-utils.test.js';

export class TestParameter extends StatefulParameter<TestConfig, string> {
  constructor(options?: StatefulParameterSetting<string>) {
    super(options ?? {})
  }

  add(valueToAdd: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }

  modify(newValue: string, previousValue: string, allowDeletes: boolean, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }

  remove(valueToRemove: string, plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve();
  }
  async refresh(): Promise<string | null> {
    return '';
  }
}

describe('Resource parameter tests', () => {
  it ('Generates a resource plan that includes stateful parameters (create)', async () => {
    const statefulParameter = spy(new class extends TestParameter {
      async refresh(): Promise<string | null> {
        return null;
      }
    })

    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          parameterOptions: {
            propA: { statefulParameter }
          },
        });
      }

      async refresh(): Promise<any> {
        return null;
      }
    }

    const plan = await resource.plan({
      type: 'resource',
      propA: 'a',
      propB: 10
    })

    expect(statefulParameter.refresh.notCalled).to.be.true;
    expect(plan.currentConfig).to.be.null;
    expect(plan.desiredConfig).toMatchObject({
      type: 'resource',
      propA: 'a',
      propB: 10
    })
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
  })

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
          parameterOptions: {
            propA: { statefulParameter: statefulParameterSpy }
          },
        });
      }
    }

    const resourceSpy = spy(resource);
    const result = await resourceSpy.apply(
      Plan.calculate<TestConfig>(
        { propA: 'a', propB: 0, propC: 'b' },
        null,
        { type: 'resource' },
        { statefulMode: false },
      )
    );

    expect(statefulParameterSpy.add.calledOnce).to.be.true;
    expect(resourceSpy.create.calledOnce).to.be.true;
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
          parameterOptions: {
            propA: { statefulParameter: statefulParameterSpy },
            propB: { modifyOnChange: true },
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

    expect(statefulParameterSpy.modify.calledOnce).to.be.true;
    expect(resourceSpy.modify.calledOnce).to.be.true;
  })

  it('Allows stateful parameters to have default values', async () => {
    const statefulParameter = spy(new class extends TestParameter {
      constructor() {
        super({
          default: 'abc'
        });
      }

      async refresh(): Promise<string | null> {
        return null;
      }
    });

    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          parameterOptions: {
            propA: { statefulParameter }
          },
        });
      }

      async refresh(): Promise<any> {
        return null;
      }
    }

    const plan = await resource.plan({
      type: 'resource',
    })

    expect(statefulParameter.refresh.notCalled).to.be.true;
    expect(plan.currentConfig).to.be.null;
    expect(plan.desiredConfig).toMatchObject({
      type: 'resource',
      propA: 'abc',
    })
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
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
          parameterOptions: {
            propA: { statefulParameter: statefulParameterSpy },
          },
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
          parameterOptions: {
            propA: { statefulParameter: statefulParameterSpy }
          },
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
          parameterOptions: {
            propA: { statefulParameter: statefulParameterSpy }
          },
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

  it('Plans stateful parameters in the order specified', async () => {
    const statefulParameterA = spy(new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterB = spy(new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterC = spy(new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterD = spy(new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterE = spy(new class extends TestParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          parameterOptions: {
            propA: { statefulParameter: statefulParameterA, order: 3},
            propB: { statefulParameter: statefulParameterB, order: 1 },
            propC: { statefulParameter: statefulParameterC, order: 2 },
            propD: { statefulParameter: statefulParameterD },
            propE: { statefulParameter: statefulParameterE }
          },
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    });

    const plan = await resource.plan({
      type: 'resourceType',
      propA: 'propA',
      propB: 10,
      propC: 'propC',
      propD: 'propD',
      propE: 'propE',
    });

    expect(plan.currentConfig?.propB).to.be.lessThan(plan.currentConfig?.propC as any);
    expect(plan.currentConfig?.propC).to.be.lessThan(plan.currentConfig?.propA as any);
    expect(plan.currentConfig?.propA).to.be.lessThan(plan.currentConfig?.propD as any);
    expect(plan.currentConfig?.propD).to.be.lessThan(plan.currentConfig?.propE as any);
  })

  it('Applies stateful parameters in the order specified', async () => {
    let timestampA;
    const statefulParameterA = spy(new class extends TestParameter {
      add = async (): Promise<void> => {
        timestampA = performance.now();
      }
      modify = async (): Promise<void> => {
        timestampA = performance.now();
      }
      remove = async (): Promise<void> => {
        timestampA = performance.now();
      }
    });

    let timestampB
    const statefulParameterB = spy(new class extends TestParameter {
      add = async (): Promise<void> => {
        timestampB = performance.now();
      }
      modify = async (): Promise<void> => {
        timestampB = performance.now();
      }
      remove = async (): Promise<void> => {
        timestampB = performance.now();
      }
    });

    let timestampC
    const statefulParameterC = spy(new class extends TestParameter {
      add = async (): Promise<void> => {
        timestampC = performance.now();
      }
      modify = async (): Promise<void> => {
        timestampC = performance.now();
      }
      remove = async (): Promise<void> => {
        timestampC = performance.now();
      }
    });

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          parameterOptions: {
            propA: { statefulParameter: statefulParameterA, order: 3},
            propB: { statefulParameter: statefulParameterB, order: 1 },
            propC: { statefulParameter: statefulParameterC, order: 2 },
          },
          callStatefulParameterRemoveOnDestroy: true,
        });
      }
    });

    await resource.apply(
      Plan.fromResponse({
        resourceType: 'resourceType',
        operation: ResourceOperation.CREATE,
        parameters: [
          { name: 'propA', operation: ParameterOperation.ADD, previousValue: null, newValue: null },
          { name: 'propB', operation: ParameterOperation.ADD, previousValue: null, newValue: null },
          { name: 'propC', operation: ParameterOperation.ADD, previousValue: null, newValue: null },
        ]
      }, {}) as any
    );

    expect(timestampB).to.be.lessThan(timestampC as any);
    expect(timestampC).to.be.lessThan(timestampA as any);
    timestampA = 0;
    timestampB = 0;
    timestampC = 0;

    await resource.apply(
      Plan.fromResponse({
        resourceType: 'resourceType',
        operation: ResourceOperation.MODIFY,
        parameters: [
          { name: 'propA', operation: ParameterOperation.MODIFY, previousValue: null, newValue: null },
          { name: 'propB', operation: ParameterOperation.MODIFY, previousValue: null, newValue: null },
          { name: 'propC', operation: ParameterOperation.MODIFY, previousValue: null, newValue: null },
        ]
      }, {}) as any
    );

    expect(timestampB).to.be.lessThan(timestampC as any);
    expect(timestampC).to.be.lessThan(timestampA as any);
    timestampA = 0;
    timestampB = 0;
    timestampC = 0;

    await resource.apply(
      Plan.fromResponse({
        resourceType: 'resourceType',
        operation: ResourceOperation.DESTROY,
        parameters: [
          { name: 'propA', operation: ParameterOperation.REMOVE, previousValue: null, newValue: null },
          { name: 'propB', operation: ParameterOperation.REMOVE, previousValue: null, newValue: null },
          { name: 'propC', operation: ParameterOperation.REMOVE, previousValue: null, newValue: null },
        ]
      }, {}) as any
    );

    expect(timestampB).to.be.lessThan(timestampC as any);
    expect(timestampC).to.be.lessThan(timestampA as any);
    timestampA = 0;
    timestampB = 0;
    timestampC = 0;

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
          parameterOptions: {
            propC: { transformParameter }
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
    expect(resource.refresh.getCall(0).firstArg['propA']).to.exist;
    expect(resource.refresh.getCall(0).firstArg['propB']).to.exist;
    expect(resource.refresh.getCall(0).firstArg['propC']).to.not.exist;

    expect(plan.desiredConfig?.propA).to.eq('propA');
    expect(plan.desiredConfig?.propB).to.eq(10);
    expect(plan.desiredConfig?.propC).to.be.undefined;

    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })

  it('Does not call transform parameters unless they are specified in the user config', async () => {
    const transformParameter = spy(new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
        return {
          propA: 'propA',
          propB: 10,
        }
      }
    })

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          parameterOptions: {
            propC: { transformParameter }
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

    const plan = await resource.plan({ type: 'resourceType', propA: 'propA', propB: 10 } as any);

    expect(transformParameter.transform.called).to.be.false;
    expect(resource.refresh.getCall(0).firstArg['propA']).to.exist;
    expect(resource.refresh.getCall(0).firstArg['propB']).to.exist;

    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })

  it('Plans transform parameters in the order specified', async () => {
    const transformParameterA = spy(new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
          return { propD: performance.now() as any }
      }
    });

    const transformParameterB = spy(new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
        return { propE: performance.now() }
      }
    });

    const transformParameterC = spy(new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
        return { propF: performance.now() as any }
      }
    });

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          parameterOptions: {
            propA: { transformParameter: transformParameterA, order: 3},
            propB: { transformParameter: transformParameterB, order: 1 },
            propC: { transformParameter: transformParameterC, order: 2 },
          },
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return { propD: 'propD', propE: 10, propF: 'propF' };
      }
    });

    const plan = await resource.plan({
      type: 'resourceType',
      propA: 'propA',
      propB: 10,
      propC: 'propC',
    });

    expect(plan.desiredConfig?.propE).to.be.lessThan(plan.desiredConfig?.propF as any);
    expect(plan.desiredConfig?.propF).to.be.lessThan(plan.desiredConfig?.propD as any);
  })

  it('Plans transform even for creating new resources', async () => {
    const transformParameterA = spy(new class extends TransformParameter<TestConfig> {
      async transform(value: any): Promise<Partial<TestConfig>> {
        return { propD: 'abc', propE: 10 }
      }
    });

    const resource = spy(new class extends TestResource {
      constructor() {
        super({
          type: 'resourceType',
          parameterOptions: {
            propA: { transformParameter: transformParameterA },
          },
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    });

    const plan = await resource.plan({
      type: 'resourceType',
      propA: 'propA',
      propB: 10,
      propC: 'propC',
    });
    expect(plan.currentConfig).to.be.null;
    expect(plan.desiredConfig).toMatchObject({
      type: 'resourceType',
      propD: 'abc',
      propE: 10,
    })
  })
})
