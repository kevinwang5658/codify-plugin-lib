import { describe, it } from 'vitest';
import { $, sleep } from 'zx';

describe('Spawn integration tests', () => {
  it('Accepts an readable stream', async () => {
    // const input = new PassThrough();
    // input.push('echo hi;\n')
    //
    // const a = await $({ input })``;//.pipe(process.stdout);
    //
    // console.log(a);

    // $({ spawn: command => spawn(command) })

    // const p = $`while read; do $REPLY; done`.pipe(process.stdout)
    // p.stdin.write('echo "Hello, World!"\n')
    // p.stdin.write('echo "Hello, World2!"\n')
    // p.stdin.write('ls -l\n')
    // p.stdin.write(`sleep 1\n`)
    // p.stdin.write('echo "Last"\n')
    // p.stdin.end()

    // const p = $({ shell: 'zsh' })`source $HOME/.zshrc; while read; do $REPLY; done`.pipe(process.stdout)
    // p.stdin.write('echo "Hello, World!"\n')
    // p.stdin.write('echo "Hello, World2!"\n')
    // p.stdin.write('ls -l\n')
    // p.stdin.write(`sleep 1\n`)
    // p.stdin.write('echo "Last"\n')
    // p.stdin.end()

    const a = $({ shell: true });

    const p = $`zsh;\n`.pipe(process.stdout)
    p.stdin.write('echo "Hello, World!"\n')
    p.stdin.write('echo "Hello, World2!"\n')
    p.stdin.write('ls -l\n')
    p.stdin.write(`sleep 2\n`)
    p.stdin.write('echo "Last"\n')
    p.stdin.end()

    await sleep(4000)

    // const ls = spawn('abc')
    // ls.stdin.write()
  })
})
