import { describe, expect, it } from 'vitest';
import { Plan } from './plan.js';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { TestConfig, TestResource } from '../utils/test-utils.test.js';
import { ResourceController } from '../resource/resource-controller.js';
import { ParsedResourceSettings } from '../resource/parsed-resource-settings.js';
import { ResourceSettings } from '../resource/resource-settings.js';

describe('Plan entity tests', () => {
  it('Adds default values properly when plan is parsed from request (Create)', () => {
    const resource = createTestResource()
    const controller = new ResourceController(resource);

    const plan = Plan.fromResponse({
      operation: ResourceOperation.CREATE,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: 'propBValue'
      }],
      statefulMode: false,
    }, controller.parsedSettings.defaultValues);

    expect(plan.currentConfig).to.be.null;

    expect(plan.desiredConfig).toMatchObject({
      type: 'type',
      propA: 'defaultA',
      propB: 'propBValue',
    })

    expect(plan.changeSet.parameterChanges
      .every((pc) => pc.operation === ParameterOperation.ADD)
    ).to.be.true;
  })

  it('Adds default values properly when plan is parsed from request (Destroy)', () => {
    const resource = createTestResource()
    const controller = new ResourceController(resource);

    const plan = Plan.fromResponse({
      operation: ResourceOperation.DESTROY,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.REMOVE,
        previousValue: 'propBValue',
        newValue: null,
      }],
      statefulMode: false,
    }, controller.parsedSettings.defaultValues);

    expect(plan.currentConfig).toMatchObject({
      type: 'type',
      propA: 'defaultA',
      propB: 'propBValue',
    })

    expect(plan.desiredConfig).to.be.null;

    expect(plan.changeSet.parameterChanges
      .every((pc) => pc.operation === ParameterOperation.REMOVE)
    ).to.be.true;
  })

  it('Adds default values properly when plan is parsed from request (No-op)', () => {
    const resource = createTestResource()
    const controller = new ResourceController(resource);

    const plan = Plan.fromResponse({
      operation: ResourceOperation.NOOP,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.NOOP,
        previousValue: 'propBValue',
        newValue: 'propBValue',
      }],
      statefulMode: false,
    }, controller.parsedSettings.defaultValues);

    expect(plan.currentConfig).toMatchObject({
      type: 'type',
      propA: 'defaultA',
      propB: 'propBValue',
    })

    expect(plan.desiredConfig).toMatchObject({
      type: 'type',
      propA: 'defaultA',
      propB: 'propBValue',
    })

    expect(plan.changeSet.parameterChanges
      .every((pc) => pc.operation === ParameterOperation.NOOP)
    ).to.be.true;
  })

  it('Does not add default value if a value has already been specified', () => {
    const resource = createTestResource()
    const controller = new ResourceController(resource);

    const plan = Plan.fromResponse({
      operation: ResourceOperation.CREATE,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: 'propBValue',
      }, {
        name: 'propA',
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: 'propAValue',
      }],
      statefulMode: false,
    }, controller.parsedSettings.defaultValues);

    expect(plan.currentConfig).to.be.null

    expect(plan.desiredConfig).toMatchObject({
      type: 'type',
      propA: 'propAValue',
      propB: 'propBValue',
    })

    expect(plan.changeSet.parameterChanges
      .every((pc) => pc.operation === ParameterOperation.ADD)
    ).to.be.true;
  })

  it('Returns the original resource names', () => {
    const plan = Plan.calculate<TestConfig>({
      desiredParameters: { propA: 'propA' },
      currentParametersArray: [{ propA: 'propA2' }],
      stateParameters: null,
      coreParameters: {
        type: 'type',
        name: 'name1'
      },
      settings: new ParsedResourceSettings<TestConfig>({ id: 'type' }),
      statefulMode: false,
    });

    expect(plan.toResponse()).toMatchObject({
      resourceType: 'type',
      resourceName: 'name1',
      operation: ResourceOperation.RECREATE
    })
  })

  it('Filters array parameters in stateless mode (by default)', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<any> {
        return {
          id: 'type',
          parameterSettings: {
            propZ: { type: 'array', isElementEqual: (a, b) => b.includes(a) }
          }
        }
      }

      async refresh(): Promise<Partial<any> | null> {
        return {
          propZ: [
            '20.15.0',
            '20.15.1'
          ]
        }
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({
      propZ: ['20.15'],
    } as any)

    expect(plan.changeSet.operation).to.eq(ResourceOperation.NOOP);
  })

  it('Doesn\'t filters array parameters if filtering is disabled', async () => {
    const resource = new class extends TestResource {
      getSettings(): ResourceSettings<any> {
        return {
          id: 'type',
          parameterSettings: {
            propZ: {
              type: 'array',
              canModify: true,
              isElementEqual: (a, b) => b.includes(a),
              filterInStatelessMode: false
            }
          }
        }
      }

      async refresh(): Promise<Partial<any> | null> {
        return {
          propZ: [
            '20.15.0',
            '20.15.1'
          ]
        }
      }
    }

    const controller = new ResourceController(resource);
    const plan = await controller.plan({
      propZ: ['20.15'],
    } as any)

    expect(plan.changeSet).toMatchObject({
      operation: ResourceOperation.MODIFY,
      parameterChanges: expect.arrayContaining([
        expect.objectContaining({
          name: 'propZ',
          previousValue: expect.arrayContaining([
            '20.15.0',
            '20.15.1'
          ]),
          newValue: expect.arrayContaining([
            '20.15'
          ]),
          operation: 'modify'
        })
      ])
    })
  })
})

function createTestResource() {
  return new class extends TestResource {
    getSettings(): ResourceSettings<TestConfig> {
      return {
        id: 'type',
        parameterSettings: {
          propA: {
            default: 'defaultA'
          }
        }
      }
    }
  };
}
