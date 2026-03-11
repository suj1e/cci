"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageConverter = void 0;
/**
 * 协议转换模块
 * 负责处理CLI markdown到飞书富文本的转换
 * 支持代码块高亮和流式响应
 */
class MessageConverter {
    // 生成唯一消息ID
    static generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    // Markdown到飞书富文本转换（返回富文本结构）
    static markdownToFeishuRichText(markdown) {
        const elements = [];
        // 处理代码块
        if (markdown.includes('```')) {
            const parts = markdown.split(/(```[\s\S]*?```)/g);
            for (const part of parts) {
                if (!part.trim())
                    continue;
                if (part.startsWith('```')) {
                    elements.push(...this.handleCodeBlock(part));
                }
                else {
                    elements.push(...this.handleTextContent(part));
                }
            }
        }
        else {
            elements.push(...this.handleTextContent(markdown));
        }
        return { elements };
    }
    // Markdown转换为飞书Post消息格式（用于发送）
    static markdownToFeishuPost(markdown) {
        const lines = markdown.split('\n');
        const content = [];
        let currentParagraph = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // 检测代码块开始
            if (line.startsWith('```')) {
                // 如果有未完成的段落，先添加
                if (currentParagraph.length > 0) {
                    content.push({
                        tag: 'p',
                        elements: currentParagraph
                    });
                    currentParagraph = [];
                }
                // 解析代码块
                const language = line.slice(3).trim() || 'plaintext';
                let codeLines = [];
                i++;
                while (i < lines.length && !lines[i].startsWith('```')) {
                    codeLines.push(lines[i]);
                    i++;
                }
                content.push({
                    tag: 'code',
                    language,
                    text: codeLines.join('\n')
                });
                continue;
            }
            // 处理标题
            if (line.startsWith('#')) {
                if (currentParagraph.length > 0) {
                    content.push({
                        tag: 'p',
                        elements: currentParagraph
                    });
                    currentParagraph = [];
                }
                let level = 0;
                while (level < line.length && line[level] === '#') {
                    level++;
                }
                const titleText = line.slice(level).trim();
                content.push({
                    tag: `h${Math.min(level, 6)}`,
                    text: titleText
                });
                continue;
            }
            // 处理空行 - 结束当前段落
            if (!line.trim()) {
                if (currentParagraph.length > 0) {
                    content.push({
                        tag: 'p',
                        elements: currentParagraph
                    });
                    currentParagraph = [];
                }
                continue;
            }
            // 处理普通文本行，解析内联元素
            const elements = this.parseInlineElements(line);
            currentParagraph.push(...elements);
        }
        // 添加最后一个段落
        if (currentParagraph.length > 0) {
            content.push({
                tag: 'p',
                elements: currentParagraph
            });
        }
        return {
            content: content.length > 0 ? content : [{
                    tag: 'p',
                    elements: [{ tag: 'text', text: markdown }]
                }]
        };
    }
    // 解析内联元素（链接、粗体、斜体等）
    static parseInlineElements(text) {
        const elements = [];
        let currentText = '';
        let i = 0;
        while (i < text.length) {
            // 检查链接 [text](url)
            if (text[i] === '[' && i + 1 < text.length) {
                const closeBracket = text.indexOf(']', i);
                if (closeBracket !== -1 && closeBracket + 1 < text.length && text[closeBracket + 1] === '(') {
                    const closeParen = text.indexOf(')', closeBracket + 2);
                    if (closeParen !== -1) {
                        if (currentText) {
                            elements.push({ tag: 'text', text: currentText });
                            currentText = '';
                        }
                        const linkText = text.slice(i + 1, closeBracket);
                        const linkUrl = text.slice(closeBracket + 2, closeParen);
                        elements.push({ tag: 'a', text: linkText, href: linkUrl });
                        i = closeParen + 1;
                        continue;
                    }
                }
            }
            // 检查粗体 **text**
            if (text[i] === '*' && i + 1 < text.length && text[i + 1] === '*') {
                const closeBold = text.indexOf('**', i + 2);
                if (closeBold !== -1) {
                    if (currentText) {
                        elements.push({ tag: 'text', text: currentText });
                        currentText = '';
                    }
                    const boldText = text.slice(i + 2, closeBold);
                    elements.push({ tag: 'b', text: boldText });
                    i = closeBold + 2;
                    continue;
                }
            }
            currentText += text[i];
            i++;
        }
        if (currentText) {
            elements.push({ tag: 'text', text: currentText });
        }
        return elements.length > 0 ? elements : [{ tag: 'text', text }];
    }
    // 处理文本内容
    static handleTextContent(text) {
        const result = [];
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            const processedLine = this.processInlineElements(line);
            result.push({
                tag: 'md_block',
                text: processedLine
            });
        }
        return result;
    }
    // 处理代码块
    static handleCodeBlock(block) {
        const match = block.match(/```(\w+)?\s*([\s\S]*?)```/);
        if (match) {
            const language = match[1] || 'plaintext';
            const code = match[2] || '';
            return [{
                    tag: 'code_block',
                    language,
                    code: code.trim()
                }];
        }
        return [];
    }
    // 处理内联元素（链接、强调等）
    static processInlineElements(text) {
        // 处理链接 [text](url)
        return text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, href) => {
            return `[${text}](${href})`;
        });
    }
    // CLI响应转换为飞书消息（兼容接口，返回字符串）
    static cliResponseToFeishu(response) {
        return response;
    }
    // 创建流式响应块
    static createStreamChunk(content) {
        return {
            id: this.generateId(),
            type: 'stream_chunk',
            content,
            timestamp: Date.now()
        };
    }
    // 创建完整响应
    static createCliResponse(content) {
        return {
            id: this.generateId(),
            type: 'cli_response',
            content,
            timestamp: Date.now()
        };
    }
    // 创建流式响应结束标记
    static createStreamEnd() {
        return {
            id: this.generateId(),
            type: 'stream_end',
            timestamp: Date.now()
        };
    }
    // 合并流式响应块
    static mergeStreamChunks(chunks) {
        return chunks.join('');
    }
    // 检测是否是流式响应开始
    static isStreamStart(content) {
        return content.includes('```') && content.split('```').length % 2 === 1;
    }
    // 检测是否是流式响应结束
    static isStreamEnd(content) {
        return content.trim().endsWith('```');
    }
}
exports.MessageConverter = MessageConverter;
