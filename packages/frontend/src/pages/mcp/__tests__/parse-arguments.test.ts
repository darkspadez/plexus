/**
 * parse-arguments.test.ts — Tests for the parseArguments shell tokenizer.
 *
 * Locks down the exact behavior of parseArguments so that extracting it to
 * a shared lib doesn't change behavior for existing MCP server configurations.
 */
import { expect, test, describe } from 'vitest';
import { parseArguments } from '../../../lib/parseArguments';

describe('parseArguments', () => {
  test('splits simple whitespace-separated args', () => {
    expect(parseArguments('--port 7345 --host localhost')).toEqual([
      '--port',
      '7345',
      '--host',
      'localhost',
    ]);
  });

  test('returns empty array for empty string', () => {
    expect(parseArguments('')).toEqual([]);
  });

  test('returns empty array for whitespace-only string', () => {
    expect(parseArguments('   \t  ')).toEqual([]);
  });

  test('handles single token (no whitespace)', () => {
    expect(parseArguments('--port')).toEqual(['--port']);
  });

  test('preserves {{PORT}} template token', () => {
    expect(parseArguments('--port {{PORT}}')).toEqual(['--port', '{{PORT}}']);
  });

  test('handles double-quoted arguments (removes quotes)', () => {
    expect(parseArguments('"hello world"')).toEqual(['hello world']);
  });

  test('handles single-quoted arguments (removes quotes)', () => {
    expect(parseArguments("'hello world'")).toEqual(['hello world']);
  });

  test('handles backslash escape outside quotes', () => {
    expect(parseArguments('hello\\ world')).toEqual(['hello world']);
  });

  test('handles backslash escape inside double quotes', () => {
    expect(parseArguments('"hello\\ world"')).toEqual(['hello world']);
  });

  test('trailing backslash is preserved literally', () => {
    expect(parseArguments('foo\\')).toEqual(['foo\\']);
  });

  test('concatenates quoted and unquoted segments', () => {
    expect(parseArguments('hel"lo wor"ld')).toEqual(['hello world']);
  });

  test('handles multiple spaces between args', () => {
    expect(parseArguments('a  b   c')).toEqual(['a', 'b', 'c']);
  });

  test('default MCP args: --port {{PORT}}', () => {
    expect(parseArguments('--port {{PORT}}')).toEqual(['--port', '{{PORT}}']);
  });

  test('handles tabs as whitespace', () => {
    expect(parseArguments('a\tb\tc')).toEqual(['a', 'b', 'c']);
  });

  test('double-quote inside single-quote is literal', () => {
    expect(parseArguments(`'"hello"'`)).toEqual(['"hello"']);
  });

  test('single-quote inside double-quote is literal', () => {
    expect(parseArguments(`"it's"`)).toEqual(["it's"]);
  });

  test('handles complex args string', () => {
    const result = parseArguments('--name "my server" --port {{PORT}} --debug');
    expect(result).toEqual(['--name', 'my server', '--port', '{{PORT}}', '--debug']);
  });
});
