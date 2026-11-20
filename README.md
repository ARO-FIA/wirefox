<div align="center">
  <img src="./assets/wirefox-banner.png" alt="wirefox banner" width="100%" />

  # wirefox

  Zero-dependency AI agent and tool-loop micro-framework for TypeScript and JavaScript.

  [![npm](https://img.shields.io/npm/v/wirefox/beta?style=for-the-badge)](https://www.npmjs.com/package/wirefox)
  [![releases](https://img.shields.io/github/v/release/ARO-FIA/wirefox?include_prereleases&style=for-the-badge)](https://github.com/ARO-FIA/wirefox/releases)
  [![license](https://img.shields.io/badge/license-MIT-blue.svg?style=for-the-badge)](./LICENSE)
</div>

## Install

```bash
npm install wirefox
```

## Quickstart

Works identically in `.ts` and plain `.js` with full runtime validation and editor autocomplete:

```typescript
import { createAgent, defineTool, openai } from 'wirefox';

const weatherTool = defineTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  parameters: {
    city: { type: 'string', description: 'City name, e.g. Johannesburg' },
  },
  execute: async ({ city }) => ({ city, temp: 24, condition: 'Sunny' }),
});

const fox = createAgent({
  model: openai({
    model: 'gpt-4o-mini',
    apiKey: process.env.OPENAI_API_KEY,
  }),
  tools: [weatherTool],
});

const result = await fox.run('What is the weather in Sandton right now?');
console.log(result.output);
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