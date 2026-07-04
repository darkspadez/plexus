/**
 * parseArguments — shell-like argument tokenizer.
 *
 * Splits a string into an array of tokens, handling:
 *   - Single-quoted strings (no escape processing inside)
 *   - Double-quoted strings (backslash escape inside)
 *   - Backslash escapes outside quotes
 *   - Whitespace as token delimiter (outside quotes)
 *
 * Extracted from Mcp.tsx so it can be shared with McpServerSheet.tsx and
 * tested in isolation.
 */
export function parseArguments(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let quote: 'single' | 'double' | null = null;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === '\\') {
      escaping = true;
      continue;
    }
    if (char === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double';
      continue;
    }
    if (char === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single';
      continue;
    }
    if (/\s/.test(char) && quote === null) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (escaping) current += '\\';
  if (current) args.push(current);
  return args;
}
