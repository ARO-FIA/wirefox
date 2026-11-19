import type { AgentConfig, AgentResult, Message, Tool } from './types.js';

export function createAgent(config: AgentConfig) {
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
    }

    throw new Error(`Agent exceeded maximum tool loop steps (${maxSteps}).`);
  }

  return { run };
}