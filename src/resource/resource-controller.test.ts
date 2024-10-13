import { Resource } from './resource.js';
import { ResourceOperation } from 'codify-schemas';
import { spy } from 'sinon';
import { describe, expect, it } from 'vitest'
import { ResourceSettings } from './resource-settings.js';
import { CreatePlan, DestroyPlan, ModifyPlan } from '../plan/plan-types.js';
import { ParameterChange } from '../plan/change-set.js';
import { ResourceController } from './resource-controller.js';
import { TestConfig, testPlan, TestResource, TestStatefulParameter } from '../utils/test-utils.test.js';
import { untildify } from '../utils/utils.js';

describe('Resource tests', () => {

  it('Validate applies transformations before validating', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          dependencies: ['homebrew', 'python'],
          parameterSettings: {
            propA: { canModify: true, inputTransformation: (input) => untildify(input) },
          },
          inputTransformation: (config) => ({ propA: config.propA, propC: config.propB }),
        }
      }

      async validate(parameters: Partial<TestConfig>): Promise<void> {
        expect(parameters.propA).to.not.include('~');
        expect(parameters.propB).to.not.exist;
        expect(parameters.propC).to.equal(10);
      }
    }

    const controller = new ResourceController(resource);
    await controller.validate({
      type: 'type',
      propA: '~/.tool_versions',
      propB: 10,
    })
  })

  it('Plans successfully', async () => {
    const resource = new class extends TestResource {

      async refresh(): Promise<TestConfig> {
        return {
          propA: 'propABefore',
          propB: 10,
        };
      }
    }

    const controller = new ResourceController(resource)

    const resourceSpy = spy(controller);
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
      async refresh(): Promise<TestConfig | null> {
        return null;
      }
    }
    const controller = new ResourceController(resource);

    const resourceSpy = spy(controller);
    const result = await resourceSpy.plan({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
      propC: 'somethingAfter'
    })

    console.log(result.changeSet.parameterChanges)

    expect(result.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(result.changeSet.parameterChanges.length).to.eq(3);
  })

  it('handles empty parameters', async () => {
    const resource = new class extends TestResource {
      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }
    const controller = new ResourceController(resource);

    const resourceSpy = spy(controller);
    const result = await resourceSpy.plan({ type: 'type' })

    expect(result.changeSet.operation).to.eq(ResourceOperation.CREATE);
    expect(result.changeSet.parameterChanges.length).to.eq(0);
  })

  it('chooses the create apply properly', async () => {
    const resource = new class extends TestResource {
    }
    const controller = new ResourceController(resource);

    const controllerSpy = spy(controller);
    const resourceSpy = spy(resource);

    await controllerSpy.apply(
      testPlan({
        desired: { propA: 'a', propB: 0 },
      })
    )

    expect(resourceSpy.create.calledOnce).to.be.true;
  })

  it('chooses the destroy apply properly', async () => {
    const resource = new class extends TestResource {
    }
    const controller = new ResourceController(resource);

    const controllerSpy = spy(controller);
    const resourceSpy = spy(resource);

    await controllerSpy.apply(
      testPlan({
        current: [{ propA: 'a', propB: 0 }],
        state: { propA: 'a', propB: 0 },
        statefulMode: true,
      })
    )

    expect(resourceSpy.destroy.calledOnce).to.be.true;
  })

  it('Defaults parameter changes to recreate', async () => {
    const resource = new class extends TestResource {
    }
    const controller = new ResourceController(resource);

    const controllerSpy = spy(controller);
    const resourceSpy = spy(resource);

    await controllerSpy.apply(
      testPlan({
        desired: { propA: 'a', propB: 0 },
        current: [{ propA: 'b', propB: -1 }],
        statefulMode: true
      })
    );

    expect(resourceSpy.destroy.calledOnce).to.be.true;
    expect(resourceSpy.create.calledOnce).to.be.true;
  })

  it('Allows modification of parameter behavior to allow modify for parameters', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'resource',
          parameterSettings: {
            propA: { canModify: true },
            propB: { canModify: true },
          }
        }
      }

      async refresh(): Promise<TestConfig | null> {
        return { propA: 'b', propB: -1 };
      }
    }
    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'resource', propA: 'a', propB: 0 })

    const resourceSpy = spy(resource);
    await controller.apply(
      plan
    );

    expect(resourceSpy.modify.calledTwice).to.be.true;
  })

  it('Validates the resource options correct (pass)', () => {
    const statefulParameter = new TestStatefulParameter();

    expect(() => new ResourceController(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          dependencies: ['homebrew', 'python'],
          parameterSettings: {
            propA: { canModify: true },
            propB: { type: 'stateful', definition: statefulParameter },
            propC: { isEqual: (a, b) => true },
          }
        }
      }
    })).to.not.throw;
  })

  it('Validates the resource options correct (fail)', () => {
    const statefulParameter = new class extends TestStatefulParameter {
      async refresh(desired: string | null): Promise<string | null> {
        return null;
      }
    }

    expect(() => new ResourceController(new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          dependencies: ['homebrew', 'python'],
          parameterSettings: {
            propA: { canModify: true },
            propB: { type: 'stateful', definition: statefulParameter },
            propC: { isEqual: (a, b) => true },
          }
        }
      }
    })).to.not.throw;
  })

  it('Allows default values to be added', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          parameterSettings: {
            propA: { default: 'propADefault' }
          }
        }
      }

      // @ts-ignore
      async refresh(desired: Partial<TestConfig>): Promise<Partial<TestConfig>> {
        expect(desired['propA']).to.be.eq('propADefault');

        return {
          propA: 'propAAfter'
        };
      }
    }
    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'resource' })
    expect(plan.currentConfig?.propA).to.eq('propAAfter');
    expect(plan.desiredConfig?.propA).to.eq('propADefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.RECREATE);
  })

  it('Allows default values to be added to both desired and current', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          parameterSettings: {
            propE: { default: 'propEDefault' }
          }
        }
      }

      async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig> | null> {
        expect(parameters['propE']).to.exist;

        return {
          propE: parameters['propE'],
        };
      }
    }
    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'resource' })
    expect(plan.currentConfig?.propE).to.eq('propEDefault');
    expect(plan.desiredConfig?.propE).to.eq('propEDefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })

  it('Allows default values to be added even when refresh returns null', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          parameterSettings: {
            propE: { default: 'propEDefault' }
          }
        }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }
    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'resource' })
    expect(plan.currentConfig).to.be.null
    expect(plan.desiredConfig!.propE).to.eq('propEDefault');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.CREATE);
  })

  it('Allows default values to be added (ignore default value if already present)', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          parameterSettings: {
            propA: { default: 'propADefault' }
          }
        }
      }

      // @ts-ignore
      async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig>> {
        expect(parameters['propA']).to.be.eq('propA');

        return {
          propA: 'propAAfter'
        };
      }
    }
    const controller = new ResourceController(resource);

    const plan = await controller.plan({ type: 'resource', propA: 'propA' })
    expect(plan.currentConfig?.propA).to.eq('propAAfter');
    expect(plan.desiredConfig?.propA).to.eq('propA');
    expect(plan.changeSet.operation).to.eq(ResourceOperation.RECREATE);
  });

  it('Sets the default value properly on the resource', () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<TestConfig> {
        return {
          id: 'type',
          parameterSettings: {
            propA: { default: 'propADefault' }
          }
        }
      }
    }
    const controller = new ResourceController(resource);

    expect(controller.parsedSettings.defaultValues).to.deep.eq({
      propA: 'propADefault',
    })
  })

  it('Has the correct typing for applys', () => {
    const resource = new class extends Resource<TestConfig> {
      getSettings(): ResourceSettings<TestConfig> {
        return { id: 'type' }
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }

      async create(plan: CreatePlan<TestConfig>): Promise<void> {
        plan.desiredConfig.propA
      }

      async destroy(plan: DestroyPlan<TestConfig>): Promise<void> {
        plan.currentConfig.propB
      }

      async modify(pc: ParameterChange<TestConfig>, plan: ModifyPlan<TestConfig>): Promise<void> {
        plan.desiredConfig.propA
        plan.currentConfig.propB
      }
    }
  })
});
