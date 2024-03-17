import { MessageHandler } from './handlers.js';
import { Plugin } from '../entities/plugin.js';
import { describe, it, expect } from 'vitest';
import { vi } from 'vitest'
import { mock } from 'vitest-mock-extended'

describe('Message handler tests', () => {
  it('handles plan requests', async () => {
    const plugin = mock<Plugin>();
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

    expect(plugin.plan.mock.calls.length).to.eq(1);
  })

  it('rejects bad plan requests', async () => {
    const plugin = mock<Plugin>();
    const handler = new MessageHandler(plugin);

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
    } catch (e) {}

    expect(plugin.plan.mock.calls.length).to.eq(0);
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

    // Message handler also validates the response. That part does not need to be tested
    try {
      await handler.onMessage({
        cmd: 'validate',
        data: {}
      })
    } catch (e) {}

    expect(plugin.apply.mock.calls.length).to.be.eq(0);
  })

});
