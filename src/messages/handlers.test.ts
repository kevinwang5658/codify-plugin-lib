import { MessageHandler } from './handlers.js';
import { Plugin } from '../plugin/plugin.js';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended'
import { Resource } from '../resource/resource.js';
import { Plan } from '../plan/plan.js';
import { MessageStatus, ResourceOperation } from 'codify-schemas';

describe('Message handler tests', () => {
  it('handles plan requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    process.send = (message) => {
      expect(message).toMatchObject({
        cmd: 'plan_Response',
        status: MessageStatus.SUCCESS,
      });

      return true;
    }

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'plan',
        data: {
          desired: {
            type: 'resourceType',
            name: 'name',
            prop1: 'A',
            prop2: 'B',
          },
          isStateful: false,
        }
      })
    } catch (e) {}

    expect(plugin.plan.mock.calls.length).to.eq(1);
    process.send = undefined;
  })

  it('rejects bad plan requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    process.send = (message) => {
      console.log(message);
      expect(message).toMatchObject({
        cmd: 'plan_Response',
        status: MessageStatus.ERROR,
      });

      return true;
    }

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'plan',
        data: {
          name: '1name',
          prop1: 'A',
          prop2: 'B',
        }
      })
    } catch (e) {
      console.log(e);
    }

    expect(plugin.plan.mock.calls.length).to.eq(0);
    process.send = undefined;
  })

  it('handles apply requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'apply',
        data: {
          planId: '1803fff7-a378-4006-95bb-7c97cba02c82'
        }
      })
    } catch (e) {}

    expect(plugin.apply.mock.calls.length).to.be.eq(1);
  })

  it('rejects bad apply requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'apply',
        data: {}
      })
    } catch (e) {}

    expect(plugin.apply.mock.calls.length).to.be.eq(0);
  })

  it('handles validate requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'validate',
        data: {
          configs: [
            {
              type: 'type1',
              name: 'name1'
            },
            {
              type: 'type2',
              name: 'name2'
            },
            {
              type: 'type2',
              name: 'name3'
            }
          ]
        }
      })
    } catch (e) {}

    expect(plugin.validate.mock.calls.length).to.eq(1);
  })

  it('rejects bad validate requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

    process.send = () => true;

    // Message handler also validates the response. That part does not need to be tested
    // This should not throw
    expect(await handler.onMessage({
      cmd: 'validate',
      data: {}
    })).to.eq(undefined);

    expect(plugin.apply.mock.calls.length).to.be.eq(0);
  })

  it('handles errors for plan', async () => {
    const resource= testResource();
    const plugin = testPlugin(resource);

    const handler = new MessageHandler(plugin);

    process.send = (message) => {
      expect(message).toMatchObject({
        cmd: 'plan_Response',
        status: MessageStatus.ERROR,
        data: 'Refresh error',
      })
      return true;
    }

    expect(async () => await handler.onMessage({
      cmd: 'plan',
      data: {
        desired: {
          type: 'resourceA'
        },
        isStateful: false,
      }
    })).rejects.to.not.throw;

    process.send = undefined;
  })

  it('handles errors for apply (create)', async () => {
    const resource= testResource();
    const plugin = testPlugin(resource);

    const handler = new MessageHandler(plugin);

    process.send = (message) => {
      expect(message).toMatchObject({
        cmd: 'apply_Response',
        status: MessageStatus.ERROR,
        data: 'Create error',
      })
      return true;
    }

    expect(async () => await handler.onMessage({
      cmd: 'apply',
      data: {
        plan: {
          resourceType: 'resourceA',
          operation: ResourceOperation.CREATE,
          parameters: []
        }
      }
    })).rejects.to.not.throw;
  })

  it('handles errors for apply (destroy)', async () => {
    const resource= testResource();
    const plugin = testPlugin(resource);

    const handler = new MessageHandler(plugin);

    process.send = (message) => {
      expect(message).toMatchObject({
        cmd: 'apply_Response',
        status: MessageStatus.ERROR,
        data: 'Destroy error',
      })
      return true;
    }

    expect(async () => await handler.onMessage({
      cmd: 'apply',
      data: {
        plan: {
          resourceType: 'resourceA',
          operation: ResourceOperation.DESTROY,
          parameters: []
        }
      }
    })).rejects.to.not.throw;
  })


  const testResource = () => new class extends Resource<any> {
    constructor() {
      super({ type: 'resourceA' });
    }

    async refresh(keys: Map<keyof any, any>): Promise<Partial<any> | null> {
      throw new Error('Refresh error');
    }

    create(plan: Plan<any>): Promise<void> {
      throw new Error('Create error');
    }

    destroy(plan: Plan<any>): Promise<void> {
      throw new Error('Destroy error');
    }
  }

  const testPlugin = (resource: Resource<any>) => new class extends Plugin {
    constructor() {
      const map = new Map();
      map.set('resourceA', resource);

      super('name', map);
    }
  }

});
