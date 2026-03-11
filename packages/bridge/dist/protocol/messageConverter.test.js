"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = __importDefault(require("node:assert"));
const node_test_1 = require("node:test");
const messageConverter_1 = require("./messageConverter");
(0, node_test_1.describe)('MessageConverter', () => {
    (0, node_test_1.describe)('generateId', () => {
        (0, node_test_1.it)('should generate unique message IDs', () => {
            const id1 = messageConverter_1.MessageConverter.generateId();
            const id2 = messageConverter_1.MessageConverter.generateId();
            node_assert_1.default.notStrictEqual(id1, id2);
            node_assert_1.default.ok(id1.startsWith('msg_'));
        });
    });
    (0, node_test_1.describe)('mergeStreamChunks', () => {
        (0, node_test_1.it)('should merge stream chunks correctly', () => {
            const chunks = ['Hello', ' ', 'World', '!'];
            const result = messageConverter_1.MessageConverter.mergeStreamChunks(chunks);
            node_assert_1.default.strictEqual(result, 'Hello World!');
        });
        (0, node_test_1.it)('should return empty string for empty chunks', () => {
            const result = messageConverter_1.MessageConverter.mergeStreamChunks([]);
            node_assert_1.default.strictEqual(result, '');
        });
    });
    (0, node_test_1.describe)('markdownToFeishuRichText', () => {
        (0, node_test_1.it)('should convert plain text to rich text', () => {
            const result = messageConverter_1.MessageConverter.markdownToFeishuRichText('Hello World');
            node_assert_1.default.ok(Array.isArray(result.elements));
            node_assert_1.default.ok(result.elements.length > 0);
        });
        (0, node_test_1.it)('should handle code blocks', () => {
            const markdown = '```typescript\nconst x = 1;\n```';
            const result = messageConverter_1.MessageConverter.markdownToFeishuRichText(markdown);
            const codeBlock = result.elements.find((el) => el.tag === 'code_block');
            node_assert_1.default.ok(codeBlock);
            node_assert_1.default.strictEqual(codeBlock.language, 'typescript');
            node_assert_1.default.ok(codeBlock.code?.includes('const x = 1;'));
        });
    });
});
