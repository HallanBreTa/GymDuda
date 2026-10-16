# Sequência, moedas e congelamentos (gamificação)

Data: 2026-10-16 · Status: aguardando revisão

## Objetivo

Motivar a regularidade no estilo Duolingo. O usuário mantém uma **sequência** de dias propostos cumpridos e ganha
**moedas**, que podem ser trocadas por **congelamentos**. Um congelamento é um "day off": numa falta, ele
mantém a sequência e é gasto. Sem congelamento, a sequência zera. É de uso pessoal: sem ranking e sem
compartilhamento.

### Decisões do usuário
- **Dia proposto:** é um dia de treino marcado na aba Semana (`trainingDays`).
- **Dia cumprido:** treino concluído **ou** atividade avulsa registrada "no lugar do treino" (`mode: 'replace'`).
- **Moedas:** 10 por dia cumprido. Bônus quando a sequência chega a 7, 30 e 100 dias (+20, +50, +100). Treino ou atividade
  extra num dia de descanso dá 5 moedas, uma vez por dia, sem afetar a sequência.
- **Congelamento:** custa 50 moedas, o estoque máximo é 2 e o uso é automático na falta. A compra é sempre manual.
- **Histórico:** a sequência e as moedas são recalculadas desde o início do app. No passado não houve compras
  automáticas: faltas antigas sem congelamento comprado quebram a sequência.
- **Abordagem:** tudo é derivado do histórico. Só as compras de congelamento são salvas.

## Regras de cada dia

O cálculo percorre os dias em ordem, do primeiro dia com dados até hoje. Cada dia é classificado assim:

| Resultado | Quando | Sequência | Moedas |
|---|---|---|---|
| `kept` | Dia de treino com treino concluído (`done`) ou substituído (`replaced`) | +1 | +10 (+ bônus de marco) |
| `missed` | Dia de treino **passado** sem registro, com "Descansou" ou com sessão iniciada e não concluída | Mantida se houver congelamento (gasta 1, resultado `frozen`). Zera se não houver (resultado `broken`) | 0 |
| `pending` | Dia de treino **hoje**, ainda não cumprido | Nada muda | 0 |
| `rest_active` | Dia de descanso com treino concluído ou qualquer atividade | Nada muda | +5 |
| `rest` | Dia de descanso sem nada | Nada muda | 0 |

O cálculo começa no primeiro dia com dados (o menor entre `startDate` e os registros); trocar o plano, que move `startDate` para frente, não apaga faltas antigas.

Regras complementares:
- **Marcos:** o bônus é pago sempre que a sequência **atinge** o valor (7, 30 ou 100), inclusive depois de uma quebra.
- **Compra e validade:** uma compra feita na data P entra no estoque no início do dia P e cobre faltas em datas ≥ P.
  A falta de ontem já estava fechada quando a compra foi feita hoje, então não é coberta.
- **Estoque:** no máximo 2. Se um recálculo deixaria o estoque acima de 2, o excedente é descartado.
- **Saldo:** `earned − 50 × compras`, nunca abaixo de 0. Se uma correção no histórico reduzir `earned` depois de compras
  já feitas, o saldo exibido fica em 0 e novas compras ficam bloqueadas até ele voltar a ser positivo.
- **Recorde:** guardamos também a maior sequência já atingida (`best`).
- **Coerência com o resto do app:** a classificação usa `projectDays` (`src/domain/queue.ts`), então uma falta aqui é a
  mesma falta da aba Semana.
- **Limitação:** os dias passados usam a configuração **atual** de `trainingDays`, como as faltas já funcionam hoje.
  Mudar os dias de treino pode reclassificar dias antigos.
- **Correções retroativas:** registrar um treino esquecido, reabrir ou concluir uma sessão recalcula tudo. Se uma falta
  vira dia cumprido, o congelamento gasto nela volta ao estoque.

## Dados

Um campo opcional novo em `GymState` (`src/types.ts`). O estado continua em `version: 3`, sem migração:

```ts
export type FreezePurchase = { id: string; date: string /* yyyy-mm-dd */; at: number }
// GymState
freezePurchases?: FreezePurchase[]
```

- `sanitize` (`src/hooks/useGymStore.ts`) descarta compras com data inválida ou formato errado.
- O campo vai junto no JSON sincronizado com a nuvem. Num conflito vence a versão da nuvem, como hoje: uma compra
  feita no outro aparelho pode se perder, mas as moedas continuam e basta comprar de novo.

## Cálculo: `src/domain/streak.ts` (funções puras)

```ts
export const COINS_PER_DAY = 10
export const COINS_REST_EXTRA = 5
export const FREEZE_PRICE = 50
export const MAX_FREEZES = 2
export const MILESTONES: Record<number, number> = { 7: 20, 30: 50, 100: 100 }

export type DayOutcome = 'kept' | 'frozen' | 'broken' | 'pending' | 'rest_active' | 'rest'

export type StreakResult = {
  current: number
  best: number
  earned: number
  balance: number          // max(0, earned − FREEZE_PRICE × compras)
  freezes: number          // estoque atual (0..MAX_FREEZES)
  days: Record<string, { outcome: DayOutcome; coins: number; streak: number; milestone?: number }>
  today: 'kept' | 'pending' | 'rest' | 'rest_active'
  nextMilestone: { at: number; bonus: number; remaining: number } | null
  lastBreak: { date: string; length: number } | null   // falta que zerou uma sequência > 0, se ainda não houve dia cumprido depois
}

export function computeStreak(state: GymState, today: string): StreakResult
export function canBuyFreeze(r: StreakResult): { ok: true } | { ok: false; reason: 'coins' | 'full'; missing?: number }
```

- **Início:** a menor data entre `startDate`, as chaves de `history` e as de `activities`, sem passar de hoje.
- **Um passo por data:** primeiro somam-se ao estoque as compras com `date` até a data atual, respeitando o limite.
  Depois o dia é classificado e aplicado.
- **Custo:** O(dias). A tela guarda o resultado com `useMemo([state, today])`.

## Store: `useGymStore`

- `buyFreeze(today)`: recalcula com `computeStreak` dentro do `setState` e só grava a compra
  `{ id: uid(), date: today, at: Date.now() }` se `canBuyFreeze` permitir. Por isso, dois toques rápidos não compram
  duas vezes sem saldo.

## Tela

1. **`StreakCard` no topo da aba Início** (`src/components/StreakCard.tsx`):
   - Mostra 🔥 com a sequência atual e "melhor: N".
   - Mostra o status de hoje: "treine para manter a sequência", "✓ garantido hoje" ou "hoje é descanso".
   - Barra de progresso até o próximo marco, com o bônus.
   - Mostra 🪙 com o saldo, ❄ com o estoque (x/2) e o botão **Loja**.
   - Sem nenhum dia cumprido, mostra "Treine num dia proposto para começar sua sequência".
   - Com `lastBreak`, mostra "Sua sequência de N dias acabou em <data>".
2. **Loja** (`BottomSheet`):
   - Item "Congelamento" com o preço, o estoque e o botão **Comprar**. Quando desabilitado, o botão diz o motivo:
     "faltam X moedas" ou "estoque cheio".
   - Texto curto com as regras.
   - Lista das últimas compras e dos dias em que congelamentos foram usados.
3. **Calendário "Esta semana" da Início:** dia `frozen` aparece com ❄ (azul), e dia `broken` continua com ✕.
4. **Selo 🔥 N** ao lado da engrenagem (topo no celular e `TopBar` no desktop). Tocar nele leva à Início.
5. **Comemorações** (`src/hooks/useStreakEvents.ts`):
   - Compara o resultado anterior com o novo só depois de ações do usuário: concluir treino, salvar atividade e
     registros retroativos.
   - Mostra um Toast:
     - "🔥 N dias seguidos · +10 moedas";
     - "🏅 N dias seguidos! +X moedas de bônus";
     - "+5 moedas · treino extra".
   - Vibra junto quando a vibração está ligada (`src/feedback.ts`).
   - Não dispara na abertura do app nem quando dados chegam da nuvem.

## Fora do escopo

- O export para IA não inclui sequência nem moedas.
- Não haverá ranking, conquistas além dos marcos, outros itens na loja nem histórico de mudanças de `trainingDays`.

## Testes

1. **Suíte de domínio `streak-test.mjs`** (Vite SSR, como as outras):
   - Sequência que cresce.
   - Falta sem congelamento, que zera.
   - Falta com congelamento, que mantém e gasta.
   - Compra de hoje, que não cobre ontem.
   - Estoque máximo de 2.
   - "Descansou" num dia de treino, que conta como falta.
   - Sessão antiga não concluída, que conta como falta.
   - Extra no descanso valendo +5, uma vez por dia.
   - Substituição contando como dia cumprido.
   - Marcos repetidos depois de uma quebra.
   - Hoje pendente, sem quebrar.
   - Registro retroativo, que devolve o congelamento.
   - Saldo nunca negativo.
   - `canBuyFreeze` (falta de moedas ou estoque cheio).
   - `sanitize` das compras.
2. **Suítes existentes:** todas continuam passando.
3. **Visual** (Edge headless, 390 px, temas escuro e claro):
   - Card sem sequência.
   - Card com sequência e marco próximo.
   - Loja com o botão habilitado e desabilitado.
   - Calendário com ❄.
   - Selo no topo.
   - Toast ao concluir um treino.
4. **Checagens:** `npx tsc -b`, `npx oxlint` e `npm run build`.
