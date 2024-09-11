import { describe, expect, it } from 'vitest';
import { Plan } from './plan.js';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { Resource } from '../resource/resource.js';
import { TestResource } from '../utils/test-utils.test.js';

describe('Plan entity tests', () => {
  it('Adds default values properly when plan is parsed from request (Create)', () => {
    const resource = createResource();

    const plan = Plan.fromResponse({
      operation: ResourceOperation.CREATE,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.ADD,
        previousValue: null,
        newValue: 'propBValue'
      }]
    }, resource.defaultValues);

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
    const resource = createResource();

    const plan = Plan.fromResponse({
      operation: ResourceOperation.DESTROY,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.REMOVE,
        previousValue: 'propBValue',
        newValue: null,
      }]
    }, resource.defaultValues);

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
    const resource = createResource();

    const plan = Plan.fromResponse({
      operation: ResourceOperation.NOOP,
      resourceType: 'type',
      parameters: [{
        name: 'propB',
        operation: ParameterOperation.NOOP,
        previousValue: 'propBValue',
        newValue: 'propBValue',
      }]
    }, resource.defaultValues);

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
    const resource = createResource();

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
    }, resource.defaultValues);

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
    const resource = createResource();

    const plan = Plan.calculate(
      {
        propA: 'propA',
      },
      {
        propA: 'propA2',
      },
      {
        type: 'type',
        name: 'name1'
      }, { statefulMode: false });

    expect(plan.toResponse()).toMatchObject({
      resourceType: 'type',
      resourceName: 'name1',
      operation: ResourceOperation.RECREATE
    })
  })
})

function createResource(): Resource<any> {
  return new class extends TestResource {
    constructor() {
      super({
        type: 'type',
        parameterOptions: {
          propA: { default: 'defaultA' }
        }
      });
    }
  }
}
