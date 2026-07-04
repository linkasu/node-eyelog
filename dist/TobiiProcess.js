"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TobiiProcess = void 0;
const child_process_1 = require("child_process");
const tsee_1 = require("tsee");
const path_1 = require("path");
const os_1 = require("os");
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
            const args = data.substring('gaze:'.length).split(',').map((s => +s));
            if (args.length >= 3 && args.every(Number.isFinite)) {
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
