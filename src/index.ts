import { MessageHandler } from './messages/handlers.js';
import { Plugin } from './plugin/plugin.js';

export * from './errors.js'
export * from './plan/change-set.js'
export * from './plan/plan.js'
export * from './plan/plan-types.js'
export * from './plugin/plugin.js'
export * from './pty/index.js'
export * from './resource/parsed-resource-settings.js';
export * from './resource/resource.js'
export * from './resource/resource-settings.js'
export * from './stateful-parameter/stateful-parameter.js'
export * from './utils/utils.js'

export async function runPlugin(plugin: Plugin) {
  const messageHandler = new MessageHandler(plugin);
  process.on('message', (message) => messageHandler.onMessage(message))
}
