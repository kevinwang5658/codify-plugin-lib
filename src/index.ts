import { Plugin } from './plugin/plugin.js';
import { MessageHandler } from './messages/handlers.js';

export * from './resource/resource.js'
export * from './resource/resource-types.js'
export * from './resource/resource-settings.js'
export * from './plugin/plugin.js'
export * from './plan/change-set.js'
export * from './plan/plan.js'
export * from './plan/plan-types.js'
export * from './resource/stateful-parameter.js'
export * from './errors.js'

export * from './utils/utils.js'

export async function runPlugin(plugin: Plugin) {
  const messageHandler = new MessageHandler(plugin);
  process.on('message', (message) => messageHandler.onMessage(message))
}

export { ParsedResourceSettings } from './resource/parsed-resource-settings.js';
