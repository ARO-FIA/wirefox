import type { Message, ModelAdapter, ModelResponse, ParameterSchema, ParametersRecord, Tool, ToolCall } from '../types.js';

export interface OpenAIAdapterConfig {
  model: string;
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

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
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              function: {
                name: string;
                arguments: string;
              };
            }>;
          };
        }>;
      };

      const choice = data.choices?.at(0)?.message;
      if (!choice) {
        throw new Error('OpenAI API returned an empty response.');
      }

      const toolCalls: ToolCall[] | undefined = choice.tool_calls?.map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments || '{}') as Record<string, unknown>,
      }));

      return {
        content: choice.content ?? '',
        ...(toolCalls ? { toolCalls } : {}),
      };
    },
  };
}

function formatMessage(msg: Message): Record<string, unknown> {
  if (msg.role === 'tool') {
    return {
      role: 'tool',
      tool_call_id: msg.toolCallId,
      content: msg.content,
    };
  }

  if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
    return {
      role: 'assistant',
      content: msg.content || null,
      tool_calls: msg.toolCalls.map((tc) => ({
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
    role: msg.role,
    content: msg.content,
  };
}

function formatTool(tool: Pick<Tool, 'name' | 'description' | 'parameters'>): Record<string, unknown> {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: formatObjectSchema(tool.parameters),
    },
  };
}

function formatObjectSchema(params: ParametersRecord): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const [key, schema] of Object.entries(params)) {
    properties[key] = formatParameterSchema(schema);

    if (schema.required !== false) {
      required.push(key);
    }
  }

  return {
    type: 'object',
    properties,
    required,
  };
}

function formatParameterSchema(schema: ParameterSchema): Record<string, unknown> {
  const result: Record<string, unknown> = {
    type: schema.type,
    description: schema.description,
  };

  if (schema.type === 'array' && schema.items) {
    result['items'] = formatParameterSchema(schema.items);
  }

  if (schema.type === 'object' && schema.properties) {
    const nested = formatObjectSchema(schema.properties);
    result['properties'] = nested['properties'];
    result['required'] = nested['required'];
  }

  return result;
}