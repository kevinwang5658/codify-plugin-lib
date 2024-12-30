import { nanoid } from 'nanoid';
import EventEmitter from 'node:events';

export class PromiseQueue {
  // Cid stands for command id;
  private queue: Array<{ cid: string, fn: () => Promise<any> | any }> = [];
  private eventBus = new EventEmitter()

  async run<T>(fn: () => Promise<T> | T): Promise<T> {
    const cid = nanoid();
    this.queue.push({ cid, fn })

    if (this.queue.length !== 1) {
      await new Promise((resolve) => {
        const listener = () => {
          if (this.queue[0].cid === cid) {
            this.eventBus.removeListener('dequeue', listener);
            resolve(null);
          }
        }

        this.eventBus.on('dequeue', listener);
      });
    }

    const result = await fn();

    this.queue.shift();
    this.eventBus.emit('dequeue');

    return result;
  }
}
