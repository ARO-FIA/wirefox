import { describe, expect, it, vi } from 'vitest';
import { createAgent, defineTool } from '../src/index.js';

describe('plain JavaScript parity', () => {
  it('validates defineTool inputs at runtime for JS callers', () => {
    expect(() => defineTool({})).toThrow('Tool "name" must be a non-empty string.');

    expect(() =>
      defineTool({
        name: 'bad_param',
        description: 'Invalid parameter type',
        parameters: {
          count: { type: 'integer', description: 'Should be number' },
        },
        execute: () => {},
      }),
    ).toThrow('Parameter "count" in tool "bad_param" must have type "string", "number", or "boolean".');

    expect(() =>
      defineTool({
        name: 'missing_fn',
        description: 'No execute function',
        parameters: {},
      }),
    ).toThrow('Tool "missing_fn" must provide an "execute" function.');
  });

  it('catches hallucinated argument types at runtime and feeds the error back to the model', async () => {
    const multiply = defineTool({
      name: 'multiply',
      description: 'Multiply two numbers',
      parameters: {
        a: { type: 'number', description: 'First number' },
        b: { type: 'number', description: 'Second number' },
      },
      execute: ({ a, b }) => a * b,
    });

    const mockModel = {
      generate: vi
        .fn()
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ id: 'call_bad', name: 'multiply', arguments: { a: 'not-a-number', b: 4 } }],
        })
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [{ id: 'call_good', name: 'multiply', arguments: { a: 3, b: 4 } }],
        })
        .mockResolvedValueOnce({
          content: '3 multiplied by 4 is 12.',
        }),
    };

    const fox = createAgent({
      model: mockModel,
      tools: [multiply],
    });

    const result = await fox.run('Multiply 3 and 4');

    expect(result.output).toBe('3 multiplied by 4 is 12.');
    expect(result.steps).toBe(3);
    expect(result.messages.at(2)?.content).toContain('expected number, got string');
  });
});