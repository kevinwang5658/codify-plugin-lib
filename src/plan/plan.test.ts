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
      }]
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
      }]
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
      }]
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
      }]
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

  it('Returns the original resource names', async () => {
    const plan = await Plan.calculate<TestConfig>({
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
});


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
