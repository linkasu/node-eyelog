const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { install, unpack, downloadArchive, REQUIRED } = require('../download');
const zip = require('./zip.cjs');
const valid = () => zip(REQUIRED.map((name) => ({ name })));
const pin = (archive) => ({ size: archive.length, sha256: createHash('sha256').update(archive).digest('hex') });

async function fixture(t) {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'eyelog-test-'));
    const root = await fs.realpath(temporary);
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    return root;
}

async function clean(root, expected = ['bin']) {
    assert.deepEqual((await fs.readdir(root)).sort(), expected.sort());
}

test('valid archive, repeated installation and clean staging', async (t) => {
    const root = await fixture(t);
    const archive = valid();
    for (let i = 0; i < 2; i++) {
        await install({ root, download: async () => archive, sdk: pin(archive) });
        assert.deepEqual((await fs.readdir(path.join(root, 'bin'))).sort(), [...REQUIRED].sort());
        await clean(root);
    }
});

test('checksum/size failures never invoke extractor and retain previous output', async (t) => {
    const root = await fixture(t);
    await fs.mkdir(path.join(root, 'bin'));
    await fs.writeFile(path.join(root, 'bin', 'sentinel'), 'old');
    const archive = valid();
    for (const bad of [Buffer.from(archive).fill(1, 50, 51), archive.subarray(0, 100), Buffer.alloc(1024 * 1024 + 1)]) {
        let calls = 0;
        await assert.rejects(install({ root, download: async () => bad, sdk: pin(archive),
            extract: async () => { calls++; return []; } }));
        assert.equal(calls, 0);
        assert.equal(await fs.readFile(path.join(root, 'bin', 'sentinel'), 'utf8'), 'old');
        await clean(root);
    }
});

test('real parser rejects truncated, traversal, symlink, duplicates and missing binaries', async (t) => {
    const root = await fixture(t);
    await fs.writeFile(path.join(root, 'sentinel'), 'outside');
    const entries = REQUIRED.map((name) => ({ name }));
    const archives = [valid().subarray(0, -12), zip([{ name: '../sentinel' }, ...entries]),
        zip([{ name: '/sentinel' }, ...entries]), zip([{ name: '..\\sentinel' }, ...entries]),
        zip(entries.map((entry, i) => i ? entry : { ...entry, mode: 0o120777, data: '../sentinel' })),
        zip([...entries, entries[0]]), zip(entries.slice(1)),
        zip([{ name: 'EyeLog.exe:stream' }, ...entries])];
    for (const archive of archives) {
        await assert.rejects(install({ root, download: async () => archive, sdk: pin(archive) }));
        assert.equal(await fs.readFile(path.join(root, 'sentinel'), 'utf8'), 'outside');
        await clean(root, ['sentinel']);
    }
});

test('hardlinks rejected at entry boundary (ZIP has no hardlink type)', async (t) => {
    const root = await fixture(t);
    const archive = valid();
    await assert.rejects(unpack(archive, root, pin(archive), async () =>
        REQUIRED.map((name) => ({ path: name, data: Buffer.from('x'), type: 'link', linkname: '../outside' }))), /Unsafe/);
    await clean(root, []);
});

test('bad destination and symlink/junction rejected without download', async (t) => {
    const root = await fixture(t);
    const outside = await fixture(t);
    const bin = path.join(root, 'bin');
    await fs.writeFile(bin, 'not a directory');
    const options = { root, download: async () => { throw new Error('must not download'); } };
    await assert.rejects(install(options), /Unsafe/);
    await fs.unlink(bin);
    await fs.symlink(outside, bin, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(install(options), /Unsafe/);
    await fs.unlink(bin);
    const alias = path.join(root, 'alias');
    await fs.symlink(outside, alias, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(install({ ...options, root: alias }), /real directory/);
    await clean(outside, []);
});

test('network failure and concurrent install fail closed; owning install finishes', async (t) => {
    const root = await fixture(t);
    await assert.rejects(install({ root, download: async () => { throw new Error('network'); } }), /network/);
    await clean(root, []);
    let release;
    let entered;
    const ready = new Promise((resolve) => { entered = resolve; });
    const archive = valid();
    const first = install({ root, sdk: pin(archive), download: () => {
        entered(); return new Promise((resolve) => { release = resolve; });
    } });
    await ready;
    await assert.rejects(install({ root }), /EEXIST/);
    release(archive);
    await first;
    await clean(root);
});

test('swap failure rolls back; rollback failure preserves recoverable old output', async (t) => {
    for (const failRollback of [false, true]) {
        const root = await fixture(t);
        const archive = valid();
        await fs.mkdir(path.join(root, 'bin'));
        await fs.writeFile(path.join(root, 'bin', 'sentinel'), 'old');
        const io = { ...fs, rename: async (from, to) => {
            if (path.basename(from) === 'next' || (failRollback && path.basename(from) === 'previous')) throw new Error('simulated Windows EPERM');
            return fs.rename(from, to);
        } };
        await assert.rejects(install({ root, sdk: pin(archive), download: async () => archive, io }),
            failRollback ? /rollback failed.*previous output retained/ : /EPERM/);
        if (failRollback) {
            const stages = (await fs.readdir(root)).filter((name) => name.startsWith('.sdk-install-'));
            assert.equal(stages.length, 1);
            assert.equal(await fs.readFile(path.join(root, stages[0], 'previous', 'sentinel'), 'utf8'), 'old');
        } else {
            assert.equal(await fs.readFile(path.join(root, 'bin', 'sentinel'), 'utf8'), 'old');
            await clean(root);
        }
    }
});

test('cleanup failures are reported, not silently treated as success', async (t) => {
    const root = await fixture(t);
    const archive = valid();
    for (const operation of ['rm', 'rmdir']) {
        const io = { ...fs, [operation]: async () => { throw new Error(`cleanup ${operation}`); } };
        await assert.rejects(install({ root, sdk: pin(archive), download: async () => archive, io }), /cleanup/);
        assert.equal(await fs.readFile(path.join(root, 'bin', REQUIRED[0]), 'utf8'), 'fixture');
        for (const name of await fs.readdir(root)) {
            if (name.startsWith('.sdk-install-')) await fs.rm(path.join(root, name), { recursive: true });
        }
    }
});

test('transport handles success, partial/failed and oversized download; enforces HTTPS/timeouts', async () => {
    for (const scenario of ['ok', 'partial', 'oversized', 'spawn-error']) {
        const run = (command, args) => {
            assert.equal(command, 'curl');
            assert.equal(args[0], '-q'); // Never inherit unsafe ~/.curlrc transport options.
            assert.ok(args.includes('--max-time'));
            assert.ok(args.includes('--max-filesize'));
            assert.equal(args[args.indexOf('--proto-redir') + 1], '=https');
            const child = new EventEmitter();
            child.stdout = new PassThrough();
            child.stderr = new PassThrough();
            child.kill = () => { queueMicrotask(() => child.emit('close', null)); };
            queueMicrotask(() => {
                if (scenario === 'spawn-error') return child.emit('error', new Error('ENOENT'));
                child.stdout.write(scenario === 'oversized' ? Buffer.alloc(1024 * 1024 + 1) : Buffer.from('partial'));
                child.emit('close', scenario === 'partial' ? 18 : 0);
            });
            return child;
        };
        if (scenario === 'ok') assert.equal((await downloadArchive(run)).toString(), 'partial');
        else await assert.rejects(downloadArchive(run));
    }
});

test('download deadline kills stalled transport', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let killed = false;
    const promise = downloadArchive(() => {
        const child = new EventEmitter();
        child.stdout = new PassThrough();
        child.stderr = new PassThrough();
        child.kill = () => { killed = true; queueMicrotask(() => child.emit('close', null)); };
        return child;
    });
    const rejection = assert.rejects(promise, /timed out/);
    t.mock.timers.tick(65000);
    await rejection;
    assert.equal(killed, true);
});

test('Windows open-file sharing violation preserves the working output', { skip: process.platform !== 'win32', timeout: 30000 }, async (t) => {
    const { spawn } = require('node:child_process');
    const root = await fixture(t);
    const archive = valid();
    await install({ root, sdk: pin(archive), download: async () => archive });
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '$f=[System.IO.File]::Open($env:EYELOG_LOCK_FILE,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::Read); [Console]::WriteLine("READY"); [Console]::ReadLine() | Out-Null; $f.Dispose()'],
    { env: { ...process.env, EYELOG_LOCK_FILE: path.join(root, 'bin', REQUIRED[0]) }, stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = new Promise((resolve) => child.once('close', resolve));
    try {
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => { child.kill(); reject(new Error('Windows file-lock helper timed out')); }, 15000);
            child.once('error', (error) => { clearTimeout(timer); reject(error); });
            child.once('close', () => { clearTimeout(timer); reject(new Error('Windows file-lock helper exited early')); });
            child.stdout.on('data', (data) => {
                if (data.toString().includes('READY')) { clearTimeout(timer); resolve(); }
            });
        });
        await assert.rejects(install({ root, sdk: pin(archive), download: async () => archive }));
        assert.equal(await fs.readFile(path.join(root, 'bin', REQUIRED[0]), 'utf8'), 'fixture');
        await clean(root);
    } finally {
        // Release the OS handle before the fixture cleanup hook; stdin is not a reliable Windows exit signal.
        child.kill();
        await closed;
    }
});
