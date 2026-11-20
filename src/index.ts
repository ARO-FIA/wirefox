/**
 * wirefox: a zero-dependency AI agent and tool-loop micro-framework for TypeScript and JavaScript.
 *
 * @module
 */
export { defineTool } from './tool.js';
export { createAgent } from './agent.js';
export { openai } from './adapters/openai.js';
export type { OpenAIAdapterConfig } from './adapters/openai.js';
export type {
  ParameterType,
  ParameterSchema,
  ParametersRecord,
  InferArgs,
  Tool,
  ToolCall,
  Message,
  ModelResponse,
  ModelAdapter,
  StepEvent,
  ToolCallEvent,
  Agent,
  AgentConfig,
  AgentResult,
} from './types.js';
