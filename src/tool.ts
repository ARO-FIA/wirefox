import type { ParametersRecord, Tool } from './types.js';

export function defineTool<TParams extends ParametersRecord, TResult = unknown>(
  definition: Tool<TParams, TResult>,
): Tool<TParams, TResult> {
  return definition;
}