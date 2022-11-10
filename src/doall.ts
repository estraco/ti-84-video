import fs from 'fs';
import child_process from 'child_process';
import util from 'util';
import path from 'path';
import os from 'os';

function promiseChain<T>(promises: (() => Promise<T>)[]) {
    return promises.reduce((promise, next) => promise.finally(() => {
        console.log('next');

        return next();
    }), Promise.resolve());
}

// const sleep = util.promisify(setTimeout);

const files = fs
    .readdirSync('.')
    .filter(f => f.endsWith('.gif') || f.endsWith('.mp4'));

const fpses = [
    20,
    10,
    5
];

const sizes = [
    // 128,
    64,
    32,
    16
];

const commands = [];

const makeCommands: {
    cwd: string;
    cmds: string[];
}[] = [];

const concurrency = 4;

for (const file of files) {
    for (const fps of fpses) {
        for (const size of sizes) {
            commands.push(`node --enable-source-maps build -a -c -w ${size} -f ${fps} -i ${file}`);

            makeCommands.push({
                cwd: `./calc/${path.basename(file, path.extname(file))}-${fps}fps-${size}x${(240 / 320) * size}`,
                cmds: [
                    'make clean',
                    `make -j${os.cpus().length / concurrency}`
                ]
            });
        }
    }
}

const promiseChunks = Array.from({ length: concurrency }, () => []);

for (let i = 0; i < commands.length; i++) {
    promiseChunks[i % concurrency].push(commands[i]);
}

const promises = promiseChunks.map(chunk => promiseChain(chunk.map(command => (() => {
    console.log(`Running ${command}`);

    return util.promisify(child_process.exec)(command);
}))));

const makePromiseChunks = Array.from({ length: concurrency }, () => []);

for (let i = 0; i < makeCommands.length; i++) {
    makePromiseChunks[i % concurrency].push(makeCommands[i]);
}

Promise.allSettled(promises).then(() => {
    console.log('done with promises');

    const makePromises = makePromiseChunks.map(chunk => promiseChain(chunk.map((command: typeof makeCommands[0]) => (() => {
        console.log(`Running ${command.cmds.join('; ')} in ${command.cwd}`);

        return promiseChain(command.cmds.map(cmd => {
            const fn
                // : () => Promise<child_process.ChildProcess | {
                //     stdout: string;
                //     stderr: string;
                // }>
                = () => util.promisify(child_process.exec)(cmd, {
                    cwd: command.cwd
                }).catch((e) => {
                    console.error(e, {
                        cwd: command.cwd,
                        cmd,
                        stdout: e.stdout,
                        stderr: e.stderr
                    });

                    // return sleep(100).then(fn);
                });

            return fn;
        }));
    }))));

    Promise.allSettled(makePromises).then(() => {
        console.log('done with make promises');
    });
});
