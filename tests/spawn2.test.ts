import { describe, it } from 'vitest';
import { $ } from 'zurk'
import { sleep } from 'zx';

describe('Zurk integration tests', () => {
  it('works', async () => {
    // const stream = new PassThrough();
    // console.log('start');
    //
    // const r1 = exec({sync: true, cmd: 'echo foo'})
    // console.log(r1.fulfilled?.stdall)
    //
    // const r2 = zurk({ stdin: stream });
    // console.log(r2.stdall)
    //
    // stream.on('data', (data) => console.log(data.toString()));
    // stream.write('echo "hi";\n');
    // stream.push('echo "hi";\n');
    // stream.end()

    // const p = spawn('zsh;\n', [], {
    //   shell: 'zsh',
    //   stdio: 'pipe',
    // })
    //
    // p.stdout.on('data', data => console.log(data.toString()));
    // p.stderr.on('data', data => console.log(data.toString()));
    // p.on('exit', code => console.log(code))
    //
    // await Promise.all([
    //   p.stdin.write('echo "Hello, World! 1";\n'),
    //   p.stdin.write('echo "Hello, World! 2";\n'),
    //   p.stdin.write('sleep 1;\n'),
    //   p.stdin.write('echo "Hello, World! 4";\n'),
    //   p.stdin.write('echo "Hello, World! 5";\n'),
    //   p.stdin.write('printenv;\n')
    // ])

    // p.stdin.write('echo "Hello, World! 1";\n');
    //   p.stdin.write('echo "Hello, World! 2";\n');
    //   p.stdin.write('echo "Hello, World! 3";\n');
    //   p.stdin.write('echo "Hello, World! 4";\n');
    //   p.stdin.write('echo "Hello, World! 5";\n');
    //   p.stdin.write('echo "Hello, World! 6";\n');

    console.log('end');

    const p = $`zsh;\n`.pipe(process.stdout);
    // p.write('echo "Hello, World!"\n')

    await sleep(4900)

  })
})
