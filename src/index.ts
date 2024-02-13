import { Plugin } from './entities/plugin';
import { MessageHandler } from './messages/handlers';

export async function runPlugin(plugin: Plugin) {
  await plugin.onInitialize();

  const messageHandler = new MessageHandler(plugin);
  process.on('message', (message) => messageHandler.onMessage(message))
}
