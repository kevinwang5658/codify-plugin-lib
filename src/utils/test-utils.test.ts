import { EventEmitter } from 'node:events';
import { ChildProcess } from 'node:child_process';
import { Readable } from 'stream';
import { mock } from 'node:test';
import { AssertionError } from 'chai';
import { CodifyTestUtils } from './test-utils.js';
import { describe, expect, it } from 'vitest';

describe('Test Utils tests', async () => {

  const mockChildProcess = () => {
    const process = new ChildProcess();
    process.stdout = new EventEmitter() as Readable;
    process.stderr = new EventEmitter() as Readable
    process.send = () => true;

    return process;
  }

  it('send a message', async () => {
    const process = mockChildProcess();
    const sendMock = mock.method(process, 'send');

    CodifyTestUtils.sendMessageToProcessAwaitResponse(process, { cmd: 'message', data: 'data' })

    expect(sendMock.mock.calls.length).to.eq(1);
    expect(sendMock.mock.calls[0].arguments[0]).to.deep.eq({ cmd: 'message', data: 'data' });
  })

  it('send a message and receives the response', async () => {
    const process = mockChildProcess();

    try {
      const result = await Promise.all([
        (async () => {
          await sleep(30);
          process.emit('message', { cmd: 'messageResult', data: 'data' })
        })(),
        CodifyTestUtils.sendMessageToProcessAwaitResponse(process, { cmd: 'message', data: 'data' }),
      ]);

      expect(result[1]).to.deep.eq({ cmd: 'messageResult', data: 'data' })
    } catch (e) {
      console.log(e);
      throw new AssertionError('Failed to receive message');
    }
  });
});

async function sleep(ms: number) {
  return new Promise((resolve, reject) => setTimeout(resolve, ms))
}
