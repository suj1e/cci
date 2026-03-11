import type { FeishuRichText, FeishuElement, BridgeMessage } from '../types';
/**
 * 协议转换模块
 * 负责处理CLI markdown到飞书富文本的转换
 * 支持代码块高亮和流式响应
 */
export declare class MessageConverter {
    static generateId(): string;
    static markdownToFeishuRichText(markdown: string): FeishuRichText;
    static markdownToFeishuPost(markdown: string): any;
    private static parseInlineElements;
    static handleTextContent(text: string): FeishuElement[];
    static handleCodeBlock(block: string): FeishuElement[];
    static processInlineElements(text: string): string;
    static cliResponseToFeishu(response: string): string;
    static createStreamChunk(content: string): BridgeMessage;
    static createCliResponse(content: string): BridgeMessage;
    static createStreamEnd(): BridgeMessage;
    static mergeStreamChunks(chunks: string[]): string;
    static isStreamStart(content: string): boolean;
    static isStreamEnd(content: string): boolean;
}
