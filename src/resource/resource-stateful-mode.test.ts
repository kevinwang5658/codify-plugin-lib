import { describe, expect, it } from 'vitest';
import { ParameterOperation, ResourceOperation } from 'codify-schemas';
import { TestParameter } from './resource-parameters.test.js';
import { StatefulParameter } from './stateful-parameter.js';
import { TestConfig, TestResource } from '../utils/test-utils.test.js';


describe('Resource tests for stateful plans', () => {
  it('Supports delete operations ', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }

      async refresh(parameters: Partial<TestConfig>): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'propADifferent',
          propB: undefined,
          propC: 'propCDifferent',
        }
      }
    }

    const plan = await resource.plan(
      null,
      {
        type: 'resource',
        propA: 'propA',
        propB: 10,
        propC: 'propC',
      }, true
    );

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.DESTROY,
        parameterChanges: [
          {
            name: "propA",
            previousValue: "propADifferent",
            newValue: null,
            operation: ParameterOperation.REMOVE
          },
          {
            name: "propC",
            previousValue: "propCDifferent",
            newValue: null,
            operation: ParameterOperation.REMOVE
          },
        ]
      },
      resourceMetadata: {
        type: 'resource'
      }
    })
  })

  it('Supports create operations', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return null;
      }
    }

    const plan = await resource.plan(
      {
        type: 'resource',
        propA: 'propA',
        propB: 10,
        propC: 'propC',
      },
      null,
      true
    );

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.CREATE,
        parameterChanges: [
          {
            name: "propA",
            newValue: "propA",
            previousValue: null,
            operation: ParameterOperation.ADD
          },
          {
            name: "propB",
            newValue: 10,
            previousValue: null,
            operation: ParameterOperation.ADD
          },
          {
            name: "propC",
            newValue: 'propC',
            previousValue: null,
            operation: ParameterOperation.ADD
          },
        ]
      },
      resourceMetadata: {
        type: 'resource'
      }
    })
  })

  it('Supports re-create operations', async () => {
    const resource = new class extends TestResource {
      constructor() {
        super({ type: 'resource' });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'propA',
          propC: 'propC',
          propB: undefined
        };
      }
    }

    const plan = await resource.plan(
      {
        type: 'resource',
        propA: 'propA',
        propB: 10,
        propC: 'propC',
      },
      {
        type: 'resource',
        propA: 'propA',
        propC: 'propC'
      },
      true
    );

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.RECREATE,
        parameterChanges: expect.arrayContaining([
          {
            name: "propA",
            newValue: "propA",
            previousValue: "propA",
            operation: ParameterOperation.NOOP
          },
          {
            name: "propB",
            newValue: 10,
            previousValue: null,
            operation: ParameterOperation.ADD
          },
          {
            name: "propC",
            newValue: 'propC',
            previousValue: 'propC',
            operation: ParameterOperation.NOOP
          },
        ])
      },
      resourceMetadata: {
        type: 'resource'
      }
    })
  })

  it('Supports stateful parameters', async () => {
    const statefulParameter = new class extends TestParameter {
      async refresh(): Promise<string | null> {
        return null;
      }
    }

    const resource = new class extends TestResource {
      constructor() {
        super({
          type: 'resource',
          parameterOptions: {
            propD: { statefulParameter: statefulParameter as StatefulParameter<TestConfig, string> },
          }
        });
      }

      async refresh(): Promise<Partial<TestConfig> | null> {
        return {
          propA: 'propA',
          propC: 'propC',
          propB: undefined
        };
      }
    }

    const plan = await resource.plan(
      {
        type: 'resource',
        propA: 'propA',
        propB: 10,
        propC: 'propC',
        propD: 'propD'
      },
      {
        type: 'resource',
        propA: 'propA',
        propC: 'propC'
      },
      true
    );

    expect(plan).toMatchObject({
      changeSet: {
        operation: ResourceOperation.RECREATE,
        parameterChanges: expect.arrayContaining([
          {
            name: "propA",
            newValue: "propA",
            previousValue: "propA",
            operation: ParameterOperation.NOOP
          },
          {
            name: "propB",
            newValue: 10,
            previousValue: null,
            operation: ParameterOperation.ADD
          },
          {
            name: "propC",
            newValue: 'propC',
            previousValue: 'propC',
            operation: ParameterOperation.NOOP
          },
          {
            name: "propD",
            newValue: 'propD',
            previousValue: null,
            operation: ParameterOperation.ADD
          },
        ])
      },
      resourceMetadata: {
        type: 'resource'
      }
    })
  })
})
