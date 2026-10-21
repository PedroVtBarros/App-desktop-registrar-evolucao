# Onde alterar o quê

Guia rápido de localização por tipo de mudança. Arquitetura em camadas (ver `PROGRESSO.md`):

```
core (regras puras) → data (repositórios/SQLite) → main (IPC) → preload → renderer (React)
```

Regra geral: a interface (`renderer`) nunca acessa o SQLite direto; sempre passa por `preload` → IPC → `main` → `data`.

## 1. Mudar regra de negócio / cálculo (sem tocar banco)
`src/core/*.ts` — funções puras, sem I/O.
- `core/validacao.ts` — validação de entradas (nome, unidade, datas, nota etc.).
- `core/metricas.ts` — consistência, cumprimento, sequências, classificação de dia (`classificarDia`, `acumularDia`).
- `core/programacao.ts` — cálculo da meta vigente em uma data (`metaDoDia`).
- `core/avaliacao.ts` — regras de autoavaliação (nota 0–10, variação).
- `core/evolucao.ts` — agregações para calendário/gráficos.
- `core/datas.ts` — utilitários de data (ISO, hoje).
- `core/erros.ts` — erros de domínio.
Depois de mudar aqui, rode os testes (`*.test.ts` no mesmo diretório).

## 2. Mudar como os dados são lidos/gravados no SQLite
`src/data/*.ts` — repositórios (SQL parametrizado).
- `data/itens.ts` — hábitos/habilidades (CRUD, arquivar).
- `data/entradas.ts` + `data/diario.ts` — programação semanal e registros diários.
- `data/avaliacoes.ts` — autoavaliações de habilidades.
- `data/estatisticas.ts` — consultas para a aba Estatísticas (usa `core/metricas.ts`).
- `data/evolucao.ts` — consultas para calendário/gráficos.
- `data/backup.ts`, `data/restauracao.ts`, `data/importacao.ts` — backup, restaurar, importar app antigo.
- `data/banco.ts` — conexão SQLite (WAL, `foreign_keys=ON`).
- `data/migracoes.ts` — **toda alteração de schema entra aqui como nova migração numerada**, nunca editando migrações antigas.

## 3. Mudar/adicionar schema do banco
`src/data/migracoes.ts` — adicionar nova migração numerada (nunca editar as existentes). Atualizar também o repositório correspondente em `data/`.

## 4. Mudar o que o renderer pode chamar (API IPC)
Três pontas que precisam ficar em sincronia:
1. `src/shared/*.ts` — tipos compartilhados (contratos de dados), incluindo `shared/ipc.ts` (nomes/assinaturas dos canais).
2. `src/main/ipc-*.ts` — implementação do canal no processo principal (um arquivo por área: `ipc-itens.ts`, `ipc-dia.ts`, `ipc-estatisticas.ts`, `ipc-evolucao.ts`, `ipc-avaliacoes.ts`, `ipc-dados.ts`). Chama os repositórios de `data/`.
3. `src/preload/index.ts` — expõe o canal como função no `window` (contextBridge), é a única ponte entre renderer e main.
Todas as respostas seguem `Resultado<T>` (`{ ok, dados }` ou `{ ok: false, erro }`) — ver `main/resultado.ts`.

## 5. Mudar a interface (telas, componentes, estilo)
`src/renderer/src/`
- `App.tsx` — abas/navegação principal.
- `components/*.tsx` — um componente por tela/bloco (ex.: `TelaDia.tsx`, `TelaEstatisticas.tsx`, `TelaEvolucao.tsx`, `TelaAutoavaliacao.tsx`, `TelaDados.tsx`, `ItemForm.tsx`, `EditorSemana.tsx`, `CalendarioMes.tsx`, gráficos `GraficoNotas.tsx`/`GraficoQuantidade.tsx`).
- `estados.ts` — hooks/estado compartilhado do renderer.
- `index.css` — estilos Tailwind.
- Renderer só chama `window.api.*` (exposto pelo preload); nunca importa `data/` ou `better-sqlite3`.

## 6. Mudar inicialização da janela/app Electron
`src/main/index.ts` — criação da janela, ciclo de vida do app, registro dos handlers IPC (`ipc-*.ts`).

## 7. Mudar empacotamento/instalador
- `electron.vite.config.ts` — build (externaliza módulos nativos como `better-sqlite3`).
- `package.json` — scripts (`npm run dist`, `npm run pack`), config do electron-builder.
- `scripts/electron-vite.mjs` — ajustes do ambiente de dev.

## 8. Documentação
- `docs/GUIA.md` — guia do usuário final (instalação, backup, importação).
- `docs/PROGRESSO.md` — histórico de etapas, decisões arquiteturais, pendências (atualizar só ao concluir etapa relevante, conforme `CLAUDE.md`).
- `docs/ONDE_ALTERAR.md` — este arquivo.

## Checklist ao terminar uma mudança
1. Tipos em `shared/` batem com `main/ipc-*.ts` e `preload/index.ts`?
2. Validação em `core/validacao.ts` cobre a nova entrada?
3. Schema novo → migração numerada em `data/migracoes.ts`?
4. Testes relevantes (`*.test.ts`) passam?
5. `docs/PROGRESSO.md` atualizado, se a etapa foi concluída?
