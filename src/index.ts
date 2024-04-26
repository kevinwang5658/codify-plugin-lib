import { Plugin } from './entities/plugin.js';
import { MessageHandler } from './messages/handlers.js';

export * from './entities/resource.js'
export * from './entities/resource-types.js'
export * from './entities/plugin.js'
export * from './entities/change-set.js'
export * from './entities/plan.js'
export * from './entities/plan-types.js'
export * from './entities/stateful-parameter.js'

export * from './utils/test-utils.js'
export * from './utils/utils.js'

export async function runPlugin(plugin: Plugin) {
  const messageHandler = new MessageHandler(plugin);
  process.on('message', (message) => messageHandler.onMessage(message))
}
export { ErrorMessage } from './entities/resource-types.js';
