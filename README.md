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

## Sincronização na nuvem (Cloudflare Workers + D1)

O app é publicado como um Worker com assets estáticos (`wrangler.jsonc`): a pasta `dist`
é servida diretamente e `/api/state` passa pelo Worker (`worker/index.ts`), que guarda
os dados num banco D1. O `localStorage` continua como cache/offline. A tabela é criada
automaticamente.

Configuração:

1. Crie o banco D1 (ex.: `gymduda`) e coloque o ID dele em `database_id` no `wrangler.jsonc`.
2. Confira se `name` no `wrangler.jsonc` é igual ao nome do Worker no painel.
3. No Worker: **Settings → Build** → Build command `npm run build`, Deploy command `npx wrangler deploy`.
4. No Worker: **Settings → Variables and Secrets → Add**, tipo *Secret*, nome `SYNC_KEY`
   (ou `npx wrangler secret put SYNC_KEY`).
5. No app, abra **Treinos → Sincronização** e cole a chave.

Teste local: crie `.dev.vars` com `SYNC_KEY=teste` e rode `npm run build && npx wrangler dev`.
