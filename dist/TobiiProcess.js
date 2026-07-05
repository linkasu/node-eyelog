"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TobiiProcess = exports.parseGazePayload = void 0;
const child_process_1 = require("child_process");
const tsee_1 = require("tsee");
const path_1 = require("path");
const os_1 = require("os");
function parseGazePayload(payload) {
    const parts = payload.split(',').map((part) => part.trim()).filter(Boolean);
    const values = parts.length === 3
        ? parts
        : parts.length === 5
            ? [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`, parts[4]]
            : parts.length === 6
                ? [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`, `${parts[4]}.${parts[5]}`]
                : [];
    if (values.length !== 3)
        return undefined;
    const numbers = values.map((value) => Number(value));
    if (!numbers.every(Number.isFinite))
        return undefined;
    return [numbers[0], numbers[1], numbers[2]];
}
exports.parseGazePayload = parseGazePayload;
class TobiiProcess extends tsee_1.EventEmitter {
    constructor(exe = (0, path_1.join)(__dirname, '../bin/EyeLog.exe')) {
        super();
        this.buffer = '';
        if ((0, os_1.platform)() == 'win32') {
            this.process = (0, child_process_1.spawn)(exe, ['--raw']);
            this.process.stdout.on('data', (chunk) => {
                this.onData(chunk.toString());
            });
            this.process.stderr.on('data', (chunk) => {
                this.emit('stderr', chunk.toString());
            });
            this.process.on('error', (error) => {
                this.emit('error', error);
            });
            this.process.on('exit', (code, signal) => {
                this.emit('processExit', code, signal);
            });
        }
    }
    setBounds(bounds) {
        var _a;
        (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin.write(bounds.map((b) => b.toString()).join(';') + '\n');
    }
    setTimeout(value) {
        var _a;
        (_a = this.process) === null || _a === void 0 ? void 0 : _a.stdin.write('timeout:' + value + '\n');
    }
    destroy() {
        var _a;
        (_a = this.process) === null || _a === void 0 ? void 0 : _a.kill();
        this.process = undefined;
    }
    onData(data) {
        this.buffer += data;
        const lines = this.buffer.split(/\r?\n/);
        this.buffer = lines.pop() || '';
        for (const line of lines) {
            this.onLine(line.trim());
        }
    }
    onLine(data) {
        if (!data) {
            return;
        }
        if (data.startsWith('gaze:')) {
            const args = parseGazePayload(data.substring('gaze:'.length));
            if (args) {
                this.emit('gaze', args[0], args[1], args[2]);
            }
            return;
        }
        if (data.startsWith('enter:')) {
            this.emit('enter', +data.split(':')[1]);
            return;
        }
        if (data === 'exit') {
            this.emit('exit');
            return;
        }
        if (data.startsWith('click:')) {
            const args = data.split(':')[1].split(',').map((s => +s));
            this.emit('click', args[0], args[1]);
        }
    }
}
exports.TobiiProcess = TobiiProcess;
