import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { EventEmitter } from "tsee";
import { join } from "path";
import { Bound } from "./bound";
import { platform } from "os";

export function parseGazePayload(payload: string): [number, number, number] | undefined {
    const parts = payload.split(',').map((part) => part.trim()).filter(Boolean)
    const values = parts.length === 3
        ? parts
        : parts.length === 5
            ? [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`, parts[4]]
            : parts.length === 6
                ? [`${parts[0]}.${parts[1]}`, `${parts[2]}.${parts[3]}`, `${parts[4]}.${parts[5]}`]
                : []
    if (values.length !== 3) return undefined

    const numbers = values.map((value) => Number(value))
    if (!numbers.every(Number.isFinite)) return undefined
    return [numbers[0], numbers[1], numbers[2]]
}

export class TobiiProcess extends EventEmitter<{

    gaze: (x: number, y: number, timestamp: number) => void;
    enter: (index: number) => void;
    click: (index: number, count: number) => void;
    exit: () => void;
    stderr: (data: string) => void;
    error: (error: Error) => void;
    processExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}> {
    private process?: ChildProcessWithoutNullStreams;
    private buffer = '';
    constructor(exe = join(__dirname, '../bin/EyeLog.exe')) {
        super()
        if (platform() == 'win32') {
            this.process = spawn(exe, ['--raw'])

            this.process.stdout.on('data', (chunk) => {
                this.onData(chunk.toString())
            })

            this.process.stderr.on('data', (chunk) => {
                this.emit('stderr', chunk.toString())
            })

            this.process.on('error', (error) => {
                this.emit('error', error)
            })

            this.process.on('exit', (code, signal) => {
                this.emit('processExit', code, signal)
            })

        }
    }
    setBounds(bounds: Bound[]) {
        this.process?.stdin
            .write(bounds.map((b) => b.toString()).join(';') + '\n')
    }
    setTimeout(value: number) {
        this.process?.stdin
            .write('timeout:' + value + '\n')
    }
    destroy() {
        this.process?.kill()
        this.process = undefined
    }
    private onData(data: string) {
        this.buffer += data
        const lines = this.buffer.split(/\r?\n/)
        this.buffer = lines.pop() || ''

        for (const line of lines) {
            this.onLine(line.trim())
        }
    }
    private onLine(data: string) {
        if (!data) {
            return
        }
        if (data.startsWith('gaze:')) {
            const args = parseGazePayload(data.substring('gaze:'.length))
            if (args) {
                this.emit('gaze', args[0], args[1], args[2])
            }
            return
        }
        if (data.startsWith('enter:')) {
            this.emit('enter', +data.split(':')[1])
            return
        }
        if (data === 'exit') {
            this.emit('exit')
            return
        }
        if (data.startsWith('click:')) {
            const args = data.split(':')[1].split(',').map((s => +s))
            this.emit('click', args[0], args[1])
        }
    }

}
