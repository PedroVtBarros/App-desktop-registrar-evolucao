# Progresso â€” EvoluÃ§Ã£o Pessoal

## Funcionalidades concluÃ­das
- **Etapa 0:** esqueleto Electron + React + TypeScript + Tailwind, IPC seguro.
- **Etapa 1:** persistÃªncia e cadastro.
  - SQLite (`better-sqlite3`) em `app.getPath('userData')/evolucao.db`, WAL, `foreign_keys=ON`.
  - MigraÃ§Ãµes numeradas (`src/data/migracoes.ts`, tabela `schema_migrations`); recusa banco de versÃ£o mais nova.
  - Cadastro de hÃ¡bitos e habilidades: nome, categoria (opcional), unidade, meta diÃ¡ria.
  - Editar nome/categoria/unidade; arquivar/desarquivar; excluir definitivamente **somente se arquivado**.
  - Alterar meta com data de inÃ­cio (hoje ou futuro); dias anteriores mantÃªm a meta original.
  - ValidaÃ§Ã£o de toda entrada do renderer no main (`src/core/validacao.ts`); SQL parametrizado.
  - Testes: 32 testes unitÃ¡rios (Vitest) + verificaÃ§Ã£o ponta a ponta com reinÃ­cio do app.
- **Etapa 2:** metas por dia da semana.
  - ProgramaÃ§Ã£o semanal por item: meta individual de segunda a domingo, **dia de descanso** (sem meta) ou mesma meta todos os dias.
  - "Alterar programaÃ§Ã£o" a partir de uma data (hoje ou futuro); programaÃ§Ãµes anteriores ficam intactas.
  - MigraÃ§Ã£o 002 preserva os dados da etapa 1; editor semanal na criaÃ§Ã£o e na lista; resumo legÃ­vel ("Seg 5 km Â· â€¦ Â· SÃ¡b descanso").
  - Testes: 43 unitÃ¡rios (inclui migraÃ§Ã£o de banco da etapa 1 e preservaÃ§Ã£o de histÃ³rico) + ponta a ponta com reinÃ­cio.
- **Etapa 3:** tela "Hoje" e registro diÃ¡rio.
  - Aba "Hoje": atividades ativas com nome, tipo, unidade, meta vigente e situaÃ§Ã£o (Pendente / ConcluÃ­da / Parcialmente realizada / NÃ£o realizada / Descanso).
  - Registro: situaÃ§Ã£o escolhida pelo usuÃ¡rio (nunca deduzida da quantidade), quantidade realizada opcional (maior ou menor que a meta; 0 permitido) e observaÃ§Ã£o opcional (atÃ© 500 caracteres).
  - Um registro por item e dia (upsert); editar nÃ£o duplica; "Voltar para pendente" remove o registro de hoje.
  - Dia sem registro = pendente (nada Ã© gravado como falha). Descanso planejado aparece como "Descanso", distinto de "NÃ£o realizada"; Ã© possÃ­vel "Registrar mesmo assim".
  - `meta_no_dia` guarda a meta vigente na criaÃ§Ã£o do registro e nÃ£o muda em ediÃ§Ãµes nem quando a programaÃ§Ã£o Ã© alterada.
  - ProteÃ§Ã£o do histÃ³rico: item com registros nÃ£o pode ser excluÃ­do (FK `ON DELETE RESTRICT` + verificaÃ§Ã£o) nem trocar de unidade (trigger + verificaÃ§Ã£o); a interface esconde "Excluir" e bloqueia o campo unidade, com explicaÃ§Ã£o.
  - MigraÃ§Ã£o 003 (`registro`, Ã­ndice por data, trigger de unidade). Testes: 67 unitÃ¡rios + ponta a ponta pela interface, com banco no formato da etapa 1 e reinÃ­cio.
- **Etapa 4:** histÃ³rico, correÃ§Ã£o de dias anteriores e descanso por data.
  - A aba "Hoje" virou navegaÃ§Ã£o por datas (â—€ â–¶, seletor de data, "Voltar para hoje"); mesmo cartÃ£o para hoje e dias passados.
  - Cada data mostra a meta que valia nela (`metaDoDia` + programaÃ§Ã£o histÃ³rica) e o `meta_no_dia` de cada registro original.
  - Criar, editar e remover registros de datas passadas; no mÃ¡ximo um por atividade e data; status, quantidade e observaÃ§Ã£o preservados.
  - SituaÃ§Ãµes distintas: **Registrado** (com o status escolhido, inclusive "NÃ£o realizada"), **Sem registro** (dia passado sem registro), **Pendente** (hoje), **Descanso** (programado ou excepcional), **Futuro** (nunca Ã© falha).
  - Descanso excepcional por data e atividade (tabela `descanso_data`, migraÃ§Ã£o 004), com motivo opcional; nÃ£o altera a programaÃ§Ã£o semanal; permite registrar mesmo assim; pode ser removido.
  - Registro em data futura Ã© recusado; descanso pode ser agendado atÃ© 366 dias Ã  frente.
  - Atividades arquivadas aparecem como "somente consulta" nas datas em que estavam ativas ou tÃªm registro; nunca sÃ£o reativadas nem editadas.
  - Testes: 76 unitÃ¡rios + ponta a ponta pela interface (banco no formato da etapa 1, migraÃ§Ã£o 002â€“004, reinÃ­cio).
- **Etapa 5:** estatÃ­sticas de consistÃªncia, sequÃªncias e evoluÃ§Ã£o (aba "EstatÃ­sticas").
  - Filtros: Ãºltimos 7, 30, 90 dias e perÃ­odo completo. Indicadores gerais e por atividade, mais "Como Ã© calculado" na tela.
  - Por atividade: consistÃªncia, cumprimento, contagens (previstos, concluÃ­dos, parciais, nÃ£o realizados, sem registro, descanso), prÃ¡tica em descanso (informativo), quantidade total na unidade da atividade, sequÃªncia atual e maior sequÃªncia.
  - Tudo Ã© derivado na leitura (`core/metricas.ts` puro + `data/estatisticas.ts`); nada Ã© gravado e nenhum registro Ã© criado automaticamente. Sem migraÃ§Ã£o nova.
  - Testes: 102 unitÃ¡rios (cobrem todos os casos obrigatÃ³rios) + ponta a ponta pelo app com banco da etapa 1 e reinÃ­cio.
- **Etapa 6:** calendÃ¡rio visual e grÃ¡ficos (aba "EvoluÃ§Ã£o").
  - CalendÃ¡rio mensal por atividade (estilo mapa de calor), com navegaÃ§Ã£o de mÃªs/ano, "MÃªs atual" e legenda. Cores distintas: concluÃ­da, parcial, nÃ£o realizada, sem registro, descanso (com marca para "praticou no descanso"), futuro, antes da criaÃ§Ã£o e arquivada; hoje com destaque.
  - Clique em data vÃ¡lida abre a aba "Hoje" naquela data; datas futuras e anteriores Ã  criaÃ§Ã£o sÃ£o desabilitadas.
  - GrÃ¡fico (SVG prÃ³prio, sem biblioteca) de quantidade realizada Ã— meta vigente em cada data. Barras de cor Ãºnica (a quantidade nÃ£o vira sucesso/fracasso); zero informado (â—) â‰  registro sem quantidade (Ã—) â‰  sem registro (nada); descanso em faixa; meta em degraus, interrompida nos descansos.
  - Comparativos de consistÃªncia/cumprimento por semana (segunda a domingo) e por mÃªs; opÃ§Ã£o "Todas as atividades" (sÃ³ consistÃªncia, sem somar unidades).
  - Filtros: atividade (inclui arquivadas) e perÃ­odo (7/30/90 dias, completo).
  - Reuso: `classificarDia`, `janelaDoPeriodo` e `acumularDia` em `core/metricas.ts` sÃ£o a definiÃ§Ã£o Ãºnica usada pelas estatÃ­sticas e pelas visualizaÃ§Ãµes; os nÃºmeros coincidem (testado). Uma Ãºnica chamada IPC (`evolucao:obter`) carrega tudo com poucas consultas (nenhuma por dia). Sem migraÃ§Ã£o nova.
  - Testes: 123 unitÃ¡rios + ponta a ponta pela interface (calendÃ¡rio, navegaÃ§Ã£o de mÃªs, clique â†’ Hoje, "Todas", consistÃªncia com a etapa 5, reinÃ­cio).
- **Etapa 8:** backup, restauraÃ§Ã£o, importaÃ§Ã£o conservadora do app antigo e instalador Windows (aba "Dados e backup"). Guia do usuÃ¡rio em `docs/GUIA.md`. Detalhes em "Regras de dados e distribuiÃ§Ã£o (etapa 8)".
- **Etapa 7:** autoavaliaÃ§Ã£o e evoluÃ§Ã£o das habilidades (aba "AutoavaliaÃ§Ã£o").
  - Nota **inteira de 0 a 10**, escolhida manualmente (botÃµes 0â€“10), com observaÃ§Ã£o opcional, sÃ³ para itens do tipo habilidade; hÃ¡bitos sÃ£o recusados.
  - Uma avaliaÃ§Ã£o por habilidade e data (salvar na mesma data substitui); editar e remover (com confirmaÃ§Ã£o). NÃ£o aceita datas futuras nem anteriores Ã  criaÃ§Ã£o.
  - Lista de habilidades com nota atual e variaÃ§Ã£o (â–² sobe / â–¼ desce / = igual / primeira avaliaÃ§Ã£o); detalhe com histÃ³rico cronolÃ³gico, variaÃ§Ã£o por linha e grÃ¡fico de notas (SVG, eixo fixo 0â€“10, pontos = avaliaÃ§Ãµes reais, sem valores inventados).
  - Habilidades arquivadas: consulta do histÃ³rico, sem reativar nem editar.
  - MigraÃ§Ã£o 005 (`avaliacao`, `ON DELETE RESTRICT`); habilidade com avaliaÃ§Ãµes nÃ£o pode ser excluÃ­da (campo `temAvaliacoes`).
  - IndependÃªncia garantida por testes: registrar prÃ¡tica nÃ£o altera notas; alterar notas nÃ£o altera registros, metas, descansos, estatÃ­sticas nem visualizaÃ§Ãµes.
  - Testes: 148 unitÃ¡rios + ponta a ponta pela interface (criar, editar, remover com confirmaÃ§Ã£o, validaÃ§Ãµes, arquivada, reinÃ­cio).
- **Mini-etapa de seguranÃ§a:** Electron 37.10.3 â†’ **44.7.2** e Vitest 3.2.7 â†’ **5.0.4**. `npm audit`: 0 vulnerabilidades. Nenhuma mudanÃ§a de cÃ³digo, de modelo de dados ou de funcionalidade; Etapa 1 revalidada (typecheck, 32 testes, build, ponta a ponta com reinÃ­cio).

## PendÃªncias
- Planejamento original concluÃ­do (etapas 0â€“8). SugestÃµes futuras, fora do escopo atual: Ã­cone prÃ³prio,
  assinatura de cÃ³digo, atualizaÃ§Ã£o automÃ¡tica, limpeza opcional de `backups-automaticos`, rastrear
  perÃ­odos de arquivamento, "folga geral", data de inÃ­cio editÃ¡vel.

## DecisÃµes arquiteturais
- Projeto novo em `evolucao-pessoal/`; app Python (`evolucao_1pct_v2/`) fica como legado, intocado.
- Dados antigos serÃ£o **importados** do `evolucao.db` do app Python (etapa 8).
- Meta diÃ¡ria = exatamente o que o usuÃ¡rio definiu; nunca aumenta automaticamente.
- Metas formam uma linha do tempo de **programaÃ§Ãµes semanais** em `programacao_semanal (item_id, vigente_de, dia_semana 1=segâ€¦7=dom, valor_alvo)`: uma vigÃªncia = 7 linhas. A programaÃ§Ã£o de um dia Ã© a de maior `vigente_de <= dia`; a meta Ã© a posiÃ§Ã£o do dia da semana. ProgramaÃ§Ãµes passadas nunca sÃ£o alteradas (sÃ³ se agenda de hoje em diante; mesma data substitui as 7 linhas).
- `valor_alvo NULL` = **dia de descanso planejado** (sem meta). Ã‰ conceito distinto do status "nÃ£o realizado" de um registro (etapa 3). Exige ao menos um dia com meta.
- `core/programacao.ts#metaDoDia` devolve nÃºmero (meta), `null` (descanso) ou `undefined` (sem programaÃ§Ã£o vigente, ex.: data anterior ao cadastro). NÃ£o calcula nem ajusta valores.
- MigraÃ§Ã£o 002 converte `meta_diaria` (etapa 1) em `programacao_semanal` copiando a mesma meta nos 7 dias e a mesma vigÃªncia, e remove a tabela antiga na mesma transaÃ§Ã£o. Testada com banco real no formato da etapa 1.
- Descanso por data especÃ­fica (ex.: "folga dia 20") **nÃ£o** existe ainda: Ã© etapa 4 (`rest_day`).
- Tipo do item (`habito`/`habilidade`) Ã© imutÃ¡vel apÃ³s criado.
- Nome Ãºnico (sem diferenciar maiÃºsculas ASCII) apenas entre itens **ativos**; arquivar libera o nome.
- ExclusÃ£o definitiva sÃ³ de arquivados **e sem registros** (`registro.item_id` Ã© `ON DELETE RESTRICT`; `programacao_semanal` usa CASCADE). Item com histÃ³rico sÃ³ pode ser arquivado.
- A unidade sÃ³ pode ser editada enquanto o item nÃ£o tem registros (trigger `trg_item_unidade_com_registro`). Para trocar a unidade de um item com histÃ³rico: arquivar e criar outro. Nome, categoria e programaÃ§Ã£o continuam editÃ¡veis.
- Status do registro: `concluido` | `parcial` | `nao_realizado`. "Pendente" nÃ£o Ã© status, Ã© a ausÃªncia de linha em `registro`.
- `DiarioRepositorio` opera sobre qualquer data (`obterDia/registrar/limpar/definirDescanso/removerDescanso`); "hoje" vem sempre do processo principal. ValidaÃ§Ã£o no main: data real, `data <= hoje` para registro, `data >= criado_em` da atividade.
- Atividade sÃ³ existe a partir de `criado_em`: nÃ£o Ã© possÃ­vel registrar antes disso (limitaÃ§Ã£o conhecida; ver pendÃªncias).
- Quais atividades aparecem numa data: existia (`criado_em <= data`) e estava ativa (`arquivado_em` nulo ou posterior Ã  data), ou possui registro nela. O perÃ­odo de arquivamento nÃ£o Ã© rastreado: atividade arquivada e desarquivada conta como ativa desde a criaÃ§Ã£o.
- Atividade arquivada Ã© somente consulta: nÃ£o se registra, edita nem remove nada dela sem desarquivar.
- Descanso excepcional (`descanso_data`) e registro coexistem na mesma data; o registro mantÃ©m `meta_no_dia` original e a interface mostra a diferenÃ§a.
- Descanso excepcional Ã© por atividade (nÃ£o existe "folga geral" que atinja todas de uma vez).
- SituaÃ§Ã£o do dia Ã© calculada no main (`SituacaoDia`): registrado > descanso > futuro > pendente (hoje) > sem_registro (passado).
- `meta_no_dia` Ã© capturada na primeira gravaÃ§Ã£o do dia; se a programaÃ§Ã£o de hoje mudar depois, o registro mantÃ©m a meta original (a interface mostra a diferenÃ§a).
- Registro em dia de descanso Ã© permitido (`meta_no_dia` NULL), pois o usuÃ¡rio pode ter praticado mesmo assim.
- A tela "Hoje" recarrega ao voltar o foco para a janela (virada de dia com o app aberto).
- IPC devolve `Resultado<T>` (`ok`/`erro`), sem lanÃ§ar exceÃ§Ãµes ao renderer; erros inesperados viram mensagem genÃ©rica.
- `better-sqlite3` 13 usa binÃ¡rios N-API prÃ©-compilados: carrega no Node (testes) e no Electron sem `electron-rebuild`. Em `electron.vite.config.ts` as dependÃªncias sÃ£o externalizadas (obrigatÃ³rio para mÃ³dulo nativo).
- Camadas: `core` (regras puras) â†’ `data` (repositÃ³rios) â†’ `main` (IPC) â†’ `preload` â†’ `renderer`.
- VariÃ¡vel `ELECTRON_RUN_AS_NODE` (definida por algumas IDEs) Ã© removida por `scripts/electron-vite.mjs`.

## Regras das mÃ©tricas (etapa 5)
DecisÃµes definitivas do usuÃ¡rio:
1. NÃ£o permitir registros anteriores Ã  data de criaÃ§Ã£o do item (sem "data de inÃ­cio" editÃ¡vel).
2. Descanso geral nÃ£o serÃ¡ implementado; descansos continuam individuais por atividade.
3. Arquivamento permanece simples (uma data); nÃ£o hÃ¡ histÃ³rico de perÃ­odos arquivados.
4. Dia passado sem registro conta como falha nas mÃ©tricas, mas a ausÃªncia continua no banco (nunca se grava "NÃ£o realizada" automaticamente).

Regras implementadas:
- **ConsistÃªncia** = dias com prÃ¡tica (`concluido` ou `parcial`) Ã· dias previstos Ã— 100. **Cumprimento** = dias `concluido` Ã· dias previstos Ã— 100. Sem dias previstos: "Sem dados" (null), sem divisÃ£o por zero.
- **Dia previsto** = tem meta na programaÃ§Ã£o vigente da data (histÃ³rica, respeitando vigÃªncias). Descanso semanal ou excepcional fica fora do denominador, inclusive quando houve prÃ¡tica; essa prÃ¡tica aparece Ã  parte (`praticaEmDescanso`).
- **Falhas:** `nao_realizado` e dia previsto jÃ¡ terminado sem registro. A quantidade informada nunca define o status.
- **Janela:** do inÃ­cio do perÃ­odo (ou da criaÃ§Ã£o, o que for mais recente) atÃ© **ontem**. Hoje e datas futuras ficam fora de consistÃªncia e cumprimento. "Hoje" usa a data local do app (`hojeIso`), com aritmÃ©tica de datas em UTC sobre strings ISO (sem erro de fuso).
- **Arquivada:** nÃ£o conta a partir da data do arquivamento (`arquivado_em`); some da lista se nÃ£o tem dias elegÃ­veis no perÃ­odo.
- **Quantidade total:** soma de `valor_realizado` na janela (inclui dias de descanso e qualquer status), na unidade da prÃ³pria atividade. Nenhum indicador geral soma quantidades entre atividades.
- **SequÃªncias** (todo o histÃ³rico, independentes do filtro): previsto com prÃ¡tica +1; previsto sem prÃ¡tica (nÃ£o realizado ou sem registro) zera; descanso Ã© neutro (prÃ¡tica em descanso nÃ£o soma); hoje conta se jÃ¡ houve prÃ¡tica e, se ainda nÃ£o houve, nÃ£o quebra.
- Geral = soma das contagens das atividades; percentuais gerais pelo total de dias.

LimitaÃ§Ãµes conhecidas:
- Atividade arquivada e depois **desarquivada** volta a contar desde a criaÃ§Ã£o (o intervalo arquivado nÃ£o Ã© rastreado); as mÃ©tricas passadas mudam nesse caso.
- Mudar a meta futura nÃ£o altera o histÃ³rico, mas dias passados sem registro de uma atividade criada hÃ¡ muito contam como falha; Ã© regra definida pelo usuÃ¡rio.
- PrÃ¡tica em dia de descanso nÃ£o eleva a sequÃªncia nem os percentuais (por decisÃ£o).

## Regras das visualizaÃ§Ãµes (etapa 6)
- **Estados do dia** (`EstadoDia`, `classificarDia`): concluido, parcial, nao_realizado, sem_registro, descanso, pendente (hoje), futuro, antes_criacao, arquivada. PrecedÃªncia: antes da criaÃ§Ã£o > arquivada (data >= `arquivado_em`) > futuro > descanso > registro > pendente/sem registro.
- Descanso (semanal ou excepcional) prevalece sobre a ausÃªncia de registro; se houve registro no descanso, o estado continua `descanso` e `praticaEmDescanso` marca prÃ¡tica concluÃ­da/parcial. Descanso agendado em data futura aparece como "Dia futuro" com a observaÃ§Ã£o na dica.
- Percentuais e contagens de qualquer bloco usam `acumularDia` (mesma regra da etapa 5): hoje, futuro, pendente, antes da criaÃ§Ã£o e arquivada nÃ£o contam. Janela = `janelaDoPeriodo` (atÃ© ontem).
- **Quantidade:** `null` = nÃ£o informada (sÃ³ status ou sem registro); `0` = zero informado. Nunca se inventa quantidade. A quantidade nÃ£o altera estado, cor nem percentuais.
- **Meta no grÃ¡fico:** meta efetiva da data pela programaÃ§Ã£o histÃ³rica (`metaDoDia`), nÃ£o o `meta_no_dia` do registro; descanso = sem meta.
- GrÃ¡fico plota no mÃ¡ximo os Ãºltimos 180 dias da janela (indicado na tela; o total considera todo o perÃ­odo). Comparativos: Ãºltimas 26 semanas e 24 meses.
- "Todas as atividades": sÃ³ comparativos de consistÃªncia; calendÃ¡rio e quantidades exigem uma atividade (unidades diferentes nunca sÃ£o somadas).
- Semana = segunda a domingo; blocos nas bordas do perÃ­odo podem ter menos dias contados (mostrado como "X de Y dias").

LimitaÃ§Ãµes: calendÃ¡rio Ã© mensal (nÃ£o hÃ¡ visÃ£o anual em grade de semanas); descanso futuro nÃ£o tem marca prÃ³pria na cor do calendÃ¡rio (sÃ³ na dica); sem exportaÃ§Ã£o das visualizaÃ§Ãµes.

## Regras da autoavaliaÃ§Ã£o (etapa 7)
DecisÃ£o do usuÃ¡rio: escala de **0 a 10, valores inteiros**.
- A nota Ã© sempre digitada/escolhida pelo usuÃ¡rio. Nada a calcula, sugere ou ajusta a partir de tempo praticado, quantidade, consistÃªncia, cumprimento, metas ou sequÃªncias; nÃ£o hÃ¡ nÃ­veis automÃ¡ticos nem recomendaÃ§Ãµes.
- Tabela `avaliacao (item_id, data, nota, observacao, criado_em, atualizado_em)`, `UNIQUE (item_id, data)`, `CHECK nota BETWEEN 0 AND 10`. Nenhuma outra tabela lÃª ou escreve nela; `registro`, `programacao_semanal` e `descanso_data` nÃ£o sÃ£o tocadas.
- ValidaÃ§Ã£o no main: nota inteira 0â€“10 (rejeita negativas, >10, decimais, texto, NaN); observaÃ§Ã£o atÃ© 500 caracteres; data real, `criado_em <= data <= hoje`; item deve ser habilidade e estar ativo para criar/editar/remover.
- VariaÃ§Ã£o = Ãºltima nota âˆ’ nota imediatamente anterior (por data); sem anterior = nula ("primeira avaliaÃ§Ã£o"). Pode subir, descer ou ficar igual. Datas sem avaliaÃ§Ã£o nÃ£o geram pontos nem valores.
- Habilidade arquivada: histÃ³rico consultÃ¡vel, nÃ£o editÃ¡vel e nÃ£o Ã© reativada. ExclusÃ£o definitiva bloqueada se houver avaliaÃ§Ãµes (FK `RESTRICT` + verificaÃ§Ã£o).
- RemoÃ§Ã£o pede confirmaÃ§Ã£o na interface (`window.confirm`); a API em si Ã© idempotente.

LimitaÃ§Ãµes: a ediÃ§Ã£o troca a avaliaÃ§Ã£o de uma data (para mover de data, remover e criar outra); o grÃ¡fico usa todo o histÃ³rico (sem filtro de perÃ­odo); nÃ£o hÃ¡ avaliaÃ§Ã£o por sub-habilidade nem metas de nota.

## Regras de dados e distribuiÃ§Ã£o (etapa 8)
DecisÃµes do usuÃ¡rio: backup = cÃ³pia do SQLite com restauraÃ§Ã£o; importaÃ§Ã£o conservadora (sÃ³ dados com
correspondÃªncia comprovada); distribuiÃ§Ã£o = instalador `.exe` Windows; nunca importar a regra de +1%/dia.

**Backup** (`data/backup.ts`): API `db.backup()` do better-sqlite3 (consistente com WAL), escrito em
`<destino>.parcial`, verificado (`integrity_check`, schema_migrations) e sÃ³ entÃ£o renomeado; resultado em arquivo
Ãºnico (`journal_mode=DELETE`). Recusa destino igual ao banco em uso e pasta temporÃ¡ria do sistema. Sobrescrita
confirmada pelo diÃ¡logo nativo (`showOverwriteConfirmation`). O banco original nÃ£o Ã© modificado.

**RestauraÃ§Ã£o** (`data/restauracao.ts`): valida (SQLite Ã­ntegro, tem `schema_migrations`+`item`, versÃ£o <= a da
aplicaÃ§Ã£o) â†’ cÃ³pia temporÃ¡ria ao lado do banco via backup API â†’ migra (`migrar`) â†’ `integrity_check` +
`foreign_key_check` â†’ cÃ³pia de seguranÃ§a do banco atual em `userData/backups-automaticos` â†’ checkpoint WAL,
fecha a conexÃ£o, move o banco atual para um nome auxiliar, remove `-wal`/`-shm` obsoletos e renomeia a cÃ³pia
preparada â†’ o app reinicia (`app.relaunch`). Falha depois do fechamento recupera o arquivo anterior (e, em Ãºltimo
caso, a cÃ³pia de seguranÃ§a). Antes do fechamento nada em uso Ã© alterado. O arquivo escolhido nunca Ã© alterado.
Exige token da prÃ©via + caixa de confirmaÃ§Ã£o na interface.

**Exclusividade** (`main/resultado.ts`): enquanto backup/restauraÃ§Ã£o/importaÃ§Ã£o rodam, as demais chamadas IPC
sÃ£o recusadas; apÃ³s restaurar, tudo Ã© recusado atÃ© o reinÃ­cio. Caminhos de arquivo nunca passam pelo renderer
(diÃ¡logos nativos no main, confirmaÃ§Ãµes por token).

**ImportaÃ§Ã£o** (`data/importacao.ts`, migraÃ§Ã£o 006 `importacao_origem`). Esquema real do app Python
(`banco.py`/`logica.py`): `indicadores(id, nome, unidade '', valor_inicial>0, direcao, data_inicio ISO, cor)`,
`registros(indicador_id, data ISO, valor>0, UNIQUE)`, `meta(chave,valor)` interna. O app sÃ³ gravava registro
com a data de hoje. Mapeamento:

| Origem (antigo) | Destino | DecisÃ£o |
|---|---|---|
| `nome` | `item.nome` | direto; nome repetido/em uso por atividade ativa â†’ bloqueado |
| `unidade` | `item.unidade` | direto; vazia (>20) â†’ bloqueado (nÃ£o Ã© inventada) |
| `data_inicio` | `item.criado_em` | inÃ­cio do acompanhamento; invÃ¡lida/futura â†’ bloqueado |
| `registros.valor` | `registro.valor_realizado` | observaÃ§Ã£o real; data < inÃ­cio, futura ou valor fora de 0â€“1e6 â†’ incompatÃ­vel |
| status do registro | `registro.status` | **escolhido pelo usuÃ¡rio** por indicador (ou nÃ£o importar registros); nunca inferido |
| meta | `programacao_semanal` | **informada pelo usuÃ¡rio** (todos os dias, desde o inÃ­cio); a meta antiga era calculada |
| tipo hÃ¡bito/habilidade | `item.tipo` | **escolhido pelo usuÃ¡rio** (padrÃ£o hÃ¡bito) |
| `valor_inicial`, `direcao`, `cor`, curva ideal, sequÃªncia, tabela `meta` | â€” | **ignorados** |
| notas 0â€“10 | â€” | nunca criadas |

SeguranÃ§a: banco antigo aberto somente leitura (hash idÃªntico antes/depois nos testes); prÃ©via sem escrita
(cancelar nÃ£o altera nada); backup automÃ¡tico antes; transaÃ§Ã£o Ãºnica; `ON CONFLICT DO NOTHING` (nunca
sobrescreve registros nem metas); duplicatas evitadas por `importacao_origem (origem='app-python-v2', id_origem,
chave_origem=nome|data_inicio)`; mesmo id com nome/data diferentes â†’ ambÃ­guo/bloqueado; atividade importada e
depois arquivada â†’ bloqueada para novos registros.
Banco antigo real do usuÃ¡rio (inspecionado em cÃ³pia): 2 indicadores ("Ler livro", "teste"), 1 registro; ambos
importÃ¡veis, 0 incompatÃ­veis. Nada foi importado para o banco real durante o desenvolvimento.

**Instalador** (electron-builder 26, NSIS x64): `npm run dist` â†’ `release\Evolucao-Pessoal-Setup-1.0.0.exe`
(`npm run pack` â†’ `release\win-unpacked`). `appId br.com.evolucaopessoal.app`, nome "EvoluÃ§Ã£o Pessoal",
instalaÃ§Ã£o por usuÃ¡rio, pasta alterÃ¡vel, atalhos de Menu Iniciar e Ã¡rea de trabalho, `deleteAppDataOnUninstall:
false`. `better-sqlite3` fica em `app.asar.unpacked` (binÃ¡rio N-API `win32-x64`, ABI estÃ¡vel: verificado no
Electron 44 empacotado); react/react-dom sÃ³ em devDependencies (jÃ¡ embutidos no bundle do renderer). `userData`
fixado em `%APPDATA%\evolucao-pessoal` (exceto com `--user-data-dir`), independente de versÃ£o e da pasta de
instalaÃ§Ã£o. InstÃ¢ncia Ãºnica por pasta de dados. Sem assinatura (SmartScreen) e sem Ã­cone prÃ³prio. Sem atualizaÃ§Ã£o
automÃ¡tica. SeguranÃ§a do Electron mantida (contextIsolation, sandbox, sem nodeIntegration, sem conteÃºdo remoto).

**Testes da etapa 8:** 174 unitÃ¡rios (backup, restauraÃ§Ã£o, falha simulada, versÃµes, importaÃ§Ã£o, repetiÃ§Ã£o,
cancelamento, atomicidade) + ponta a ponta no app em dev e empacotado (diÃ¡logos substituÃ­dos pelo inspetor do
processo principal, sÃ³ no teste): abas, backup, restauraÃ§Ã£o com reinÃ­cio, importaÃ§Ã£o repetida, persistÃªncia;
instalador executado em modo silencioso em pasta temporÃ¡ria, reinstalado por cima (dados preservados) e
desinstalado (atalhos removidos, dados mantidos).

## SeguranÃ§a / dependÃªncias
- `npm audit` (tudo): 8 moderados, **todos em ferramenta de empacotamento (devDependencies)**: cadeia
  `electron-builder â†’ app-builder-lib â†’ @electron/get â†’ global-agent â†’ roarr â†’ sprintf-js@1.1.3` (DoS por
  especificadores de precisÃ£o; sem versÃ£o corrigida publicada; a "correÃ§Ã£o" sugerida Ã© um downgrade). NÃ£o faz
  parte do aplicativo instalado: `npm audit --omit=dev` = **0**. Reavaliar quando houver `sprintf-js` > 1.1.3.
- Electron 44.7.2, Vitest 5.0.4, better-sqlite3 13.0.3, electron-vite 4.0.1, Vite 7.3.7, electron-builder 26.15.3.
- Electron sÃ³ cobre as 3 Ãºltimas versÃµes major: reavaliar a atualizaÃ§Ã£o periodicamente (`npm audit` a cada etapa).
- npm 11 nÃ£o executa scripts de instalaÃ§Ã£o sem aprovaÃ§Ã£o (`allowScripts`): apÃ³s `npm install` com mudanÃ§a de Electron, rodar `node node_modules/electron/install.js` para baixar o binÃ¡rio. O `better-sqlite3` nÃ£o precisa de build (binÃ¡rio N-API prÃ©-compilado).

## PrÃ³xima tarefa recomendada
Planejamento original concluÃ­do. PrÃ³ximos passos sugeridos (a decidir com o usuÃ¡rio): teste manual de instalaÃ§Ã£o em mÃ¡quina limpa, Ã­cone do aplicativo, assinatura de cÃ³digo e atualizaÃ§Ã£o automÃ¡tica (se desejado).

