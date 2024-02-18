import { ChildProcess } from 'child_process';

export class CodifyTestUtils {
  static sendMessageToProcessAwaitResponse(process: ChildProcess, message: any): Promise<any> {
    return new Promise((resolve, reject) => {
      process.on('message', (response) => {
        resolve(response)
      });
      process.on('error', (err) => reject(err))
      process.on('exit', (code) => {
        if (code != 0) {
          reject('Exit code is not 0');
        }
        resolve(code);
      })
      process.send(message);
    });
  }

}
