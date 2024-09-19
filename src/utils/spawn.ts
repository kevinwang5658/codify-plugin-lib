import { Ajv } from 'ajv';
import { IpcMessage, MessageCmd, SudoRequestResponseData, SudoRequestResponseDataSchema } from 'codify-schemas';
import { spawn, SpawnOptions } from 'node:child_process';
import { SudoError } from '../errors.js';

const ajv = new Ajv({
  strict: true,
});
const validateSudoRequestResponse = ajv.compile(SudoRequestResponseDataSchema);

export enum SpawnStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface SpawnResult {
  status: SpawnStatus,
  data: string;
}

type CodifySpawnOptions = {
  cwd?: string;
  throws?: boolean,
  requiresRoot?: boolean
} & Omit<SpawnOptions, 'detached' | 'shell' | 'stdio'>

/**
 *
 * @param cmd Command to run. Ex: `rm -rf`
 * @param opts Standard options for node spawn. Additional argument:
 * throws determines if a shell will throw a JS error. Defaults to true
 *
 * @see promiseSpawn
 * @see spawn
 *
 * @returns SpawnResult { status: SUCCESS | ERROR; data: string }
 */
export async function $(
  cmd: string,
  opts?: CodifySpawnOptions,
): Promise<SpawnResult> {
  const throws = opts?.throws ?? true;

  console.log(`Running command: ${cmd}`)

  try {
    // TODO: Need to benchmark the effects of using sh vs zsh for shell.
    //  Seems like zsh shells run slower

    let result: SpawnResult;
    if (!opts?.requiresRoot) {
      result = await internalSpawn(
        cmd,
        opts ?? {},
      );
    } else {
      result = await externalSpawnWithSudo(
        cmd,
        opts,
      )
    }

    if (result.status !== SpawnStatus.SUCCESS) {
      throw new Error(result.data);
    }

    return result;
  } catch (error) {

    if (isDebug()) {
      console.error(`CodifySpawn error for command ${cmd}`, error);
    }

    if (error.message?.startsWith('sudo:')) {
      throw new SudoError(cmd);
    }

    if (throws) {
      throw error;
    }

    if (error instanceof Error) {
      return {
        status: SpawnStatus.ERROR,
        data: error.message,
      }
    }

    return {
      status: SpawnStatus.ERROR,
      data: error + '',
    }
  }
}

async function internalSpawn(
  cmd: string,
  opts: CodifySpawnOptions
): Promise<{ status: SpawnStatus, data: string }> {
  return new Promise((resolve, reject) => {
    const output: string[] = [];

    // Source start up shells to emulate a users environment vs. a non-interactive non-login shell script
    // Ignore all stdin
    const _process = spawn(`source ~/.zshrc; ${cmd}`, [], {
      ...opts,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: 'zsh',
    });

    const { stdout, stderr, stdin } = _process
    stdout.setEncoding('utf8');
    stderr.setEncoding('utf8');

    stdout.on('data', (data) => {
      output.push(data.toString());
    })

    stderr.on('data', (data) => {
      output.push(data.toString());
    })

    _process.on('error', (data) => {
    })

    // please node that this is not a full replacement for 'inherit'
    // the child process can and will detect if stdout is a pty and change output based on it
    // the terminal context is lost & ansi information (coloring) etc will be lost
    if (stdout && stderr) {
      stdout.pipe(process.stdout)
      stderr.pipe(process.stderr)
    }

    _process.on('close', (code) => {
      resolve({
        status: code === 0 ? SpawnStatus.SUCCESS : SpawnStatus.ERROR,
        data: output.join('\n'),
      })
    })
  })
}

async function externalSpawnWithSudo(
  cmd: string,
  opts: CodifySpawnOptions
): Promise<{ status: SpawnStatus, data: string }> {
  return await new Promise((resolve) => {
    const listener = (data: IpcMessage) => {
      if (data.cmd === MessageCmd.SUDO_REQUEST + '_Response') {
        process.removeListener('message', listener);

        if (!validateSudoRequestResponse(data.data)) {
          throw new Error(`Invalid response for sudo request: ${JSON.stringify(validateSudoRequestResponse.errors, null, 2)}`);
        }

        resolve(data.data as unknown as SudoRequestResponseData);
      }
    }
    process.on('message', listener);

    process.send!({
      cmd: MessageCmd.SUDO_REQUEST,
      data: {
        command: cmd,
        options: opts ?? {},
      }
    })
  });
}

export function isDebug(): boolean {
  return process.env.DEBUG != null && process.env.DEBUG.includes('codify'); // TODO: replace with debug library
}
