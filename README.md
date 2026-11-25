<div align="center">
  <img src="./assets/wirefox-banner.png" alt="wirefox banner" width="100%" />

  # wirefox

  Zero-dependency AI agent and tool-loop micro-framework for TypeScript and JavaScript.

  [![npm](https://img.shields.io/npm/v/wirefox?style=for-the-badge)](https://www.npmjs.com/package/wirefox)
  [![releases](https://img.shields.io/github/v/release/ARO-FIA/wirefox?include_prereleases&style=for-the-badge)](https://github.com/ARO-FIA/wirefox/releases)
  [![license](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](./LICENSE)
  [![JSR](https://img.shields.io/badge/JSR-0.3.2-F7DF1E?style=for-the-badge&logo=jsr&logoColor=F7DF1E&labelColor=121212)](https://jsr.io/@aro-fia/wirefox)
[![JSR Score](https://img.shields.io/badge/JSR_Score-100%25-brightgreen?style=for-the-badge&logo=jsr&logoColor=F7DF1E&labelColor=121212)](https://jsr.io/@aro-fia/wirefox/score)

</div>

## Install

```bash
npm install wirefox
```

## Quickstart

Before using this code, please not if you are using `.ts` or `.tsx` you will need a `package.json` with
```json
{
  "type": "module"
}
```
inside it. File extensions that should work without package.json are the following: `.mts`, `.mjs`, `.js`, `.jsx`, `.cts`, and `.cjs`

```typescript
import { createAgent, defineTool, openai } from 'wirefox';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    city: { type: 'string', description: 'City name, e.g. Johannesburg' },
    units: {
      type: 'string',
      description: 'Units for the temperature, either celsius or fahrenheit',
      required: false,
    },
  },
  execute: async ({ city, units }) => ({
    city,
    units: units ?? 'celsius',
    temp: 24,
    condition: 'Sunny',
  }),
});

const fox = createAgent({
  model: openai({
    model: 'gpt-4o-mini',
    apiKey: process.env.API_KEY ?? '',
  }),
  tools: [weatherTool],
  systemPrompt: 'You are a concise weather assistant. Always call a tool before answering.',
  maxSteps: 5,
  onToolCall: (event) => {
    console.log(`Calling ${event.name}`, event.arguments);
  },
  onStep: (event) => {
    console.log(`Step ${event.step} finished with ${event.messages.length} messages`);
  },
});

const result = await fox.run('What is the weather in Sandton right now?');
console.log(result.output);
console.log(`Took ${result.steps} model calls`);
```

## Local & OpenAI-Compatible Models

`openai()` works out of the box with Ollama, Groq, OpenRouter, or LM Studio by overriding `baseURL`:

```typescript
const fox = createAgent({
  model: openai({
    model: 'llama3.2',
    baseURL: 'http://localhost:11434/v1',
  }),
  tools: [weatherTool],
});
```

## Contributing & License

Want to add a provider adapter or improve tests? See [CONTRIBUTING.md](./CONTRIBUTING.md).

Licensed under [MIT](./LICENSE).
