import { describe, expect, it } from 'vitest';
import { Plan } from '../plan/plan.js';
import { spy } from 'sinon';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import {
  TestArrayStatefulParameter,
  TestConfig,
  testPlan,
  TestResource,
  TestStatefulParameter
} from '../utils/test-utils.test.js';
import { ArrayParameterSetting, ParameterSetting, ResourceSettings } from './resource-settings.js';
import { ResourceController } from './resource-controller.js';

describe('Resource parameter tests', () => {
  it('Generates a resource plan that includes stateful parameters (create)', async () => {
    const statefulParameter = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<string | null> {
        return null;
      }
    })

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameter }
          },
        };
      }

      async refresh(): Promise<any> {
        return null;
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({
      type: 'type',
      propA: 'a',
      propB: 10
    })

    expect(statefulParameter.refresh.notCalled).to.be.true;
    expect(plan.currentConfig).to.be.null;
    expect(plan.desiredConfig).toMatchObject({
      type: 'type',
      propA: 'a',
      propB: 10
    })
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
  })

  it('supports the creation of stateful parameters', async () => {

    const statefulParameter = new class extends TestStatefulParameter {
      async refresh(): Promise<string | null> {
        return null;
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterSpy }
          },
        }
      }
    }

    const controller = new ResourceController(resource);
    const resourceSpy = spy(resource);

    await controller.apply(
      testPlan<TestConfig>({
        desired: { propA: 'a', propB: 0, propC: 'c' }
      })
    );

    expect(statefulParameterSpy.add.calledOnce).to.be.true;
    expect(resourceSpy.create.calledOnce).to.be.true;
  })

  it('supports the modification of stateful parameters', async () => {
    const statefulParameter = new class extends TestStatefulParameter {
      async refresh(): Promise<string | null> {
        return 'b';
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {

      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterSpy },
            propB: { canModify: true },
          }
        };
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return { propB: -1, propC: 'b' }
      }
    }

    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'type', propA: 'a', propB: 0, propC: 'b' })

    const resourceSpy = spy(resource);
    await controller.apply(plan);

    expect(statefulParameterSpy.modify.calledOnce).to.be.true;
    expect(resourceSpy.modify.calledOnce).to.be.true;
  })

  it('Allows stateful parameters to have default values', async () => {
    const statefulParameter = spy(new class extends TestStatefulParameter {
      getSettings(): ParameterSetting {
        return {
          default: 'abc'
        };
      }

      async refresh(): Promise<string | null> {
        return null;
      }
    });

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameter }
          },
        }
      }

      async refresh(): Promise<any> {
        return null;
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({
      type: 'type',
    })

    expect(statefulParameter.refresh.notCalled).to.be.true;
    expect(plan.currentConfig).to.be.null;
    expect(plan.desiredConfig).toMatchObject({
      type: 'type',
      propA: 'abc',
    })
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
  })

  it('Filters array results in stateless mode to prevent modify from being called', async () => {
    const statefulParameter = new class extends TestStatefulParameter {
      getSettings(): ParameterSetting {
        return { type: 'array' }
      }

      async refresh(): Promise<any | null> {
        return ['a', 'b', 'c', 'd']
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterSpy },
          },
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({ type: 'type', propA: ['a', 'b'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.NOOP,
      }
    })
  })

  it('Filters array results in stateless mode to prevent modify from being called 2', async () => {
    const statefulParameter = new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return ['a', 'b']
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterSpy }
          },
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({ type: 'type', propA: ['a', 'b', 'c', 'd'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.MODIFY,
      }
    })
  })

  it('Uses isElementEqual for stateless mode filtering if available', async () => {
    const statefulParameter = new class extends TestArrayStatefulParameter {
      getSettings(): ArrayParameterSetting {
        return {
          type: 'array',
          isElementEqual: (desired, current) => {
            return current.includes(desired)
          },
        }
      }

      async refresh(): Promise<any | null> {
        return ['3.11.9']
      }
    }

    const statefulParameterSpy = spy(statefulParameter);

    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'type',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterSpy }
          },
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({ type: 'type', propA: ['3.11'] } as any)

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.NOOP,
      }
    })
  })

  it('Plans stateful parameters in the order specified', async () => {
    const statefulParameterA = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterB = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterC = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterD = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const statefulParameterE = spy(new class extends TestStatefulParameter {
      async refresh(): Promise<any | null> {
        return performance.now()
      }
    });

    const resource = spy(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'resourceType',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterA, order: 3 },
            propB: { type: 'stateful', definition: statefulParameterB, order: 1 },
            propC: { type: 'stateful', definition: statefulParameterC, order: 2 },
            propD: { type: 'stateful', definition: statefulParameterD },
            propE: { type: 'stateful', definition: statefulParameterE }
          },
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {};
      }
    });

    const controller = new ResourceController(resource)
    const plan = await controller.plan({
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
    const statefulParameterA = spy(new class extends TestStatefulParameter {
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
    const statefulParameterB = spy(new class extends TestStatefulParameter {
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
    const statefulParameterC = spy(new class extends TestStatefulParameter {
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
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'resourceType',
          parameterSettings: {
            propA: { type: 'stateful', definition: statefulParameterA, order: 3 },
            propB: { type: 'stateful', definition: statefulParameterB, order: 1 },
            propC: { type: 'stateful', definition: statefulParameterC, order: 2 },
          },
          removeStatefulParametersBeforeDestroy: true,
        }
      }
    });

    const controller = new ResourceController(resource);
    await controller.apply(
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

    if (!timestampB || !timestampC || !timestampA) {
      throw new Error('Variable not initialized')
    }

    expect(timestampB).to.be.lessThan(timestampC as any);
    expect(timestampC).to.be.lessThan(timestampA as any);
    timestampA = 0;
    timestampB = 0;
    timestampC = 0;

    await controller.apply(
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

    await controller.apply(
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
  })

  it('Supports transform parameters', async () => {
    const resource = spy(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          type: 'resourceType',
          inputTransformation: (desired) => ({
            propA: 'propA',
            propB: 10,
          })
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'propA',
          propB: 10,
        }
      }
    });

    const controller = new ResourceController(resource);
    const plan = await controller.plan({ type: 'resourceType', propC: 'abc' } as any);

    expect(resource.refresh.called).to.be.true;
    expect(resource.refresh.getCall(0).firstArg['propA']).to.exist;
    expect(resource.refresh.getCall(0).firstArg['propB']).to.exist;
    expect(resource.refresh.getCall(0).firstArg['propC']).to.not.exist;

    expect(plan.desiredConfig?.propA).to.eq('propA');
    expect(plan.desiredConfig?.propB).to.eq(10);
    expect(plan.desiredConfig?.propC).to.be.undefined;

    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })
})
