import type { AgentConfig, AgentResult, Message, ParameterSchema, ParametersRecord, Tool } from './types.js';

export function createAgent(config: AgentConfig) {
  if (!config || typeof config !== 'object') {
    throw new TypeError('createAgent requires a configuration object.');
  }
  if (!config.model || typeof config.model.generate !== 'function') {
    throw new TypeError('createAgent requires a valid "model" adapter with a generate() method.');
  }
  if (config.maxSteps !== undefined && (typeof config.maxSteps !== 'number' || config.maxSteps < 1)) {
    throw new TypeError('"maxSteps" must be a positive number.');
  }
  if (config.onStep !== undefined && typeof config.onStep !== 'function') {
    throw new TypeError('"onStep" must be a function.');
  }
  if (config.onToolCall !== undefined && typeof config.onToolCall !== 'function') {
    throw new TypeError('"onToolCall" must be a function.');
  }

  const maxSteps = config.maxSteps ?? 10;
  const toolMap = new Map<string, Tool<any, any>>();

  for (const tool of config.tools ?? []) {
    toolMap.set(tool.name, tool);
  }

  const toolSchemas = Array.from(toolMap.values()).map(({ name, description, parameters }) => ({
    name,
    description,
    parameters,
  }));

  async function run(prompt: string): Promise<AgentResult> {
    if (typeof prompt !== 'string' || !prompt.trim()) {
      throw new TypeError('agent.run() requires a non-empty prompt string.');
    }

    const messages: Message[] = [];

    if (config.systemPrompt) {
      messages.push({ role: 'system', content: config.systemPrompt });
    }

    messages.push({ role: 'user', content: prompt });

    let steps = 0;

    while (steps < maxSteps) {
      steps++;

      const response = await config.model.generate({
        messages,
        tools: toolSchemas,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
      };

      if (response.toolCalls && response.toolCalls.length > 0) {
        assistantMessage.toolCalls = response.toolCalls;
      }

      messages.push(assistantMessage);

      if (!response.toolCalls || response.toolCalls.length === 0) {
        await config.onStep?.({ step: steps, messages: [...messages] });
        return {
          output: response.content,
          messages,
          steps,
        };
      }

      for (const call of response.toolCalls) {
        const tool = toolMap.get(call.name);

        if (!tool) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ error: `Tool "${call.name}" is not registered.` }),
          });
          continue;
        }

        const validationError = validateToolArguments(tool, call.arguments);
        if (validationError) {
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ error: validationError }),
          });
          continue;
        }

        await config.onToolCall?.({
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        });

        try {
          const result = await tool.execute(call.arguments);
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: typeof result === 'string' ? result : JSON.stringify(result),
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: JSON.stringify({ error: errorMessage }),
          });
        }
      }

      await config.onStep?.({ step: steps, messages: [...messages] });
    }

    throw new Error(`Agent exceeded maximum tool loop steps (${maxSteps}).`);
  }

  return { run };
}

function validateToolArguments(
  tool: Tool,
  args: Record<string, unknown>,
): string | null {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return `Invalid arguments for "${tool.name}": expected an object.`;
  }

  return validateObjectProperties(tool.name, '', tool.parameters, args);
}

function validateObjectProperties(
  toolName: string,
  prefix: string,
  properties: ParametersRecord,
  obj: Record<string, unknown>,
): string | null {
  for (const [key, schema] of Object.entries(properties)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value === undefined || value === null) {
      if (schema.required !== false) {
        return `Missing required argument "${path}" for tool "${toolName}".`;
      }
      continue;
    }

    const error = validateValue(toolName, path, schema, value);
    if (error) return error;
  }

  return null;
}

function validateValue(
  toolName: string,
  path: string,
  schema: ParameterSchema,
  value: unknown,
): string | null {
  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      return `Invalid type for argument "${path}" in tool "${toolName}": expected array, got ${typeof value}.`;
    }

    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const itemError = validateValue(toolName, `${path}[${i}]`, schema.items, value[i]);
        if (itemError) return itemError;
      }
    }

    return null;
  }

  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return `Invalid type for argument "${path}" in tool "${toolName}": expected object, got ${Array.isArray(value) ? 'array' : typeof value}.`;
    }

    if (schema.properties) {
      return validateObjectProperties(
        toolName,
        path,
        schema.properties,
        value as Record<string, unknown>,
      );
    }

    return null;
  }

  if (typeof value !== schema.type) {
    return `Invalid type for argument "${path}" in tool "${toolName}": expected ${schema.type}, got ${typeof value}.`;
  }

  return null;
}