export declare function savePid(pid: number): void;
export declare function getPid(): number | null;
export declare function removePid(): void;
export declare function isRunning(): boolean;
export declare function readLog(lastLines?: number): string[];
export declare function getLogPath(): string;
