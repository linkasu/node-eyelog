const { spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');

const SDK = Object.freeze({
    url: 'https://github.com/linkasu/EyeLog/releases/download/1.1.3.0/Release.zip',
    sha256: '7d97bf05faf5688f7cabe79acdfbd78696ca989e86efb9a9e90bf301e2595d2d',
    size: 389225,
});
const REQUIRED = ['EyeLog.exe', 'EyeLog.exe.config', 'Tobii.EyeX.Client.dll',
    'Tobii.Interaction.Model.dll', 'Tobii.Interaction.Net.dll'];
const ALLOWED = new Set([...REQUIRED, 'EyeLog.pdb']);
const MAX_ARCHIVE = 1024 * 1024;

// curl retains standard HTTPS proxy support without using GitHub credentials.
async function downloadArchive(run = spawn) {
    return new Promise((resolve, reject) => {
        const child = run('curl', ['-q', '--fail', '--silent', '--show-error', '--location',
            '--proto', '=https', '--proto-redir', '=https', '--max-redirs', '5',
            '--connect-timeout', '15', '--max-time', '60', '--max-filesize', String(MAX_ARCHIVE),
            SDK.url], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
        const chunks = [];
        let size = 0;
        let failure;
        const stop = (error) => { failure ||= error; child.kill(); };
        const timer = setTimeout(() => stop(new Error('SDK download timed out')), 65000);
        child.stdout.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_ARCHIVE) stop(new Error('SDK archive too large'));
            else chunks.push(chunk);
        });
        // Do not log transport stderr: proxy diagnostics can contain credentials.
        child.stderr.resume();
        child.once('error', (error) => { clearTimeout(timer); reject(error); });
        child.once('close', (code) => {
            clearTimeout(timer);
            if (failure || code !== 0) reject(failure || new Error(`SDK download failed (${code})`));
            else resolve(Buffer.concat(chunks));
        });
    });
}

async function unpack(archive, destination, sdk = SDK, extract) {
    if (archive.length > MAX_ARCHIVE || archive.length !== sdk.size) throw new Error('SDK archive size mismatch');
    if (createHash('sha256').update(archive).digest('hex') !== sdk.sha256) throw new Error('SDK checksum mismatch');
    if (archive.length < 4 || archive.readUInt32LE(0) !== 0x04034b50) throw new Error('SDK must be a ZIP archive');
    const decompress = extract || (await import('@xhmikosr/decompress')).default;
    // Inspect every entry before writing anything; only flat, known regular files are accepted.
    const files = await decompress(archive);
    const seen = new Set();
    let total = 0;
    for (const file of files) {
        total += file.data.length;
        if (file.type !== 'file' || !ALLOWED.has(file.path) || seen.has(file.path) ||
            !file.data.length || total > 8 * 1024 * 1024) throw new Error('Unsafe SDK entry');
        seen.add(file.path);
    }
    if (!REQUIRED.every((name) => seen.has(name))) throw new Error('Missing required SDK binaries');
    for (const file of files) await fs.writeFile(path.join(destination, file.path), file.data, { flag: 'wx' });
}

async function existingDirectory(target, io) {
    try {
        const stat = await io.lstat(target);
        if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Unsafe SDK destination: ${target}`);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
    }
}

async function install({ root = __dirname, download = downloadArchive, sdk = SDK, extract, io = fs } = {}) {
    // Reject symlinked ancestors as well as a symlinked bin directory.
    const absolute = path.resolve(root);
    if (await io.realpath(absolute) !== absolute) throw new Error('SDK root must be a real directory');
    const output = path.join(absolute, 'bin');
    const lock = path.join(absolute, '.sdk-install-lock');
    await io.mkdir(lock); // Fail closed on concurrent/stale installs; never remove another install's lock.
    let staging;
    let keepRecovery = false;
    let failure;
    try {
        const hadOutput = await existingDirectory(output, io);
        staging = await io.mkdtemp(path.join(absolute, '.sdk-install-'));
        const next = path.join(staging, 'next');
        const backup = path.join(staging, 'previous');
        await io.mkdir(next);
        await unpack(await download(), next, sdk, extract);
        if (hadOutput) await io.rename(output, backup);
        try {
            await io.rename(next, output);
        } catch (error) {
            if (hadOutput) {
                try { await io.rename(backup, output); }
                catch (rollback) {
                    keepRecovery = true;
                    throw new AggregateError([error, rollback], `SDK rollback failed; previous output retained at ${backup}`);
                }
            }
            throw error;
        }
    } catch (error) { failure = error; }
    const errors = failure ? [failure] : [];
    if (staging && !keepRecovery) {
        try { await io.rm(staging, { recursive: true }); } catch (error) { errors.push(error); }
    }
    try { await io.rmdir(lock); } catch (error) { errors.push(error); }
    if (errors.length) throw new AggregateError(errors, errors.map((error) => error.message).join('; '));
}

if (require.main === module) install().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});

module.exports = { install, unpack, downloadArchive, SDK, REQUIRED };
