import { describe, expect, it } from 'vitest';
import { Plugin } from './plugin.js';
import { ParameterOperation, ResourceOperation, StringIndexedObject } from 'codify-schemas';
import { Resource } from '../resource/resource.js';
import { Plan } from '../plan/plan.js';
import { spy } from 'sinon';
import { ResourceOptions } from '../resource/resource-options.js';

interface TestConfig extends StringIndexedObject {
  propA: string;
  propB: number;
  propC?: string;
}

class TestResource extends Resource<TestConfig> {
  getSettings(): ResourceOptions<TestConfig> {
    return {
      type: 'testResource'
    };
  }

  create(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  destroy(plan: Plan<TestConfig>): Promise<void> {
    return Promise.resolve(undefined);
  }

  async refresh(): Promise<Partial<TestConfig> | null> {
    return {
      propA: 'a',
      propB: 10,
      propC: 'c',
    };
  }
}

describe('Plugin tests', () => {
  it('Can apply resource', async () => {
    const resource= spy(new TestResource())
    const plugin = Plugin.create('testPlugin', [resource as any])

    const plan = {
      operation: ResourceOperation.CREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.ADD, newValue: 'abc', previousValue: null },
      ]
    };

    await plugin.apply({ plan });
    expect(resource.create.calledOnce).to.be.true;
  });

  it('Can destroy resource', async () => {
    const resource = spy(new TestResource());
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan = {
      operation: ResourceOperation.DESTROY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.REMOVE, newValue: null, previousValue: 'abc' },
      ]
    };

    await testPlugin.apply({ plan })
    expect(resource.destroy.calledOnce).to.be.true;
  });

  it('Can re-create resource', async () => {
    const resource = spy(new TestResource())
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan = {
      operation: ResourceOperation.RECREATE,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ]
    };

    await testPlugin.apply({ plan })
    expect(resource.destroy.calledOnce).to.be.true;
    expect(resource.create.calledOnce).to.be.true;
  });

  it('Can modify resource', async () => {
    const resource = spy(new TestResource())
    const testPlugin = Plugin.create('testPlugin', [resource as any])

    const plan = {
      operation: ResourceOperation.MODIFY,
      resourceType: 'testResource',
      parameters: [
        { name: 'propA', operation: ParameterOperation.MODIFY, newValue: 'def', previousValue: 'abc' },
      ]
    };

    await testPlugin.apply({ plan })
    expect(resource.modify.calledOnce).to.be.true;
  });
});
