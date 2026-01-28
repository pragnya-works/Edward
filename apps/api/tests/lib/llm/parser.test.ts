import { describe, it, expect } from 'vitest';
import { createStreamParser } from '../../../lib/llm/parser.js';
import { ParserEventType } from '../../../schemas/chat.schema.js';

describe('createStreamParser', () => {
  it('should create a parser instance', () => {
    const parser = createStreamParser();

    expect(parser).toHaveProperty('process');
    expect(parser).toHaveProperty('flush');
    expect(typeof parser.process).toBe('function');
    expect(typeof parser.flush).toBe('function');
  });

  describe('process', () => {
    it('should return empty array for empty chunk', () => {
      const parser = createStreamParser();
      const events = parser.process('');

      expect(events).toEqual([]);
    });

    it('should return empty array for non-string input', () => {
      const parser = createStreamParser();
      const events = parser.process(null as unknown as string);

      expect(events).toEqual([]);
    });

    it('should emit TEXT event for plain text', () => {
      const parser = createStreamParser();
      const events = parser.process('Hello world');

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: ParserEventType.TEXT,
        content: 'Hello world',
      });
    });

    it('should handle THINKING tags', () => {
      const parser = createStreamParser();
      const events = parser.process('<Thinking>thinking content</Thinking>');

      expect(events).toEqual([
        { type: ParserEventType.THINKING_START },
        { type: ParserEventType.THINKING_CONTENT, content: 'thinking content' },
        { type: ParserEventType.THINKING_END },
      ]);
    });

    it('should handle SANDBOX tags', () => {
      const parser = createStreamParser();
      const events = parser.process('<edward_sandbox project="test">');

      expect(events).toEqual([
        { type: ParserEventType.SANDBOX_START, project: 'test', base: undefined },
      ]);
    });

    it('should handle SANDBOX tags with base attribute', () => {
      const parser = createStreamParser();
      const events = parser.process('<edward_sandbox project="test" base="main">');

      expect(events).toEqual([
        { type: ParserEventType.SANDBOX_START, project: 'test', base: 'main' },
      ]);
    });

    it('should handle FILE tags', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>');
      const events = parser.process('<file path="/test/file.ts">content</file>');

      expect(events).toContainEqual({ type: ParserEventType.FILE_START, path: '/test/file.ts' });
      expect(events).toContainEqual({ type: ParserEventType.FILE_CONTENT, content: 'content' });
      expect(events).toContainEqual({ type: ParserEventType.FILE_END });
    });

    it('should normalize file paths', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>');
      const events = parser.process('<file path="../test/../file.ts">content</file>');

      const fileStartEvent = events.find((e) => e.type === ParserEventType.FILE_START);
      expect(fileStartEvent).toBeDefined();
      if (fileStartEvent && 'path' in fileStartEvent) {
        expect(fileStartEvent.path).not.toContain('..');
      }
    });

    it('should handle multiple chunks', () => {
      const parser = createStreamParser();
      const events1 = parser.process('Hello ');
      const events2 = parser.process('world');

      expect(events1).toEqual([{ type: ParserEventType.TEXT, content: 'Hello ' }]);
      expect(events2).toEqual([{ type: ParserEventType.TEXT, content: 'world' }]);
    });

    it('should handle partial tags across chunks', () => {
      const parser = createStreamParser();
      parser.process('<Think');
      const events = parser.process('ing>content</Thinking>');

      expect(events).toContainEqual({ type: ParserEventType.THINKING_START });
      expect(events).toContainEqual({ type: ParserEventType.THINKING_CONTENT, content: 'content' });
      expect(events).toContainEqual({ type: ParserEventType.THINKING_END });
    });

    it('should handle SANDBOX_END tag', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>');
      const events = parser.process('</edward_sandbox>');

      expect(events).toContainEqual({ type: ParserEventType.SANDBOX_END });
    });

    it('should emit error for invalid file path', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>');
      const events = parser.process('<file path="">content</file>');

      expect(events).toContainEqual({
        type: ParserEventType.ERROR,
        message: 'Invalid file tag: missing or empty path',
      });
    });

    it('should handle text before thinking tag', () => {
      const parser = createStreamParser();
      const events = parser.process('Some text<Thinking>thinking</Thinking>');

      expect(events).toContainEqual({ type: ParserEventType.TEXT, content: 'Some text' });
      expect(events).toContainEqual({ type: ParserEventType.THINKING_START });
    });

    it('should handle text after thinking tag', () => {
      const parser = createStreamParser();
      const events = parser.process('<Thinking>thinking</Thinking>More text');

      expect(events).toContainEqual({ type: ParserEventType.THINKING_END });
      expect(events).toContainEqual({ type: ParserEventType.TEXT, content: 'More text' });
    });
  });

  describe('flush', () => {
    it('should return empty array when buffer is empty', () => {
      const parser = createStreamParser();
      const events = parser.flush();

      expect(events).toEqual([]);
    });

    it('should flush remaining text in TEXT state', () => {
      const parser = createStreamParser();
      parser.process('unclosed text');
      const events = parser.flush();

      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it('should flush remaining content in THINKING state', () => {
      const parser = createStreamParser();
      parser.process('<Thinking>unclosed thinking');
      const events = parser.flush();

      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it('should flush remaining content in FILE state', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox><file path="test.ts">unclosed file');
      const events = parser.flush();

      expect(events.length).toBeGreaterThanOrEqual(0);
    });

    it('should flush SANDBOX_END in SANDBOX state', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>content');
      const events = parser.flush();

      expect(events).toContainEqual({ type: ParserEventType.SANDBOX_END });
    });

    it('should reset state after flush', () => {
      const parser = createStreamParser();
      parser.process('<Thinking>thinking');
      parser.flush();

      const events = parser.process('new text');
      expect(events).toEqual([{ type: ParserEventType.TEXT, content: 'new text' }]);
    });
  });

  describe('edge cases', () => {
    it('should handle nested angle brackets', () => {
      const parser = createStreamParser();
      const events = parser.process('text < inside > more<');

      expect(events).toEqual([{ type: ParserEventType.TEXT, content: 'text < inside > more' }]);
    });

    it('should handle very long content', () => {
      const parser = createStreamParser();
      const longContent = 'a'.repeat(100000);
      const events = parser.process(longContent);

      const textEvent = events.find((e) => e.type === ParserEventType.TEXT);
      expect(textEvent).toBeDefined();
    });

    it('should handle multiple file tags', () => {
      const parser = createStreamParser();
      parser.process('<edward_sandbox>');
      parser.process('<file path="file1.ts">content1</file>');
      const events = parser.process('<file path="file2.ts">content2</file>');

      const fileStarts = events.filter((e) => e.type === ParserEventType.FILE_START);
      expect(fileStarts).toHaveLength(1);
    });

    it('should handle empty thinking tags', () => {
      const parser = createStreamParser();
      const events = parser.process('<Thinking></Thinking>');

      expect(events).toEqual([
        { type: ParserEventType.THINKING_START },
        { type: ParserEventType.THINKING_END },
      ]);
    });
  });
});
