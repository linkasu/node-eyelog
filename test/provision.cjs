const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { install, REQUIRED } = require('../download');

test('public pinned SDK provisions without executing any downloaded binary', async (t) => {
    const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'eyelog-provision-'));
    const root = await fs.realpath(temporary);
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    await install({ root });
    for (const name of REQUIRED) {
        const stat = await fs.lstat(path.join(root, 'bin', name));
        assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size > 0);
        console.log(`${name}: ${stat.size} bytes`);
    }
    assert.deepEqual(await fs.readdir(root), ['bin']);
});
