import { describe } from 'mocha';
import { Resource } from './resource';
import { ResourceConfig, ResourceOperation } from 'codify-schemas';
import { ChangeSet, ParameterChange } from './change-set';
import { spy } from 'sinon';
import { expect } from 'chai';
import { Plan } from './plan';

class TestResource extends Resource<TestConfig> {
  applyCreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyDestroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyModify(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  applyRecreate(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
    return ResourceOperation.MODIFY;
  }

  async getCurrentConfig(): Promise<TestConfig> {
    return Promise.resolve(undefined);
  }

  validate(config: ResourceConfig): Promise<boolean> {
    return Promise.resolve(false);
  }

  getTypeId(): string {
    return '';
  }
}

interface TestConfig extends ResourceConfig {
  propA: string;
  propB: number;
  propC?: string;
}

describe('Resource tests', () => {
  it('plans correctly', async () => {
    const resource = new class extends TestResource {
      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async getCurrentConfig(): Promise<TestConfig> {
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

    expect(result.resourceConfig).to.deep.eq({
      type: 'type',
      name: 'name',
      propA: 'propA',
      propB: 10,
    });
    expect(result.changeSet.operation).to.eq(ResourceOperation.MODIFY);
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
      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async getCurrentConfig(): Promise<TestConfig> {
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
      calculateOperation(change: ParameterChange): ResourceOperation.RECREATE | ResourceOperation.MODIFY {
        return ResourceOperation.MODIFY;
      }

      async getCurrentConfig(): Promise<TestConfig> {
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
      getTypeId(): string {
        return 'resource'
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
      getTypeId(): string {
        return 'resource'
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
})
