import type { Message, ModelAdapter, ModelResponse, Tool, ToolCall } from '../types.js';

export interface OpenAIAdapterConfig {
  model: string;
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

/**
 * Creates a zero-dependency ModelAdapter for OpenAI and any OpenAI-compatible
 * `/chat/completions` endpoint (such as Ollama, Groq, or OpenRouter).
 */
export function openai(config: OpenAIAdapterConfig): ModelAdapter {
  const baseURL = (config.baseURL ?? 'https://openai.com').replace(/\/$/, '');
  const fetchFn = config.fetch ?? globalThis.fetch;

  return {
    async generate({ messages, tools }): Promise<ModelResponse> {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const body: Record<string, unknown> = {
        model: config.model,
        messages: messages.map(formatMessage),
      };

      if (tools.length > 0) {
        body['tools'] = tools.map(formatTool);
      }

      const response = await fetchFn(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Model request failed (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as OpenAIChatCompletionResponse;
      const message = data.choices?.[0]?.message;

      if (!message) {
        throw new Error('Model response contained no message choices.');
      }

      const content = message.content ?? '';

      if (message.tool_calls && message.tool_calls.length > 0) {
        const toolCalls: ToolCall[] = message.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: parseToolArguments(tc.function.arguments),
        }));

        return { content, toolCalls };
      }

      return { content };
    },
  };
}

function formatMessage(message: Message): Record<string, unknown> {
  if (message.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: message.toolCallId,
      content: message.content,
    };
  }

  if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      })),
    };
  }

  return {
    role: message.role,
    content: message.content,
  };
}

function formatTool(tool: Pick<Tool, 'name' | 'description' | 'parameters'>): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(tool.parameters)) {
    properties[key] = {
      type: schema.type,
      description: schema.description,
    };

    if (schema.required !== false) {
      required.push(key);
    }
  }

  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  };
}

function parseToolArguments(raw: string): Record<string, unknown> {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
}