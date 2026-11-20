import type { ParametersRecord, Tool } from './types.js';

const VALID_PARAM_TYPES = new Set(['string', 'number', 'boolean']);

export function defineTool<TParams extends ParametersRecord, TResult = unknown>(
  definition: Tool<TParams, TResult>,
): Tool<TParams, TResult> {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('defineTool requires a tool definition object.');
  }
  if (typeof definition.name !== 'string' || !definition.name.trim()) {
    throw new TypeError('Tool "name" must be a non-empty string.');
  }
  if (typeof definition.description !== 'string' || !definition.description.trim()) {
    throw new TypeError(`Tool "${definition.name}" must have a non-empty "description".`);
  }
  if (
    !definition.parameters ||
    typeof definition.parameters !== 'object' ||
    Array.isArray(definition.parameters)
  ) {
    throw new TypeError(`Tool "${definition.name}" must have a "parameters" object.`);
  }

  for (const [key, schema] of Object.entries(definition.parameters)) {
    if (!schema || typeof schema !== 'object' || !VALID_PARAM_TYPES.has(schema.type)) {
      throw new TypeError(
        `Parameter "${key}" in tool "${definition.name}" must have type "string", "number", or "boolean".`,
      );
    }
  }

  if (typeof definition.execute !== 'function') {
    throw new TypeError(`Tool "${definition.name}" must provide an "execute" function.`);
  }

  return definition;
}