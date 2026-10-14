# GymDuda

App web para planejar e registrar treinos de musculação. Funciona no celular como um app (dá para adicionar à tela de início), funciona offline e sincroniza os dados entre aparelhos.

**No ar:** https://gym.hallanbreta.uk

## Funcionalidades

- **Fila de treinos (divisão rotativa).** Em vez de "segunda = Treino A", você define a ordem (A → B → C → D) e os dias em que pretende treinar. Se faltar, o treino pendente passa para o próximo dia de treino e nada se perde. Se treinar num dia de descanso, a fila anda.
- **Registro série a série.** Carga, repetições e RIR (repetições na reserva) de cada série, com a carga da última vez como referência.
- **Atividades avulsas.** Cardio, corrida, esportes e mobilidade, como extra ou no lugar do treino do dia.
- **Divisões prontas.** ABC, ABCD, ABCDE e Full Body, todas editáveis.
- **Aba Dados.** Gráficos de frequência, faltas por dia da semana, treinos e volume por semana, evolução de carga por exercício (com 1RM estimado) e rankings.
- **Exportar log para IA.** Gera um relatório em Markdown com planejamento, resumo, progressão e histórico detalhado, para colar no ChatGPT, Claude etc. e pedir uma avaliação.
- **Importar treinos de IA.** Cole um JSON gerado pela IA para montar a divisão em segundos (veja o [formato](#formato-de-importação)).
- **Sincronização na nuvem**, protegida por senha.
- **Tema escuro, claro ou automático.**

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Interface | React 19 + TypeScript, Vite, Tailwind CSS 4, ícones Lucide |
| Gráficos | SVG/HTML próprios (sem biblioteca) |
| Hospedagem | Cloudflare Workers (assets estáticos) |
| Banco de dados | Cloudflare D1 (SQLite) |
| Lint | Oxlint |

Tudo cabe no plano gratuito da Cloudflare.

## Como funciona

```
Navegador ──► Cloudflare Worker ──┬─► arquivos do app (pasta dist)
   │                              └─► /api/state ──► D1 (banco)
   └─ localStorage (cache e uso offline)
```

- O estado inteiro do app (treinos, fila, histórico, atividades) é um único objeto JSON.
- Ele fica salvo no `localStorage` do navegador, então o app abre instantaneamente e funciona sem internet.
- Com a sincronização ativada, cada alteração é enviada para `/api/state` cerca de 1 segundo depois. O app busca a versão mais nova ao abrir, ao voltar para ele e quando a conexão volta.
- **Conflitos:** cada gravação carrega a versão que o aparelho conhecia. Se outro aparelho salvou antes, o servidor recusa (HTTP 409), a versão da nuvem prevalece e o app avisa.
- **Segurança:** a API só responde com a senha de sincronização (`SYNC_KEY`, guardada como secret na Cloudflare). A comparação é feita em tempo constante.

### Estrutura

```
worker/index.ts          API de sincronização (Worker + D1) e entrega dos arquivos do app
wrangler.jsonc           Configuração do Worker, do domínio e do banco
src/
  App.tsx                Abas e telas abertas por cima (editor, formulários)
  views/                 Abas: Hoje, Treinos, Semana, Dados, Ajustes
  components/            Componentes de interface (gráficos, painéis, formulários)
  domain/                Regras sem React: fila, séries, estatísticas, exportação, importação
  hooks/useGymStore.ts   Estado do app, ações e migração de versões dos dados
  hooks/useCloudSync.ts  Sincronização com a nuvem
  data/templates.ts      Divisões prontas
  theme.ts               Tema claro/escuro
  index.css              Cores (tokens) dos dois temas
```

**Versões dos dados.** O estado tem um campo `version`. Ao mudar o formato, crie uma função de migração em `useGymStore.ts` (veja `migrateV1` e `migrateV2`). Dados antigos, locais ou da nuvem, são convertidos automaticamente ao carregar.

## Rodando localmente

Requisitos: Node.js 20.19+ ou 22.12+.

```bash
npm install
npm run dev        # só a interface, em http://localhost:5173 (sem sincronização)
```

Para testar também a API e o banco (D1 simulado localmente):

```bash
echo SYNC_KEY=teste > .dev.vars
npm run build
npx wrangler dev   # http://localhost:8787 — use a senha "teste" em Ajustes → Sincronização
```

Outros comandos:

| Comando | O que faz |
|---|---|
| `npm run build` | Checa tipos e gera a pasta `dist` |
| `npm run lint` | Roda o Oxlint |
| `npm run preview` | Serve a pasta `dist` |

## Deploy (Cloudflare)

O deploy é automático: cada push na branch `master` faz o build e publica.

Para configurar do zero numa conta nova:

1. Crie um banco D1 (ex.: `gymduda`) e coloque o ID dele em `database_id` no `wrangler.jsonc`. A tabela é criada sozinha no primeiro acesso.
2. Crie um Worker ligado a este repositório, com o mesmo `name` do `wrangler.jsonc`.
3. No Worker, vá em **Settings → Build** e configure o build command `npm run build` e o deploy command `npx wrangler deploy`.
4. Crie a senha de sincronização como secret, com `npx wrangler secret put SYNC_KEY` ou em **Settings → Variables and Secrets**.
5. Para usar outro domínio, troque o `pattern` em `routes` no `wrangler.jsonc`. O domínio precisa estar na mesma conta da Cloudflare.
6. No app, abra **Ajustes → Sincronização** e cole a senha em cada aparelho. Faça isso primeiro no aparelho que já tem os dados.

Para trocar a senha: rode `npx wrangler secret put SYNC_KEY` e conecte de novo nos aparelhos.

> **Nunca commite** a senha, tokens da Cloudflare ou o arquivo `.dev.vars`. O ID do banco e os nomes no `wrangler.jsonc` não são segredos.

## Formato de importação

Em **Ajustes → Importar treinos** há um botão que copia um pedido pronto para a IA, com este formato:

```json
{
  "formato": "gymduda-treinos",
  "diasDeTreino": ["seg", "ter", "qui", "sex"],
  "treinos": [
    {
      "nome": "Treino A - Superiores",
      "foco": "Peito • Costas • Ombros",
      "cor": "verde",
      "exercicios": [
        { "nome": "Supino reto com barra", "series": 4, "repeticoes": "6-8", "carga": "60kg", "obs": "Descer controlado" }
      ]
    }
  ]
}
```

- A ordem de `treinos` vira a ordem da fila.
- Campos opcionais: `diasDeTreino`, `foco`, `cor` (verde, azul, laranja, rosa, roxo, turquesa), `carga` e `obs`.
- A leitura tolera texto ou crases em volta do JSON e dias por extenso ("Segunda").
- Também é possível copiar os treinos atuais nesse formato, para usar como base.
