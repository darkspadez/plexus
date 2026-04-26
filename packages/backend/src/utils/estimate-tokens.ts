import { logger } from './logger';
import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';

let encoder: Tiktoken | undefined;
const MULTIMODAL_METADATA_KEYS = new Set(['image_url', 'media_type', 'detail']);

function getEncoder(): Tiktoken {
  if (encoder) return encoder;
  encoder = new Tiktoken(o200kBase);
  return encoder;
}

function estimateHighlyRepetitiveText(text: string): number | undefined {
  if (text.length < 1_000) return undefined;

  const uniqueChars = new Set(text);
  // Long one/two-character runs are a pathological case for the pure-JS BPE
  // implementation; sampling preserves the repeated-token merge ratio without
  // spending seconds tokenizing prompts such as "xxxx...".
  if (uniqueChars.size > 2) return undefined;

  const sampleLength = 800;
  const sample = text.slice(0, sampleLength);
  const sampleTokens = getEncoder().encode(sample).length;
  return Math.max(1, Math.ceil((sampleTokens * text.length) / sampleLength));
}

/**
 * Estimates the number of tokens in a text string using OpenAI-compatible BPE
 * tokenization when possible, with a character-based heuristic fallback.
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) return 0;

  try {
    return estimateHighlyRepetitiveText(text) ?? getEncoder().encode(text).length;
  } catch (err) {
    logger.warn('Falling back to heuristic token estimation:', err);
  }

  // Base character count
  const charCount = text.length;

  // Start with character-based estimate (roughly 4 chars per token)
  let tokenEstimate = charCount / 4;

  // Adjust for whitespace density
  const whitespaceCount = (text.match(/\s/g) || []).length;
  const whitespaceRatio = whitespaceCount / charCount;

  // More whitespace = fewer tokens (words are longer)
  // Less whitespace = more tokens (compressed text, code)
  if (whitespaceRatio > 0.15) {
    tokenEstimate *= 0.95; // Natural prose
  } else if (whitespaceRatio < 0.1) {
    tokenEstimate *= 1.1; // Dense text/code
  }

  // Count special sequences that tokenize differently
  const jsonBrackets = (text.match(/[{}\[\]]/g) || []).length;
  const punctuation = (text.match(/[.,;:!?]/g) || []).length;
  const numbers = (text.match(/\d+/g) || []).length;
  const urls = (text.match(/https?:\/\/[^\s]+/g) || []).length;

  // Adjust for these patterns
  tokenEstimate += jsonBrackets * 0.5; // Brackets often tokenize separately
  tokenEstimate += punctuation * 0.3; // Punctuation can be separate tokens
  tokenEstimate += numbers * 0.2; // Numbers vary widely
  tokenEstimate += urls * 2; // URLs are token-dense

  // Count code patterns
  const codeIndicators =
    (text.match(/[=<>!&|]{2}/g) || []).length + // ==, <=, >=, !=, &&, ||
    (text.match(/\w+\(/g) || []).length + // function calls
    (text.match(/\n {2,}/g) || []).length; // indentation

  if (codeIndicators > charCount / 100) {
    tokenEstimate *= 1.08; // Code is more token-dense
  }

  // Count rare/special characters
  const specialChars = (text.match(/[^\w\s.,;:!?'"()\[\]{}<>\/\\-]/g) || []).length;
  tokenEstimate += specialChars * 0.4; // Unicode, emojis tokenize inefficiently

  // Adjust for repeated patterns (compression-friendly)
  const uniqueChars = new Set(text).size;
  const repetitionRatio = uniqueChars / charCount;
  if (repetitionRatio < 0.05) {
    tokenEstimate *= 0.9; // Very repetitive text
  }

  return Math.round(tokenEstimate);
}

function countTextContent(value: unknown): number {
  if (typeof value === 'string') {
    return estimateTokens(value);
  }

  if (Array.isArray(value)) {
    return value.reduce((total, item) => total + countTextContent(item), 0);
  }

  if (value && typeof value === 'object') {
    let total = 0;
    for (const [key, nested] of Object.entries(value)) {
      if (MULTIMODAL_METADATA_KEYS.has(key)) {
        // Image token accounting depends on dimensions/detail and cannot be
        // inferred reliably from the URL alone.
        continue;
      }
      total += countTextContent(nested);
    }
    return total;
  }

  return 0;
}

function estimateChatMessages(messages: unknown): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;

  let total = 3; // Assistant response priming overhead in OpenAI ChatML.
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    const msg = message as Record<string, unknown>;

    total += 3; // OpenAI ChatML message boundary and role separator overhead.
    total += countTextContent(msg.content);

    if (typeof msg.name === 'string') {
      total += 1 + estimateTokens(msg.name);
    }
    if (typeof msg.tool_call_id === 'string') {
      total += estimateTokens(msg.tool_call_id);
    }
    if (Array.isArray(msg.tool_calls)) {
      total += estimateTokens(JSON.stringify(msg.tool_calls));
    }
  }

  return total;
}

function estimateStructuredInput(value: unknown): number {
  const textTokens = countTextContent(value);
  if (textTokens === 0) return 0;

  const structuralItems = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? Object.keys(value).length
      : 0;

  return textTokens + structuralItems * 2;
}

/**
 * Estimates input tokens from the original request body
 *
 * @param originalBody - The original request body
 * @param apiType - The API type (chat, messages, gemini)
 * @returns Estimated input token count
 */
export function estimateInputTokens(originalBody: any, apiType: string): number {
  try {
    switch (apiType.toLowerCase()) {
      case 'chat':
        return (
          estimateChatMessages(originalBody.messages) +
          (originalBody.tools ? estimateTokens(JSON.stringify(originalBody.tools)) : 0) +
          (originalBody.response_format
            ? estimateTokens(JSON.stringify(originalBody.response_format))
            : 0)
        );

      case 'messages':
        return (
          estimateChatMessages(originalBody.messages) +
          estimateStructuredInput(originalBody.system) +
          (originalBody.tools ? estimateTokens(JSON.stringify(originalBody.tools)) : 0)
        );

      case 'gemini':
        return (
          estimateStructuredInput(originalBody.contents) +
          estimateStructuredInput(originalBody.systemInstruction) +
          (originalBody.tools ? estimateTokens(JSON.stringify(originalBody.tools)) : 0)
        );

      case 'responses':
        return (
          estimateStructuredInput(originalBody.input) +
          estimateStructuredInput(originalBody.instructions) +
          (originalBody.tools ? estimateTokens(JSON.stringify(originalBody.tools)) : 0) +
          (originalBody.text?.format ? estimateTokens(JSON.stringify(originalBody.text.format)) : 0)
        );

      default:
        return estimateStructuredInput(originalBody);
    }
  } catch (err) {
    logger.error('Failed to estimate input tokens:', err);
    return 0;
  }
}

/**
 * Extracts text content from a reconstructed chat completions response
 */
function extractChatContent(reconstructed: any): { output: string; reasoning: string } {
  let output = '';
  let reasoning = '';

  if (!reconstructed?.choices) return { output, reasoning };

  for (const choice of reconstructed.choices) {
    const delta = choice.delta || {};

    // Extract output content
    if (typeof delta.content === 'string') {
      output += delta.content;
    }

    // Extract reasoning content
    if (typeof delta.reasoning_content === 'string') {
      reasoning += delta.reasoning_content;
    }

    // Extract tool call arguments
    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const toolCall of delta.tool_calls) {
        if (toolCall.function?.arguments) {
          output += toolCall.function.arguments;
        }
      }
    }
  }

  return { output, reasoning };
}

/**
 * Extracts text content from a reconstructed Anthropic messages response
 */
function extractMessagesContent(reconstructed: any): { output: string; reasoning: string } {
  let output = '';
  let reasoning = '';

  if (!reconstructed?.content || !Array.isArray(reconstructed.content)) {
    return { output, reasoning };
  }

  for (const block of reconstructed.content) {
    if (block.type === 'text' && block.text) {
      output += block.text;
    } else if (block.type === 'thinking' && block.thinking) {
      reasoning += block.thinking;
    } else if (block.type === 'thought' && block.thought) {
      reasoning += block.thought;
    } else if (block.type === 'tool_use' && block.input) {
      // Tool use input as JSON
      output += JSON.stringify(block.input);
    }
  }

  return { output, reasoning };
}

/**
 * Extracts text content from a reconstructed Gemini response
 */
function extractGeminiContent(reconstructed: any): { output: string; reasoning: string } {
  let output = '';
  let reasoning = '';

  if (!reconstructed?.candidates || !Array.isArray(reconstructed.candidates)) {
    return { output, reasoning };
  }

  for (const candidate of reconstructed.candidates) {
    if (!candidate.content?.parts || !Array.isArray(candidate.content.parts)) {
      continue;
    }

    for (const part of candidate.content.parts) {
      if (part.text) {
        // Check if this is a thought/reasoning part
        if (part.thought === true) {
          reasoning += part.text;
        } else {
          output += part.text;
        }
      } else if (part.functionCall) {
        // Function call arguments as JSON
        output += JSON.stringify(part.functionCall);
      }
    }
  }

  return { output, reasoning };
}

function extractOAuthContent(reconstructed: any): { output: string; reasoning: string } {
  let output = '';
  let reasoning = '';

  if (!reconstructed) return { output, reasoning };

  if (typeof reconstructed.content === 'string') {
    output += reconstructed.content;
  }

  if (typeof reconstructed.reasoning_content === 'string') {
    reasoning += reconstructed.reasoning_content;
  }

  if (reconstructed.tool_calls && Array.isArray(reconstructed.tool_calls)) {
    for (const toolCall of reconstructed.tool_calls) {
      if (toolCall?.function?.arguments) {
        output += toolCall.function.arguments;
      }
    }
  }

  return { output, reasoning };
}

/**
 * Estimates tokens from a reconstructed response based on API type
 *
 * @param reconstructed - The reconstructed response object
 * @param apiType - The API type (chat, messages, gemini)
 * @returns Estimated token counts for output and reasoning
 */
export function estimateTokensFromReconstructed(
  reconstructed: any,
  apiType: string
): { output: number; reasoning: number } {
  if (!reconstructed) {
    return { output: 0, reasoning: 0 };
  }

  let outputText = '';
  let reasoningText = '';

  try {
    switch (apiType.toLowerCase()) {
      case 'chat':
        const chatContent = extractChatContent(reconstructed);
        outputText = chatContent.output;
        reasoningText = chatContent.reasoning;
        break;

      case 'messages':
        const messagesContent = extractMessagesContent(reconstructed);
        outputText = messagesContent.output;
        reasoningText = messagesContent.reasoning;
        break;

      case 'gemini':
        const geminiContent = extractGeminiContent(reconstructed);
        outputText = geminiContent.output;
        reasoningText = geminiContent.reasoning;
        break;
      case 'oauth':
        const oauthContent = extractOAuthContent(reconstructed);
        outputText = oauthContent.output;
        reasoningText = oauthContent.reasoning;
        break;

      default:
        logger.warn(`Unknown API type for token estimation: ${apiType}`);
        return { output: 0, reasoning: 0 };
    }

    return {
      output: estimateTokens(outputText),
      reasoning: estimateTokens(reasoningText),
    };
  } catch (err) {
    logger.error(`Failed to estimate tokens from reconstructed response:`, err);
    return { output: 0, reasoning: 0 };
  }
}
