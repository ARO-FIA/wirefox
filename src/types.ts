/** Allowed data types for a tool parameter schema. */
export type ParameterType = 'string' | 'number' | 'boolean' | 'array' | 'object';

/** Declarative description of a single tool parameter or nested value. */
export interface ParameterSchema {
  /** Data type expected for the value. */
  type: ParameterType;
  /** Description shown to the model when it chooses arguments. */
  description: string;
  /** Set to `false` to make the parameter optional. Defaults to required. */
  required?: boolean;
  /** Element schema used when `type` is `"array"`. */
  items?: ParameterSchema;
  /** Nested schemas used when `type` is `"object"`. */
  properties?: ParametersRecord;
}

/** Map of parameter names to their schemas. */
export type ParametersRecord = Record<string, ParameterSchema>;

type InferParamType<T extends ParameterSchema> =
  T['type'] extends 'string' ? string :
  T['type'] extends 'number' ? number :
  T['type'] extends 'boolean' ? boolean :
  T['type'] extends 'array' ? (T['items'] extends ParameterSchema ? InferParamType<T['items']>[] : unknown[]) :
  T['type'] extends 'object' ? (T['properties'] extends ParametersRecord ? InferArgs<T['properties']> : Record<string, unknown>) :
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

/** A capability the model can invoke, pairing its schema with its implementation. */
export interface Tool<TParams extends ParametersRecord = ParametersRecord, TResult = unknown> {
  /** Unique name the model uses to call the tool. */
  name: string;
  /** Description that helps the model decide when to call the tool. */
  description: string;
  /** Declarative schema of the tool's arguments. */
  parameters: TParams;
  /** Executes the tool with arguments inferred from `TParams`. */
  execute: (args: InferArgs<TParams>) => Promise<TResult> | TResult;
}

/** A tool invocation requested by the model. */
export interface ToolCall {
  /** Provider-assigned identifier used to match the tool result. */
  id: string;
  /** Name of the tool to run. */
  name: string;
  /** Arguments supplied by the model. */
  arguments: Record<string, unknown>;
}

/** A single message in the conversation sent to the model. */
export interface Message {
  /** Conversation role of the message. */
  role: 'system' | 'user' | 'assistant' | 'tool';
  /** Text content of the message. */
  content: string;
  /** Tool calls requested by an assistant message. */
  toolCalls?: ToolCall[];
  /** Identifier of the tool call this tool message responds to. */
  toolCallId?: string;
}

/** Normalized model output returned by a `ModelAdapter`. */
export interface ModelResponse {
  /** Assistant text, empty when the model only returns tool calls. */
  content: string;
  /** Tool calls the model wants executed. */
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

/** Snapshot of the conversation emitted after each agent step. */
export interface StepEvent {
  /** One-based step number. */
  step: number;
  /** Copy of the messages at this point in the loop. */
  messages: Message[];
}

/** Details of a tool call about to be executed. */
export interface ToolCallEvent {
  /** Identifier of the tool call. */
  id: string;
  /** Name of the tool being called. */
  name: string;
  /** Arguments the tool will receive. */
  arguments: Record<string, unknown>;
}

/** An agent that runs prompts through a model and tool loop. */
export interface Agent {
  /** Runs a prompt to completion and resolves the final result. */
  run: (prompt: string) => Promise<AgentResult>;
}

/** Configuration for `createAgent`. */
export interface AgentConfig {
  /** Model adapter used to generate responses. */
  model: ModelAdapter;
  /** Tools available to the model. */
  tools?: Tool<any, any>[];
  /** System prompt prepended to every run. */
  systemPrompt?: string;
  /** Maximum model calls per run. Defaults to 10. */
  maxSteps?: number;
  /** Called after each completed step. */
  onStep?: (event: StepEvent) => void | Promise<void>;
  /** Called before each tool execution. */
  onToolCall?: (event: ToolCallEvent) => void | Promise<void>;
}

/** Outcome of a completed agent run. */
export interface AgentResult {
  /** Final assistant text. */
  output: string;
  /** Full conversation produced during the run. */
  messages: Message[];
  /** Number of model calls made. */
  steps: number;
}
