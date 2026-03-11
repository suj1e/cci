import type { BridgeConfig } from '../types';
export declare class ConfigManager {
    static getConfigDir(): string;
    static getConfigPath(): string;
    static ensureConfigDir(): void;
    static configExists(): boolean;
    static loadConfig(): BridgeConfig;
    static saveConfig(config: Partial<BridgeConfig>): void;
    static createDefaultConfig(): void;
    static validateConfig(config: BridgeConfig): boolean;
}
