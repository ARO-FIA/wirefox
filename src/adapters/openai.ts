import type { Message, ModelAdapter, ModelResponse, ParameterSchema, ParametersRecord, Tool, ToolCall } from '../types.js';

/** Configuration for the OpenAI-compatible chat completions adapter. */
export interface OpenAIAdapterConfig {
  /** Model identifier such as `"gpt-4o-mini"` or `"llama3.2"`. */
  model: string;
  /** API key sent as a bearer token. Omit for local servers that need no authentication. */
  apiKey?: string;
  /** Base URL for the API. Defaults to `https://api.openai.com/v1`; override for Ollama, Groq, or other compatible hosts. */
  baseURL?: string;
  baseUrl?: string;
  /** Custom fetch implementation, mainly for testing or non-standard runtimes. */
  fetch?: typeof globalThis.fetch;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const KNOWN_API_ROOTS: { host: RegExp; path: string }[] = [
  { host: /(^|\.)groq\.com$/i, path: '/openai/v1' },
  { host: /(^|\.)openrouter\.ai$/i, path: '/api/v1' },
];

function resolveChatCompletionsUrl(rawBaseUrl: string): string {
  const candidate = rawBaseUrl.trim().replace(/\/+$/, '');

  if (candidate.endsWith('/chat/completions')) {
    return candidate;
  }

  let url: URL;

  try {
    url = new URL(candidate);
  } catch {
    throw new Error(
      `Invalid base URL "${rawBaseUrl}". Pass an absolute URL such as "https://api.openai.com/v1", "https://api.groq.com/openai/v1", or "http://localhost:11434/v1".`,
    );
  }

  const path = url.pathname.replace(/\/+$/, '');
  const known = KNOWN_API_ROOTS.find((entry) => entry.host.test(url.hostname));

  if (known) {
    url.pathname =
      path.endsWith(known.path) || known.path.startsWith(`${path}/`) ? known.path : `${path}${known.path}`;
  } else if (path === '') {
    url.pathname = '/v1';
  } else {
    url.pathname = path;
  }

  return `${url.toString().replace(/\/$/, '')}/chat/completions`;
}

interface ChatCompletionChoice {
  index?: number;
  message?: {
    content?: string | null;
    tool_calls?: RawToolCall[];
  };
  finish_reason?: string | null;
}

interface RawToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
}

interface ChatCompletionBody {
  choices?: ChatCompletionChoice[];
}

/**
 * Creates a model adapter that calls an OpenAI-compatible `/chat/completions` endpoint and
 * normalizes the response, including any tool calls, into a `ModelResponse`.
 *
 * @param config Model name plus optional API key, base URL, and fetch implementation.
 * @returns A `ModelAdapter` usable with `createAgent`.
 */
export function openai(config: OpenAIAdapterConfig): ModelAdapter {
  const endpoint = resolveChatCompletionsUrl(
    config.baseURL?.trim() || config.baseUrl?.trim() || DEFAULT_BASE_URL,
  );
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

      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      const rawBody = await response.text();

      if (!response.ok) {
        const status = response.statusText
          ? `${response.status} ${response.statusText}`
          : String(response.status);
        const hint =
          response.status === 404 || response.status === 405
            ? ` The endpoint ${endpoint} rejected the request; check that the base URL points at an OpenAI-compatible API root, for example https://api.groq.com/openai/v1.`
            : '';
        throw new Error(`OpenAI API error (${status}): ${rawBody}${hint}`);
      }

      let data: ChatCompletionBody | null;

      try {
        data = JSON.parse(rawBody) as ChatCompletionBody;
      } catch {
        throw new Error(`OpenAI API returned a malformed JSON body: ${rawBody.slice(0, 200)}`);
      }

      const choices = Array.isArray(data?.choices) ? data.choices : [];
      const choice = choices.find((entry) => entry?.index === 0) ?? choices[0];

      if (!choice?.message) {
        throw new Error('OpenAI API returned no choices.');
      }

      if (choice.finish_reason === 'length') {
        throw new Error(
          'OpenAI API response was truncated because the model hit its token limit (finish_reason: length).',
        );
      }

      if (choice.finish_reason === 'content_filter') {
        throw new Error(
          'OpenAI API response was blocked by the content filter (finish_reason: content_filter).',
        );
      }

      const toolCalls = parseToolCalls(choice.message.tool_calls);

      return {
        content: typeof choice.message.content === 'string' ? choice.message.content : '',
        ...(toolCalls ? { toolCalls } : {}),
      };
    },
  };
}

function parseToolCalls(raw: RawToolCall[] | undefined): ToolCall[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }

  return raw.map((call, index) => {
    const name = call?.function?.name;

    if (typeof name !== 'string' || !name) {
      throw new Error('OpenAI API returned a tool call without a function name.');
    }

    const id = typeof call.id === 'string' && call.id ? call.id : `call_${index}`;
    const argsText = call.function?.arguments;

    if (typeof argsText !== 'string' || argsText.trim() === '') {
      return { id, name, arguments: {} };
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(argsText);
    } catch (err) {
      return {
        id,
        name,
        arguments: {},
        argumentError: `Malformed JSON arguments for tool "${name}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return {
        id,
        name,
        arguments: {},
        argumentError: `Malformed JSON arguments for tool "${name}": expected a JSON object.`,
      };
    }

    return { id, name, arguments: parsed as Record<string, unknown> };
  });
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
