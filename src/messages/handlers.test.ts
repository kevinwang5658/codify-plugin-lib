import { MessageHandler } from './handlers';
import { Plugin } from '../entities/plugin';
import { describe, it, expect } from 'vitest';
import { createStubInstance } from 'sinon';

describe('Message handler tests', () => {
  it('handles plan requests', async () => {
    const plugin = createStubInstance(Plugin);
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'plan',
        data: {
          type: 'resourceType',
          name: 'name',
          prop1: 'A',
          prop2: 'B',
        }
      })
    } catch (e) {}

    expect(plugin.plan.calledOnce).to.be.true;
  })

  it('rejects bad plan requests', async () => {
    const plugin = createStubInstance(Plugin);
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'plan',
        data: {
          type: 'resourceType',
          name: '1name',
          prop1: 'A',
          prop2: 'B',
        }
      })
    } catch (e) {}

    expect(plugin.plan.called).to.be.false;
  })

  it('handles apply requests', async () => {
    const plugin = createStubInstance(Plugin);
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

    expect(plugin.apply.calledOnce).to.be.true;
  })

  it('rejects bad plan requests', async () => {
    const plugin = createStubInstance(Plugin);
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'apply',
        data: {}
      })
    } catch (e) {}

    expect(plugin.apply.called).to.be.false;
  })

  it('handles validate requests', async () => {
    const plugin = createStubInstance(Plugin);
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

    expect(plugin.validate.calledOnce).to.be.true;
  })

  it('rejects bad validate requests', async () => {
    const plugin = createStubInstance(Plugin);
    const handler = new MessageHandler(plugin);

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'validate',
        data: {}
      })
    } catch (e) {}

    expect(plugin.apply.called).to.be.false;
  })

});
