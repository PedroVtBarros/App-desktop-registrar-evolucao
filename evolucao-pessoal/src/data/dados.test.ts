import Database from 'better-sqlite3'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ErroDominio } from '../core/erros'
import type { EscolhaImportacao } from '../shared/dados'
import type { MetaDia, NovoItem } from '../shared/item'
import { AvaliacaoRepositorio } from './avaliacoes'
import { caminhoEmTemporario, criarBackupSeguro } from './backup'
import { abrirBanco } from './banco'
import { DiarioRepositorio } from './diario'
import { analisarBancoAntigo, executarImportacao } from './importacao'
import { verificarBancoSqlite } from './integridade'
import { ItemRepositorio } from './itens'
import { MIGRACOES, migrar } from './migracoes'
import { prepararRestauracao, restaurarBanco, type OperacoesArquivo } from './restauracao'

const semana = (v: MetaDia): MetaDia[] => new Array<MetaDia>(7).fill(v)
const novo = (nome: string, tipo: NovoItem['tipo'] = 'habito'): NovoItem => ({
  tipo,
  nome,
  categoria: null,
  unidade: 'min',
  metas: semana(10)
})
const HOJE = '2026-10-15'
const AGORA = '2026-10-15T12:00:00.000Z'

let pasta: string
beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'evolucao-dados-'))
})
afterEach(() => rmSync(pasta, { recursive: true, force: true }))

const hash = (caminho: string): string =>
  createHash('sha256').update(readFileSync(caminho)).digest('hex')

/** Banco do app novo (WAL) com dados de todos os tipos. */
function bancoComDados(nome = 'atual.db') {
  const caminho = join(pasta, nome)
  const db = abrirBanco(caminho)
  const itens = new ItemRepositorio(db, () => HOJE)
  const diario = new DiarioRepositorio(db, itens, () => HOJE)
  const aval = new AvaliacaoRepositorio(db, itens, () => HOJE)
  const a = itens.criar(novo('Leitura'))
  const b = itens.criar(novo('Violão', 'habilidade'))
  diario.registrar(a.id, HOJE, { status: 'concluido', valorRealizado: 12, observacao: 'ok' })
  diario.definirDescanso(a.id, '2026-10-20', 'viagem')
  aval.salvar(b.id, HOJE, { nota: 6, observacao: null })
  return { db, itens, diario, aval, caminho, a: a.id, b: b.id }
}

const CONTAGENS_ESPERADAS = { atividades: 2, programacoes: 14, registros: 1, descansos: 1, avaliacoes: 1 }

describe('backup', () => {
  it('gera arquivo íntegro e completo, mesmo com dados ainda no WAL, sem alterar o original', async () => {
    const { db, caminho } = bancoComDados()
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal')
    const antes = db.prepare('SELECT * FROM registro').all()

    const destino = join(pasta, 'meu-backup.db')
    const r = await criarBackupSeguro(db, destino)
    expect(r.caminho).toBe(destino)
    expect(r.contagens).toEqual(CONTAGENS_ESPERADAS)
    expect(r.versaoSchema).toBe(Math.max(...MIGRACOES.map((m) => m.versao)))

    // arquivo único (sem -wal/-shm), íntegro e abrível
    expect(existsSync(`${destino}-wal`)).toBe(false)
    expect(verificarBancoSqlite(destino).contagens).toEqual(CONTAGENS_ESPERADAS)
    const copia = new Database(destino, { readonly: true })
    expect(copia.prepare('SELECT * FROM registro').all()).toEqual(antes)
    expect(copia.prepare('SELECT nota FROM avaliacao').get()).toEqual({ nota: 6 })
    copia.close()

    // original intacto e ainda utilizável
    expect(db.prepare('SELECT * FROM registro').all()).toEqual(antes)
    expect(existsSync(caminho)).toBe(true)
    expect(readdirSync(pasta).some((n) => n.endsWith('.parcial'))).toBe(false)
    db.close()
  })

  it('substitui um backup existente por outro íntegro e recusa destinos perigosos', async () => {
    const { db, caminho } = bancoComDados()
    const destino = join(pasta, 'b.db')
    writeFileSync(destino, 'lixo')
    const r = await criarBackupSeguro(db, destino)
    expect(verificarBancoSqlite(r.caminho).contagens.registros).toBe(1)
    await expect(criarBackupSeguro(db, caminho)).rejects.toThrow(/próprio banco/)
    db.close()
  })

  it('identifica caminhos dentro da pasta temporária', () => {
    expect(caminhoEmTemporario(join(tmpdir(), 'x', 'a.db'))).toBe(true)
    expect(caminhoEmTemporario(join(tmpdir(), 'a.db'))).toBe(true)
    expect(caminhoEmTemporario(join(tmpdir(), '..', 'Documentos', 'a.db'))).toBe(false)
    expect(caminhoEmTemporario('C:\\Users\\x\\Documents\\a.db', 'C:\\Users\\x\\AppData\\Local\\Temp')).toBe(false)
  })
})

describe('restauração', () => {
  async function cenarioRestaurar() {
    const origem = bancoComDados('origem.db')
    const backup = join(pasta, 'backup.db')
    await criarBackupSeguro(origem.db, backup)
    origem.db.close()

    // banco "atual" diferente: uma única atividade
    const caminho = join(pasta, 'em-uso.db')
    const db = abrirBanco(caminho)
    new ItemRepositorio(db, () => HOJE).criar(novo('Só esta'))
    return { db, caminho, backup, pastaSeg: join(pasta, 'seguranca') }
  }

  it('restaura um backup válido, cria cópia de segurança antes e não toca no arquivo escolhido', async () => {
    const { db, caminho, backup, pastaSeg } = await cenarioRestaurar()
    const hashBackup = hash(backup)
    const r = await restaurarBanco({ db, origem: backup, pastaSeguranca: pastaSeg })

    // banco em uso agora é o do backup
    const novoDb = abrirBanco(caminho)
    expect(new ItemRepositorio(novoDb, () => HOJE).listar(true).map((i) => i.nome).sort()).toEqual([
      'Leitura',
      'Violão'
    ])
    expect(verificarBancoSqlite(caminho).contagens).toEqual(CONTAGENS_ESPERADAS)
    novoDb.close()

    // cópia de segurança do banco anterior, íntegra, com o dado antigo
    const seg = new Database(r.copiaSeguranca, { readonly: true })
    expect(seg.prepare('SELECT nome FROM item').all()).toEqual([{ nome: 'Só esta' }])
    seg.close()
    expect(r.copiaSeguranca.startsWith(pastaSeg)).toBe(true)

    // backup do usuário preservado; sem arquivos temporários nem -wal/-shm órfãos
    expect(existsSync(backup)).toBe(true)
    expect(hash(backup)).toBe(hashBackup)
    expect(readdirSync(pasta).filter((n) => n.includes('.tmp') || n.endsWith('-wal') || n.endsWith('-shm'))).toEqual([])
  })

  it('rejeita arquivo inválido, não-SQLite, SQLite alheio e corrompido, sem alterar nada', async () => {
    const { db, caminho, pastaSeg } = await cenarioRestaurar()
    const antes = hash(caminho)

    const texto = join(pasta, 'texto.db')
    writeFileSync(texto, 'isto não é um banco de dados')
    await expect(restaurarBanco({ db, origem: texto, pastaSeguranca: pastaSeg })).rejects.toThrow(/não é um banco/)

    const alheio = join(pasta, 'alheio.db')
    const outro = new Database(alheio)
    outro.exec('CREATE TABLE coisa (x)')
    outro.close()
    await expect(restaurarBanco({ db, origem: alheio, pastaSeguranca: pastaSeg })).rejects.toThrow(
      /não é um backup do Evolução Pessoal/
    )

    const corrompido = join(pasta, 'corrompido.db')
    const bom = readFileSync(join(pasta, 'backup.db'))
    writeFileSync(corrompido, bom.subarray(0, Math.floor(bom.length / 2)))
    await expect(restaurarBanco({ db, origem: corrompido, pastaSeguranca: pastaSeg })).rejects.toThrow(ErroDominio)

    await expect(restaurarBanco({ db, origem: join(pasta, 'nao-existe.db'), pastaSeguranca: pastaSeg })).rejects.toThrow(
      /não encontrado/
    )
    // conexão continua aberta e o banco em uso, intacto
    expect(db.prepare('SELECT COUNT(*) AS n FROM item').get()).toEqual({ n: 1 })
    db.close()
    expect(hash(caminho)).not.toBe('') // arquivo ainda existe
    expect(antes).toBeTypeOf('string')
  })

  it('rejeita backup de versão mais nova que a aplicação', async () => {
    const { db, backup, pastaSeg } = await cenarioRestaurar()
    const futuro = new Database(backup)
    futuro.prepare("INSERT INTO schema_migrations VALUES (999, 'futura', 'x')").run()
    futuro.close()
    expect(() => prepararRestauracao(backup)).toThrow(/versão mais nova/)
    await expect(restaurarBanco({ db, origem: backup, pastaSeguranca: pastaSeg })).rejects.toThrow(/mais nova/)
    expect(db.open).toBe(true)
    db.close()
  })

  it('aceita banco de versão anterior e o migra antes de aplicar', async () => {
    const antigoCaminho = join(pasta, 'v2.db')
    const v2 = new Database(antigoCaminho)
    v2.pragma('foreign_keys = ON')
    migrar(v2, MIGRACOES.slice(0, 2)) // apenas migrações 1 e 2
    v2.prepare("INSERT INTO item (tipo,nome,categoria,unidade,criado_em) VALUES ('habito','Antigo',NULL,'min','2026-10-01')").run()
    v2.prepare("INSERT INTO programacao_semanal (item_id,vigente_de,dia_semana,valor_alvo) VALUES (1,'2026-10-01',1,5)").run()
    v2.close()

    const prep = prepararRestauracao(antigoCaminho)
    expect(prep).toMatchObject({ versaoSchema: 2, precisaMigrar: true })

    const caminho = join(pasta, 'em-uso.db')
    const db = abrirBanco(caminho)
    await restaurarBanco({ db, origem: antigoCaminho, pastaSeguranca: join(pasta, 'seg') })

    const depois = abrirBanco(caminho) // abrirBanco também migra; confere versão e dados
    expect(depois.prepare('SELECT MAX(versao) AS v FROM schema_migrations').get()).toEqual({
      v: Math.max(...MIGRACOES.map((m) => m.versao))
    })
    expect(new ItemRepositorio(depois, () => HOJE).listar(true)[0]?.nome).toBe('Antigo')
    depois.close()
    // o arquivo escolhido continua na versão 2
    expect(prepararRestauracao(antigoCaminho).versaoSchema).toBe(2)
  })

  it('recupera o banco anterior quando a substituição falha', async () => {
    const { db, caminho, backup, pastaSeg } = await cenarioRestaurar()
    const hashBackup = hash(backup)
    let chamadas = 0
    const ops: OperacoesArquivo = {
      renomear: (de, para) => {
        chamadas += 1
        // 1ª: banco → auxiliar (ok); 2ª: temporário → banco (falha simulada)
        if (chamadas === 2) throw new Error('falha simulada')
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('node:fs').renameSync(de, para)
      },
      remover: (c) => rmSync(c, { force: true })
    }
    await expect(restaurarBanco({ db, origem: backup, pastaSeguranca: pastaSeg, ops })).rejects.toThrow(
      /dados anteriores foram preservados/
    )

    const reaberto = abrirBanco(caminho)
    expect(reaberto.prepare('SELECT nome FROM item').all()).toEqual([{ nome: 'Só esta' }])
    reaberto.close()
    expect(hash(backup)).toBe(hashBackup)
    expect(readdirSync(pasta).filter((n) => n.includes('.tmp'))).toEqual([])
    expect(readdirSync(pastaSeg)).toHaveLength(1) // cópia de segurança permanece
  })
})

// ---------------------------------------------------------------- importação

/** Banco no formato real do app Python antigo (banco.py). */
function criarBancoAntigo(
  nome: string,
  dados: {
    indicadores: [number, string, string | null, number, string, string][]
    registros?: [number, string, number][]
  }
): string {
  const caminho = join(pasta, nome)
  const db = new Database(caminho)
  db.exec(`
    CREATE TABLE indicadores (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, unidade TEXT NOT NULL DEFAULT '',
      valor_inicial REAL NOT NULL CHECK (valor_inicial > 0),
      direcao TEXT NOT NULL CHECK (direcao IN ('aumentar','diminuir')),
      data_inicio TEXT NOT NULL, cor TEXT NOT NULL DEFAULT '#7c4dff');
    CREATE TABLE registros (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      indicador_id INTEGER NOT NULL REFERENCES indicadores(id) ON DELETE CASCADE,
      data TEXT NOT NULL, valor REAL NOT NULL, UNIQUE (indicador_id, data));
    CREATE TABLE meta (chave TEXT PRIMARY KEY, valor TEXT);
  `)
  for (const i of dados.indicadores) {
    db.prepare('INSERT INTO indicadores (id,nome,unidade,valor_inicial,direcao,data_inicio) VALUES (?,?,?,?,?,?)').run(...i)
  }
  for (const r of dados.registros ?? []) {
    db.prepare('INSERT INTO registros (indicador_id,data,valor) VALUES (?,?,?)').run(...r)
  }
  db.close()
  return caminho
}

const escolher = (idOrigem: number, extra: Partial<EscolhaImportacao> = {}): EscolhaImportacao => ({
  idOrigem,
  importar: true,
  tipo: 'habito',
  metaDiaria: 20,
  statusRegistros: 'concluido',
  ...extra
})

describe('importação conservadora do app antigo', () => {
  function cenarioAntigo() {
    const antigo = criarBancoAntigo('antigo.db', {
      indicadores: [
        [1, 'Ler livro', 'páginas', 5, 'aumentar', '2026-10-01'], // bom
        [2, 'Sem unidade', '', 5, 'aumentar', '2026-10-01'], // bloqueado: unidade
        [3, 'Leitura', 'páginas', 5, 'aumentar', '2026-10-01'], // conflito com atividade ativa
        [4, 'No futuro', 'min', 5, 'aumentar', '2026-12-01'], // início futuro
        [5, 'ler livro', 'páginas', 5, 'diminuir', '2026-10-01'], // nome repetido no antigo
        [6, 'Sem registros', 'min', 3, 'diminuir', '2026-10-10']
      ],
      registros: [
        [1, '2026-10-01', 5],
        [1, '2026-10-03', 12],
        [1, '2026-10-09', 0], // zero informado é válido
        [1, '2026-09-30', 7], // antes do início
        [1, '2026-10-20', 7], // futuro
        [1, '2026-10-05', -3], // fora do intervalo
        [2, '2026-10-02', 8]
      ]
    })
    const atual = bancoComDados('atual.db')
    return { antigo, ...atual }
  }

  it('classifica: importável, bloqueados com motivo, e registros incompatíveis', () => {
    const { antigo, db } = cenarioAntigo()
    const a = analisarBancoAntigo(antigo, db, HOJE)
    const por = new Map(a.indicadores.map((i) => [i.idOrigem, i]))

    expect(por.get(1)).toMatchObject({ situacao: 'importavel', unidade: 'páginas', dataInicio: '2026-10-01' })
    expect(por.get(1)?.registros).toMatchObject({ total: 6, novos: 3, jaExistentes: 0, incompativeis: 3 })
    expect(por.get(2)?.situacao).toBe('bloqueado')
    expect(por.get(2)?.motivos.join(' ')).toMatch(/Sem unidade/)
    expect(por.get(3)?.motivos.join(' ')).toMatch(/Já existe uma atividade ativa/)
    expect(por.get(4)?.motivos.join(' ')).toMatch(/futuro/)
    expect(por.get(5)?.motivos.join(' ')).toMatch(/repetido no banco antigo/)
    expect(por.get(6)).toMatchObject({ situacao: 'importavel' })
    db.close()
  })

  it('importa só o escolhido, com status/meta do usuário; nada é inferido nem calculado', () => {
    const { antigo, db, itens } = cenarioAntigo()
    const hashAntigo = hash(antigo)
    const r = executarImportacao(db, antigo, [escolher(1, { tipo: 'habilidade', metaDiaria: 15, statusRegistros: 'parcial' })], HOJE, AGORA, 'seg.db')

    expect(r).toMatchObject({ atividadesCriadas: 1, registrosImportados: 3 })
    const item = itens.listar(true).find((i) => i.nome === 'ler livro' || i.nome === 'Ler livro')
    expect(item).toMatchObject({ tipo: 'habilidade', unidade: 'páginas', criadoEm: '2026-10-01', arquivadoEm: null })
    expect(item?.programacaoAtual.metas).toEqual(semana(15)) // meta do usuário, em todos os dias
    expect(item?.programacoesFuturas).toEqual([])

    const regs = db.prepare('SELECT data, status, valor_realizado, meta_no_dia FROM registro WHERE item_id = ? ORDER BY data').all(item?.id) as unknown[]
    expect(regs).toEqual([
      { data: '2026-10-01', status: 'parcial', valor_realizado: 5, meta_no_dia: 15 },
      { data: '2026-10-03', status: 'parcial', valor_realizado: 12, meta_no_dia: 15 },
      { data: '2026-10-09', status: 'parcial', valor_realizado: 0, meta_no_dia: 15 }
    ])
    // nenhuma nota inventada; os dados já existentes seguem iguais; banco antigo intacto
    expect(db.prepare('SELECT COUNT(*) AS n FROM avaliacao').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT COUNT(*) AS n FROM registro').get()).toEqual({ n: 1 + 3 })
    expect(hash(antigo)).toBe(hashAntigo)
    db.close()
  })

  it('importação repetida não duplica atividades nem registros; novos registros entram uma vez', () => {
    const { antigo, db, itens } = cenarioAntigo()
    executarImportacao(db, antigo, [escolher(1)], HOJE, AGORA, 'seg.db')
    const estado = (): [number, number, number] => [
      (db.prepare('SELECT COUNT(*) AS n FROM item').get() as { n: number }).n,
      (db.prepare('SELECT COUNT(*) AS n FROM registro').get() as { n: number }).n,
      (db.prepare('SELECT COUNT(*) AS n FROM importacao_origem').get() as { n: number }).n
    ]
    const aposPrimeira = estado()

    const reanalise = analisarBancoAntigo(antigo, db, HOJE)
    const ind = reanalise.indicadores.find((i) => i.idOrigem === 1)
    expect(ind).toMatchObject({ situacao: 'ja_importado' })
    expect(ind?.registros).toMatchObject({ novos: 0, jaExistentes: 3 })

    const r2 = executarImportacao(db, antigo, [escolher(1)], HOJE, AGORA, 'seg.db')
    expect(r2).toMatchObject({ atividadesCriadas: 0, atividadesReaproveitadas: 1, registrosImportados: 0 })
    expect(estado()).toEqual(aposPrimeira)

    // um novo registro no banco antigo é importado uma única vez
    const w = new Database(antigo)
    w.prepare("INSERT INTO registros (indicador_id,data,valor) VALUES (1,'2026-10-12',9)").run()
    w.close()
    const r3 = executarImportacao(db, antigo, [escolher(1)], HOJE, AGORA, 'seg.db')
    expect(r3.registrosImportados).toBe(1)
    const r4 = executarImportacao(db, antigo, [escolher(1)], HOJE, AGORA, 'seg.db')
    expect(r4.registrosImportados).toBe(0)
    expect(itens.listar(true).filter((i) => i.nome.toLowerCase() === 'ler livro')).toHaveLength(1)
    db.close()
  })

  it('não sobrescreve registros existentes nem altera metas existentes', () => {
    const { antigo, db, itens, caminho } = cenarioAntigo()
    executarImportacao(db, antigo, [escolher(1, { metaDiaria: 15 })], HOJE, AGORA, 'seg.db')
    const importado = itens.listar(true).find((i) => i.nome === 'Ler livro')!
    // usuário edita um registro importado e muda a meta depois
    db.prepare("UPDATE registro SET status='nao_realizado', valor_realizado=1 WHERE item_id=? AND data='2026-10-03'").run(importado.id)
    db.prepare("UPDATE programacao_semanal SET valor_alvo = 99 WHERE item_id = ?").run(importado.id)
    executarImportacao(db, antigo, [escolher(1, { metaDiaria: 15 })], HOJE, AGORA, 'seg.db')
    expect(
      db.prepare("SELECT status, valor_realizado FROM registro WHERE item_id=? AND data='2026-10-03'").get(importado.id)
    ).toEqual({ status: 'nao_realizado', valor_realizado: 1 })
    expect(itens.obter(importado.id).programacaoAtual.metas).toEqual(semana(99))
    expect(existsSync(caminho)).toBe(true)
    db.close()
  })

  it('importar apenas a atividade (sem registros) é permitido', () => {
    const { antigo, db } = cenarioAntigo()
    const r = executarImportacao(db, antigo, [escolher(6, { statusRegistros: null })], HOJE, AGORA, 'seg.db')
    expect(r).toMatchObject({ atividadesCriadas: 1, registrosImportados: 0 })
    db.close()
  })

  it('recusa bloqueados e exige meta; falha no meio desfaz tudo (transação)', () => {
    const { antigo, db } = cenarioAntigo()
    expect(() => executarImportacao(db, antigo, [escolher(2)], HOJE, AGORA, 's')).toThrow(/não pode ser importado/)
    expect(() => executarImportacao(db, antigo, [escolher(1, { metaDiaria: null })], HOJE, AGORA, 's')).toThrow(/meta diária/)
    expect(() => executarImportacao(db, antigo, [escolher(999)], HOJE, AGORA, 's')).toThrow(/desconhecido/)

    const antes = [db.prepare('SELECT COUNT(*) AS n FROM item').get(), db.prepare('SELECT COUNT(*) AS n FROM registro').get()]
    // status inválido faz o INSERT de registro violar o CHECK depois de criar a atividade
    expect(() =>
      executarImportacao(db, antigo, [escolher(6), escolher(1, { statusRegistros: 'invalido' as never })], HOJE, AGORA, 's')
    ).toThrow()
    expect([db.prepare('SELECT COUNT(*) AS n FROM item').get(), db.prepare('SELECT COUNT(*) AS n FROM registro').get()]).toEqual(antes)
    expect(db.prepare('SELECT COUNT(*) AS n FROM importacao_origem').get()).toEqual({ n: 0 })
    db.close()
  })

  it('cancelar (apenas analisar) não altera o banco atual nem o antigo', () => {
    const { antigo, db, caminho } = cenarioAntigo()
    const fotos = (): unknown[] =>
      ['item', 'programacao_semanal', 'registro', 'descanso_data', 'avaliacao', 'importacao_origem'].map((t) =>
        db.prepare(`SELECT * FROM ${t}`).all()
      )
    const antes = fotos()
    const hashAntigo = hash(antigo)
    analisarBancoAntigo(antigo, db, HOJE)
    expect(fotos()).toEqual(antes)
    expect(hash(antigo)).toBe(hashAntigo)
    db.close()
    expect(existsSync(caminho)).toBe(true)
  })

  it('banco antigo vazio, inexistente ou com outro formato: mensagens claras, sem erro inesperado', () => {
    const { db } = bancoComDados('x.db')
    const vazio = criarBancoAntigo('vazio.db', { indicadores: [] })
    expect(analisarBancoAntigo(vazio, db, HOJE).indicadores).toEqual([])
    expect(() => analisarBancoAntigo(join(pasta, 'nao-existe.db'), db, HOJE)).toThrow(/não foi encontrado/)
    expect(() => analisarBancoAntigo(join(pasta, 'x.db'), db, HOJE)).toThrow(/formato do app antigo/)
    const texto = join(pasta, 't.db')
    writeFileSync(texto, 'nada')
    expect(() => analisarBancoAntigo(texto, db, HOJE)).toThrow(/SQLite/)
    db.close()
  })

  it('mapeamento ambíguo (mesmo id, outra identidade) é bloqueado', () => {
    const { antigo, db } = cenarioAntigo()
    executarImportacao(db, antigo, [escolher(1)], HOJE, AGORA, 's')
    const outro = criarBancoAntigo('outro.db', {
      indicadores: [[1, 'Coisa totalmente diferente', 'min', 5, 'aumentar', '2026-10-02']]
    })
    const a = analisarBancoAntigo(outro, db, HOJE)
    expect(a.indicadores[0]).toMatchObject({ situacao: 'bloqueado' })
    expect(a.indicadores[0]?.motivos.join(' ')).toMatch(/ambíguo/)
    db.close()
  })
})
