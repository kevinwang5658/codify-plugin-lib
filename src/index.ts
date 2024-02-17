import { Plugin } from './entities/plugin';
import { MessageHandler } from './messages/handlers';

export * from './entities/resource'
export * from './entities/plugin'
export * from './entities/change-set'
export * from './entities/plan'
export * from './utils/test-utils'


export async function runPlugin(plugin: Plugin) {
  await plugin.onInitialize();

  const messageHandler = new MessageHandler(plugin);
  process.on('message', (message) => messageHandler.onMessage(message))
}
