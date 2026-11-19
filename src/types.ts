export type ParameterType = 'string' | 'number' | 'boolean';

export interface ParameterSchema {
  type: ParameterType;
  description: string;
  required?: boolean;
}

export type ParametersRecord = Record<string, ParameterSchema>;

type InferParamType<T extends ParameterSchema> =
  T['type'] extends 'string' ? string :
  T['type'] extends 'number' ? number :
  T['type'] extends 'boolean' ? boolean :
  unknown;

/**
 * Maps a declarative parameter schema object into a strongly-typed argument object
 * so tool authors get automatic type inference inside `execute` without external schema libraries.
 */
export type InferArgs<T extends ParametersRecord> = {
  [K in keyof T as T[K]['required'] extends false ? never : K]: InferParamType<T[K]>;
} & {
  [K in keyof T as T[K]['required'] extends false ? K : never]?: InferParamType<T[K]>;
};

export interface Tool<TParams extends ParametersRecord = ParametersRecord, TResult = unknown> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: InferArgs<TParams>) => Promise<TResult> | TResult;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ModelResponse {
  content: string;
  toolCalls?: ToolCall[];
}

/**
 * Provider-agnostic interface allowing contributors to plug in OpenAI, Anthropic,
 * Ollama, or mock models into the core agent loop.
 */
export interface ModelAdapter {
  generate: (params: {
    messages: Message[];
    tools: Pick<Tool, 'name' | 'description' | 'parameters'>[];
  }) => Promise<ModelResponse>;
}

export interface AgentConfig {
  model: ModelAdapter;
  tools?: Tool<any, any>[];
  systemPrompt?: string;
  maxSteps?: number;
}

export interface AgentResult {
  output: string;
  messages: Message[];
  steps: number;
}