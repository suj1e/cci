import assert from 'node:assert';
import { describe, it } from 'node:test';
import { MessageConverter } from './messageConverter';

describe('MessageConverter', () => {
  describe('generateId', () => {
    it('should generate unique message IDs', () => {
      const id1 = MessageConverter.generateId();
      const id2 = MessageConverter.generateId();
      assert.notStrictEqual(id1, id2);
      assert.ok(id1.startsWith('msg_'));
    });
  });

  describe('mergeStreamChunks', () => {
    it('should merge stream chunks correctly', () => {
      const chunks = ['Hello', ' ', 'World', '!'];
      const result = MessageConverter.mergeStreamChunks(chunks);
      assert.strictEqual(result, 'Hello World!');
    });

    it('should return empty string for empty chunks', () => {
      const result = MessageConverter.mergeStreamChunks([]);
      assert.strictEqual(result, '');
    });
  });

  describe('markdownToFeishuRichText', () => {
    it('should convert plain text to rich text', () => {
      const result = MessageConverter.markdownToFeishuRichText('Hello World');
      assert.ok(Array.isArray(result.elements));
      assert.ok(result.elements.length > 0);
    });

    it('should handle code blocks', () => {
      const markdown = '```typescript\nconst x = 1;\n```';
      const result = MessageConverter.markdownToFeishuRichText(markdown);
      const codeBlock = result.elements.find((el: any) => el.tag === 'code_block');
      assert.ok(codeBlock);
      assert.strictEqual(codeBlock.language, 'typescript');
      assert.ok(codeBlock.code?.includes('const x = 1;'));
    });
  });
});
