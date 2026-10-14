# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

## Sincronização na nuvem (Cloudflare D1)

Os dados ficam no `localStorage` (cache/offline) e são sincronizados com um banco D1
pela Pages Function `functions/api/state.ts`. A tabela é criada automaticamente.

Configuração no painel do Cloudflare:

1. **Storage & Databases → D1 → Create** (ex.: `gymduda`).
2. No projeto Pages: **Settings → Bindings → Add → D1 database**, nome da variável `DB`.
3. **Settings → Variables and Secrets → Add**, tipo *Secret*, nome `SYNC_KEY`, com uma chave longa e aleatória.
4. Faça um novo deploy e, no app, abra **Treinos → Sincronização** e cole a chave.

Teste local: `npm run build && npx wrangler pages dev dist --d1 DB=gymduda --binding SYNC_KEY=teste`
