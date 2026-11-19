<div align="center">
  <img src="./assets/contributing-wirefox-banner.png" alt="Thank you for contributing to wirefox! (banner)" width="100%" />
  # Contributing to wirefox
</div>

Thank you for your interest in contributing to **wirefox**! Whether you are fixing a bug, adding a new model provider adapter, or improving tests, your help is appreciated.

## Core Principles

Before writing code, please keep these three rules in mind:

1. **Zero runtime dependencies:** `wirefox` relies exclusively on standard Web and TypeScript primitives. Do not add third-party packages to `dependencies` in `package.json`.
2. **Minimal, readable code:** Keep abstractions small and focused.
3. **Clean documentation style:** We avoid noisy line-by-line comments. Instead, **targeted JSDoc comments are provided in areas of the codebase that may be difficult to understand** (such as complex type inference utilities in `src/types.ts` and extension interfaces like `ModelAdapter`). Please follow this same convention when adding new features.

## Local Development Setup

1. Fork the repository and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/wirefox.git
   cd wirefox
   ```

2. Install development dependencies:
   ```bash
   npm install
   ```

3. Run the verification suite:
   ```bash
   npm run typecheck
   npm test
   npm run build
   ```

## Project Structure

```text
src/
├── adapters/      # Provider adapters (e.g., openai.ts)
├── agent.ts       
├── index.ts       
├── tool.ts        
└── types.ts       
tests/             
```

## Good First Contributions

* **New Provider Adapters:** Add zero-dependency `fetch`-based adapters in `src/adapters/` (such as Anthropic or Google Gemini) implementing the `ModelAdapter` interface.
* **Edge-Case Tests:** Add test coverage in `tests/` for multi-tool calls, malformed model arguments, or custom `systemPrompt` handling.

## Pull Request Checklist

* [ ] Code follows the existing TypeScript strict mode rules (`npm run typecheck` passes).
* [ ] New functionality includes unit tests in `tests/` (`npm test` passes).
* [ ] Public exports are updated in `src/index.ts` if applicable.
* [ ] Complex types or non-obvious logic include a concise JSDoc comment.
