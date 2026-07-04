/// <reference types="node" />
import { EventEmitter } from "tsee";
import { Bound } from "./bound";
export declare class TobiiProcess extends EventEmitter<{
    gaze: (x: number, y: number, timestamp: number) => void;
    enter: (index: number) => void;
    click: (index: number, count: number) => void;
    exit: () => void;
    stderr: (data: string) => void;
    error: (error: Error) => void;
    processExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}> {
    private process?;
    private buffer;
    constructor(exe?: string);
    setBounds(bounds: Bound[]): void;
    setTimeout(value: number): void;
    destroy(): void;
    private onData;
    private onLine;
}
