import { describe, expect, it, vi } from 'vitest';
import { createAgent, defineTool, openai } from '../src/index.js';
import type { ModelAdapter } from '../src/index.js';

describe('wirefox agent loop', () => {
  it('returns direct model output when no tools are called', async () => {
    const mockModel: ModelAdapter = {
      generate: vi.fn().mockResolvedValueOnce({
        content: 'Hello from wirefox!',
      }),
    };

    const fox = createAgent({ model: mockModel });
    const result = await fox.run('Say hi');

    expect(result.output).toBe('Hello from wirefox!');
    expect(result.steps).toBe(1);
    expect(mockModel.generate).toHaveBeenCalledTimes(1);
  });

  it('executes a requested tool and feeds the result back to the model', async () => {
    const weatherTool = defineTool({
      name: 'get_weather',
      description: 'Get current weather for a city',
      parameters: {
        city: { type: 'string', description: 'City name' },
      },
      execute: async ({ city }) => ({
        city,
        temp: 25,
        condition: 'Sunny',
      }),
    });

    const mockModel: ModelAdapter = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Sandton' },
            },
          ],
        })
        .mockResolvedValueOnce({
          content: 'It is currently 25°C and Sunny in Sandton.',
        }),
    };

    const fox = createAgent({
      model: mockModel,
      tools: [weatherTool],
    });

    const result = await fox.run('What is the weather in Sandton?');

    expect(result.output).toBe('It is currently 25°C and Sunny in Sandton.');
    expect(result.steps).toBe(2);
    expect(result.messages).toHaveLength(4);
  });

  it('infers array and nested object types in TypeScript', async () => {
    const tagTool = defineTool({
      name: 'tag_user',
      description: 'Tags a user profile',
      parameters: {
        tags: {
          type: 'array',
          description: 'List of tags',
          items: { type: 'string', description: 'Tag' },
        },
        profile: {
          type: 'object',
          description: 'User profile',
          properties: {
            username: { type: 'string', description: 'Handle' },
            active: { type: 'boolean', description: 'Active flag', required: false },
          },
        },
      },
      execute: ({ tags, profile }) => `${profile.username}:${tags.length}`,
    });

    const mockModel: ModelAdapter = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_ts_nested',
              name: 'tag_user',
              arguments: { tags: ['alpha', 'beta'], profile: { username: 'aro' } },
            },
          ],
        })
        .mockResolvedValueOnce({ content: 'Tagged!' }),
    };

    const fox = createAgent({ model: mockModel, tools: [tagTool] });
    const result = await fox.run('Tag aro');

    expect(result.output).toBe('Tagged!');
  });

  it('invokes onToolCall and onStep lifecycle hooks in order', async () => {
    const events: string[] = [];

    const echoTool = defineTool({
      name: 'echo',
      description: 'Echoes text',
      parameters: {
        text: { type: 'string', description: 'Text to echo' },
      },
      execute: ({ text }) => {
        events.push(`execute:${text}`);
        return text;
      },
    });

    const mockModel: ModelAdapter = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ id: 'call_1', name: 'echo', arguments: { text: 'hello' } }],
        })
        .mockResolvedValueOnce({
          content: 'Done!',
        }),
    };

    const fox = createAgent({
      model: mockModel,
      tools: [echoTool],
      onToolCall: ({ name, arguments: args }) => {
        events.push(`onToolCall:${name}:${String(args['text'])}`);
      },
      onStep: ({ step }) => {
        events.push(`onStep:${step}`);
      },
    });

    await fox.run('Test hooks');

    expect(events).toEqual([
      'onToolCall:echo:hello',
      'execute:hello',
      'onStep:1',
      'onStep:2',
    ]);
  });

  it('catches tool execution errors and passes them gracefully to the model', async () => {
    const failingTool = defineTool({
      name: 'broken_tool',
      description: 'Always fails',
      parameters: {},
      execute: async () => {
        throw new Error('Database offline');
      },
    });

    const mockModel: ModelAdapter = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ id: 'call_err', name: 'broken_tool', arguments: {} }],
        })
        .mockResolvedValueOnce({
          content: 'Sorry, the database is currently offline.',
        }),
    };

    const fox = createAgent({
      model: mockModel,
      tools: [failingTool],
    });

    const result = await fox.run('Run broken tool');

    expect(result.output).toBe('Sorry, the database is currently offline.');
    expect(result.messages.at(2)?.content).toContain('Database offline');
  });

  it('throws when the agent exceeds maxSteps', async () => {
    const loopTool = defineTool({
      name: 'ping',
      description: 'Returns pong',
      parameters: {},
      execute: () => 'pong',
    });

    const infiniteModel: ModelAdapter = {
      generate: vi.fn().mockResolvedValue({
        content: '',
        toolCalls: [{ id: 'call_loop', name: 'ping', arguments: {} }],
      }),
    };

    const fox = createAgent({
      model: infiniteModel,
      tools: [loopTool],
      maxSteps: 2,
    });

    await expect(fox.run('Loop forever')).rejects.toThrow(
      'Agent exceeded maximum tool loop steps (2).',
    );
  });
});

describe('openai adapter', () => {
  it('formats tools into JSON schema and parses tool calls from API responses', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [
                    {
                      id: 'call_abc',
                      type: 'function',
                      function: {
                        name: 'add',
                        arguments: '{"a":2,"b":3}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: 'The sum is 5.',
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    const addTool = defineTool({
      name: 'add',
      description: 'Add two numbers',
      parameters: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      execute: ({ a, b }) => a + b,
    });

    const fox = createAgent({
      model: openai({
        model: 'gpt-4o-mini',
        apiKey: 'test-key',
        fetch: mockFetch,
      }),
      tools: [addTool],
    });

    const result = await fox.run('What is 2 + 3?');

    expect(result.output).toBe('The sum is 5.');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});