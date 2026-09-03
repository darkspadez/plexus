/**
 * Regression tests for `injectClaudeCodeIdentity` — flagged by automated PR
 * review on #650 (importance 7): the internal `prependToFirstUserMessage`
 * helper mutated the original message object in place (`msg.content = ...`)
 * despite the module's docstring claiming the function does not mutate its
 * input. Verified this never caused a live production bug (pi-ai-executor.ts
 * always calls this pipeline against a freshly `JSON.parse`d body, never a
 * shared object reference), but it was fragile/misleading for any other
 * caller — including these tests, and any future refactor — that might hold
 * a reference to the pre-call body and expect it untouched.
 */

import { describe, expect, it } from 'vitest';
import { injectClaudeCodeIdentity } from '../cc-identity';

describe('injectClaudeCodeIdentity — non-mutation', () => {
  it('does not mutate the original message object when content is an array', () => {
    const originalMessage = { role: 'user', content: [{ type: 'text', text: 'hello' }] };
    const body = {
      system: [{ type: 'text', text: 'some caller system prompt' }],
      messages: [originalMessage],
    };
    const originalContentRef = originalMessage.content;

    injectClaudeCodeIdentity(body);

    expect(originalMessage.content).toBe(originalContentRef);
    expect(originalMessage.content).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('does not mutate the original message object when content is a string', () => {
    const originalMessage = { role: 'user', content: 'hello' };
    const body = {
      system: [{ type: 'text', text: 'some caller system prompt' }],
      messages: [originalMessage],
    };

    injectClaudeCodeIdentity(body);

    expect(originalMessage.content).toBe('hello');
  });

  it('does not mutate the original messages array', () => {
    const originalMessage = { role: 'user', content: 'hello' };
    const originalMessages = [originalMessage];
    const body = {
      system: [{ type: 'text', text: 'some caller system prompt' }],
      messages: originalMessages,
    };

    const result = injectClaudeCodeIdentity(body);

    expect(originalMessages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(result.messages).not.toBe(originalMessages);
  });

  it('still correctly relocates the caller system prompt into a new first user message', () => {
    const body = {
      system: [{ type: 'text', text: 'caller system prompt' }],
      messages: [{ role: 'user', content: 'hello' }],
    };

    const result = injectClaudeCodeIdentity(body);
    const firstUser = result.messages.find((m: any) => m.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain('<system-reminder>');
    expect(content).toContain('caller system prompt');
    expect(content).toContain('hello');
  });

  it('does not duplicate the relocated caller prompt when identity masking runs twice', () => {
    const body = {
      system: [{ type: 'text', text: 'Read AGENTS.md before editing.' }],
      messages: [{ role: 'user', content: 'hello' }],
    };

    const once = injectClaudeCodeIdentity(body);
    const twice = injectClaudeCodeIdentity(once);
    const firstUser = twice.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content.map((part: any) => part.text).join('\n')
      : firstUser.content;

    expect(content.match(/<system-reminder>/g)).toHaveLength(1);
    expect(content.match(/Read AGENTS\.md before editing\./g)).toHaveLength(1);
    expect(twice.system).toHaveLength(3);
    expect(twice.system[1].text).toBe("You are Claude Code, Anthropic's official CLI for Claude.");
  });

  it('preserves Anthropic string-form system content and whitespace verbatim', () => {
    const callerSystemPrompt = '  Keep both leading spaces.\nKeep the trailing tab.\t ';
    const body = {
      system: callerSystemPrompt,
      messages: [{ role: 'user', content: 'hello' }],
    };

    const result = injectClaudeCodeIdentity(body);
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain(`\n${callerSystemPrompt}\n\nIMPORTANT:`);
  });

  it('preserves caller content that happens to equal the static Claude Code prompt', () => {
    const canonical = injectClaudeCodeIdentity({
      messages: [{ role: 'user', content: 'hello' }],
    });
    const callerSystemPrompt = canonical.system[2].text;

    const result = injectClaudeCodeIdentity({
      system: [{ type: 'text', text: callerSystemPrompt }],
      messages: [{ role: 'user', content: 'hello' }],
    });
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain(`\n${callerSystemPrompt}\n\nIMPORTANT:`);
  });

  it.each([
    ['string', 'x-anthropic-billing-header: caller-authored note'],
    ['array', [{ type: 'text', text: 'x-anthropic-billing-header: caller-authored note' }]],
  ])('preserves caller content beginning with the billing prefix in %s form', (_label, system) => {
    const result = injectClaudeCodeIdentity({
      system,
      messages: [{ role: 'user', content: 'hello' }],
    });
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain('x-anthropic-billing-header: caller-authored note');
  });

  it('preserves a single caller array block equal to the generated identity text', () => {
    const callerSystemPrompt = "You are Claude Code, Anthropic's official CLI for Claude.";
    const result = injectClaudeCodeIdentity({
      system: [{ type: 'text', text: callerSystemPrompt }],
      messages: [{ role: 'user', content: 'hello' }],
    });
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain(`\n${callerSystemPrompt}\n\nIMPORTANT:`);
  });

  it('preserves a caller identity-text block when followed by another caller block', () => {
    const callerIdentityText = "You are Claude Code, Anthropic's official CLI for Claude.";
    const secondCallerBlock = 'Follow the repository instructions.';
    const result = injectClaudeCodeIdentity({
      system: [
        { type: 'text', text: callerIdentityText },
        { type: 'text', text: secondCallerBlock },
      ],
      messages: [{ role: 'user', content: 'hello' }],
    });
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain(`\n${callerIdentityText}\n\n${secondCallerBlock}\n\nIMPORTANT:`);
  });

  it('does not treat whitespace-padded canonical-looking blocks as generated identity', () => {
    const canonical = injectClaudeCodeIdentity({
      messages: [{ role: 'user', content: 'hello' }],
    });
    const callerIdentityText = ` ${canonical.system[1].text} `;
    const result = injectClaudeCodeIdentity({
      system: [
        canonical.system[0],
        { ...canonical.system[1], text: callerIdentityText },
        canonical.system[2],
      ],
      messages: [{ role: 'user', content: 'hello' }],
    });
    const firstUser = result.messages.find((message: any) => message.role === 'user');
    const content = Array.isArray(firstUser.content)
      ? firstUser.content[0].text
      : firstUser.content;

    expect(content).toContain(`\n${callerIdentityText}\n\n`);
  });
});
