import type Database from 'better-sqlite3'

export interface Migracao {
  versao: number
  nome: string
  sql: string
}

/**
 * Migrações numeradas e imutáveis: nunca edite uma já publicada, crie a próxima.
 * Dados do usuário não são apagados por nenhuma migração.
 */
export const MIGRACOES: readonly Migracao[] = [
  {
    versao: 1,
    nome: 'itens_e_metas',
    sql: `
      CREATE TABLE item (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo        TEXT NOT NULL CHECK (tipo IN ('habito', 'habilidade')),
        nome        TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 1 AND 80),
        categoria   TEXT CHECK (categoria IS NULL OR length(categoria) <= 40),
        unidade     TEXT NOT NULL CHECK (length(trim(unidade)) BETWEEN 1 AND 20),
        criado_em   TEXT NOT NULL,
        arquivado_em TEXT
      );

      -- Nome único apenas entre itens ativos; arquivados liberam o nome.
      CREATE UNIQUE INDEX ux_item_nome_ativo
        ON item (nome COLLATE NOCASE) WHERE arquivado_em IS NULL;

      -- Linha do tempo de metas: a meta de um dia é a linha com maior
      -- vigente_de <= dia. Linhas passadas nunca são alteradas.
      CREATE TABLE meta_diaria (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
        valor_alvo REAL    NOT NULL CHECK (valor_alvo > 0),
        vigente_de TEXT    NOT NULL,
        UNIQUE (item_id, vigente_de)
      );
    `
  },
  {
    versao: 2,
    nome: 'programacao_semanal',
    sql: `
      -- Substitui meta_diaria (um valor por vigência) por uma programação semanal:
      -- uma linha por dia da semana (1 = segunda … 7 = domingo) em cada vigência.
      -- valor_alvo NULL = descanso planejado (sem meta).
      CREATE TABLE programacao_semanal (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id    INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
        vigente_de TEXT    NOT NULL,
        dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
        valor_alvo REAL    CHECK (valor_alvo IS NULL OR valor_alvo > 0),
        UNIQUE (item_id, vigente_de, dia_semana)
      );

      -- Compatibilidade: cada meta da etapa 1 vira a mesma meta nos 7 dias,
      -- com a mesma data de vigência.
      INSERT INTO programacao_semanal (item_id, vigente_de, dia_semana, valor_alvo)
      SELECT m.item_id, m.vigente_de, d.dia, m.valor_alvo
        FROM meta_diaria m
        CROSS JOIN (SELECT 1 AS dia UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL
                    SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7) d;

      DROP TABLE meta_diaria;
    `
  },
  {
    versao: 3,
    nome: 'registro_diario',
    sql: `
      -- Um registro por item e dia. "Pendente" = ausência de linha (nada é gravado
      -- automaticamente como falha). meta_no_dia é a meta vigente quando o registro
      -- foi criado (NULL = dia de descanso) e não é alterada em edições.
      CREATE TABLE registro (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id         INTEGER NOT NULL REFERENCES item (id) ON DELETE RESTRICT,
        data            TEXT    NOT NULL,
        status          TEXT    NOT NULL CHECK (status IN ('concluido', 'parcial', 'nao_realizado')),
        valor_realizado REAL    CHECK (valor_realizado IS NULL OR valor_realizado >= 0),
        meta_no_dia     REAL    CHECK (meta_no_dia IS NULL OR meta_no_dia > 0),
        observacao      TEXT    CHECK (observacao IS NULL OR length(observacao) <= 500),
        criado_em       TEXT    NOT NULL,
        atualizado_em   TEXT    NOT NULL,
        UNIQUE (item_id, data)
      );
      CREATE INDEX ix_registro_data ON registro (data);

      -- Item com registros não pode trocar de unidade: o histórico mudaria de sentido.
      CREATE TRIGGER trg_item_unidade_com_registro
      BEFORE UPDATE OF unidade ON item
      WHEN NEW.unidade <> OLD.unidade
       AND EXISTS (SELECT 1 FROM registro WHERE item_id = OLD.id)
      BEGIN
        SELECT RAISE(ABORT, 'unidade_com_historico');
      END;
    `
  },
  {
    versao: 4,
    nome: 'descanso_por_data',
    sql: `
      -- Descanso excepcional de uma atividade em uma data específica. Não altera a
      -- programação semanal; é independente de existir (ou não) um registro no dia.
      CREATE TABLE descanso_data (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id   INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
        data      TEXT    NOT NULL,
        motivo    TEXT    CHECK (motivo IS NULL OR length(motivo) <= 100),
        criado_em TEXT    NOT NULL,
        UNIQUE (item_id, data)
      );
    `
  },
  {
    versao: 5,
    nome: 'autoavaliacao',
    sql: `
      -- Autoavaliação manual (0–10, inteira) de habilidades. Totalmente independente da
      -- prática: nenhuma outra tabela escreve aqui nem é derivada daqui. Uma por item e data.
      CREATE TABLE avaliacao (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id       INTEGER NOT NULL REFERENCES item (id) ON DELETE RESTRICT,
        data          TEXT    NOT NULL,
        nota          INTEGER NOT NULL CHECK (nota BETWEEN 0 AND 10),
        observacao    TEXT    CHECK (observacao IS NULL OR length(observacao) <= 500),
        criado_em     TEXT    NOT NULL,
        atualizado_em TEXT    NOT NULL,
        UNIQUE (item_id, data)
      );
      CREATE INDEX ix_avaliacao_item_data ON avaliacao (item_id, data);
    `
  },
  {
    versao: 6,
    nome: 'origem_importacao',
    sql: `
      -- Liga uma atividade criada por importação ao indicador de origem, para que
      -- importações repetidas não dupliquem atividades nem registros.
      CREATE TABLE importacao_origem (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        origem       TEXT    NOT NULL,
        id_origem    INTEGER NOT NULL,
        chave_origem TEXT    NOT NULL,
        item_id      INTEGER NOT NULL REFERENCES item (id) ON DELETE CASCADE,
        importado_em TEXT    NOT NULL,
        UNIQUE (origem, id_origem)
      );
    `
  }
]

export function migrar(db: Database.Database, migracoes: readonly Migracao[] = MIGRACOES): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      versao      INTEGER PRIMARY KEY,
      nome        TEXT NOT NULL,
      aplicada_em TEXT NOT NULL
    )
  `)

  const aplicadas = db
    .prepare('SELECT versao FROM schema_migrations ORDER BY versao')
    .all() as { versao: number }[]
  const maiorAplicada = aplicadas.at(-1)?.versao ?? 0
  const maiorConhecida = Math.max(0, ...migracoes.map((m) => m.versao))
  if (maiorAplicada > maiorConhecida) {
    throw new Error(
      `O banco foi criado por uma versão mais nova do aplicativo (schema ${maiorAplicada}).`
    )
  }

  const jaAplicadas = new Set(aplicadas.map((a) => a.versao))
  const registrar = db.prepare(
    'INSERT INTO schema_migrations (versao, nome, aplicada_em) VALUES (?, ?, ?)'
  )
  for (const m of [...migracoes].sort((a, b) => a.versao - b.versao)) {
    if (jaAplicadas.has(m.versao)) continue
    db.transaction(() => {
      db.exec(m.sql)
      registrar.run(m.versao, m.nome, new Date().toISOString())
    })()
  }
}
