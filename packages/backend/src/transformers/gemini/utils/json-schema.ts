/**
 * Normalizes Gemini's uppercase JSON Schema type names to standard lowercase.
 *
 * Gemini uses uppercase types (OBJECT, STRING, INTEGER, etc.) in responseJsonSchema,
 * but OpenAI-compatible providers expect lowercase JSON Schema types.
 */
export function normalizeJsonSchemaTypes(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;

  if (Array.isArray(schema)) {
    return schema.map(normalizeJsonSchemaTypes);
  }

  const result: any = {};
  for (const key of Object.keys(schema)) {
    if (key === 'type' && typeof schema[key] === 'string') {
      result[key] = schema[key].toLowerCase();
    } else if (typeof schema[key] === 'object' && schema[key] !== null) {
      result[key] = normalizeJsonSchemaTypes(schema[key]);
    } else {
      result[key] = schema[key];
    }
  }
  return result;
}
