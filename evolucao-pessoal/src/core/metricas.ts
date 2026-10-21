import type {
  Contagens,
  MetricasAtividade,
  MetricasGerais,
  PeriodoEstatisticas
} from '../shared/estatisticas'
import type { DiaSerie } from '../shared/evolucao'
import type { Programacao } from '../shared/item'
import type { StatusRegistro } from '../shared/registro'
import { somarDias } from './datas'
import { metaDoDia } from './programacao'

/**
 * Métricas derivadas dos dados existentes (nada é gravado).
 *
 * Regras:
 * - Janela: do início do período (ou criação, o que for mais recente) até ONTEM. O dia
 *   de hoje e o futuro nunca entram em consistência/cumprimento.
 * - Atividade arquivada não é contada a partir do dia do arquivamento (modelo simples:
 *   se for desarquivada, volta a contar desde a criação).
 * - Dia previsto = tem meta (programação vigente na data, sem descanso semanal nem
 *   excepcional). Descanso fica fora do denominador, mesmo se houve prática.
 * - Prática = "concluída" ou "parcial"; "não realizada" e dia previsto sem registro são falhas.
 *   A quantidade informada nunca define o status.
 */

export interface RegistroDia {
  status: StatusRegistro
  valor: number | null
}

export interface EntradaAtividade {
  criadoEm: string
  arquivadoEm: string | null
  /** Programações semanais em qualquer ordem (histórico completo). */
  programacoes: readonly Programacao[]
  registros: ReadonlyMap<string, RegistroDia>
  /** Datas com descanso excepcional. */
  descansos: ReadonlySet<string>
}

export type ResultadoAtividade = Pick<
  MetricasAtividade,
  | 'janela'
  | 'contagens'
  | 'diasComPratica'
  | 'consistencia'
  | 'cumprimento'
  | 'quantidadeTotal'
  | 'diasComQuantidade'
  | 'sequenciaAtual'
  | 'maiorSequencia'
>

const DIAS_DO_PERIODO: Record<PeriodoEstatisticas, number | null> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  completo: null
}

export function contagensVazias(): Contagens {
  return {
    previstos: 0,
    concluidos: 0,
    parciais: 0,
    naoRealizados: 0,
    semRegistro: 0,
    descansos: 0,
    praticaEmDescanso: 0
  }
}

function percentual(parte: number, total: number): number | null {
  return total === 0 ? null : (parte / total) * 100
}

/** Meta efetiva do dia: null = descanso; undefined = sem programação vigente (não conta). */
function metaEfetiva(e: EntradaAtividade, dia: string): number | null | undefined {
  if (e.descansos.has(dia)) return null
  return metaDoDia(e.programacoes, dia)
}

const praticou = (r: RegistroDia | undefined): boolean =>
  r !== undefined && (r.status === 'concluido' || r.status === 'parcial')

/** Último dia em que a atividade ainda pode ser contada: não inclui a data de arquivamento. */
function ultimoDiaAtivo(e: EntradaAtividade, limite: string): string {
  if (e.arquivadoEm === null) return limite
  const antes = somarDias(e.arquivadoEm, -1)
  return antes < limite ? antes : limite
}

/**
 * Janela do período (termina ontem, respeita criação e arquivamento).
 * null = nenhum dia elegível.
 */
export function janelaDoPeriodo(
  e: EntradaAtividade,
  hoje: string,
  periodo: PeriodoEstatisticas
): { inicio: string; fim: string } | null {
  const ontem = somarDias(hoje, -1)
  const fim = ultimoDiaAtivo(e, ontem)
  const n = DIAS_DO_PERIODO[periodo]
  const inicioPeriodo = n === null ? e.criadoEm : somarDias(hoje, -n)
  const inicio = inicioPeriodo > e.criadoEm ? inicioPeriodo : e.criadoEm
  return inicio <= fim ? { inicio, fim } : null
}

/**
 * Classifica um dia de uma atividade. É a única definição de "o que é cada dia",
 * usada pelas estatísticas (etapa 5) e pelas visualizações (etapa 6).
 */
export function classificarDia(e: EntradaAtividade, dia: string, hoje: string): DiaSerie {
  const reg = e.registros.get(dia)
  const base = {
    data: dia,
    hoje: dia === hoje,
    status: reg?.status ?? null,
    quantidade: reg?.valor ?? null,
    praticaEmDescanso: false,
    descansoExcepcional: false
  }
  if (dia < e.criadoEm) {
    return { ...base, estado: 'antes_criacao', meta: null, status: null, quantidade: null }
  }
  if (e.arquivadoEm !== null && dia >= e.arquivadoEm) {
    return { ...base, estado: 'arquivada', meta: null }
  }
  const meta = metaEfetiva(e, dia)
  if (meta === undefined) {
    return { ...base, estado: 'antes_criacao', meta: null, status: null, quantidade: null }
  }
  if (dia > hoje) {
    return { ...base, estado: 'futuro', meta, descansoExcepcional: e.descansos.has(dia) }
  }
  if (meta === null) {
    return {
      ...base,
      estado: 'descanso',
      meta: null,
      praticaEmDescanso: praticou(reg),
      descansoExcepcional: e.descansos.has(dia)
    }
  }
  if (reg) return { ...base, estado: reg.status, meta }
  return { ...base, estado: dia === hoje ? 'pendente' : 'sem_registro', meta }
}

/**
 * Soma um dia classificado nas contagens, pela regra da etapa 5. Devolve false (e não
 * conta) para hoje, futuro, pendente, antes da criação e depois do arquivamento.
 */
export function acumularDia(c: Contagens, d: DiaSerie): boolean {
  if (d.hoje) return false
  switch (d.estado) {
    case 'concluido':
      c.previstos += 1
      c.concluidos += 1
      return true
    case 'parcial':
      c.previstos += 1
      c.parciais += 1
      return true
    case 'nao_realizado':
      c.previstos += 1
      c.naoRealizados += 1
      return true
    case 'sem_registro':
      c.previstos += 1
      c.semRegistro += 1
      return true
    case 'descanso':
      c.descansos += 1
      if (d.praticaEmDescanso) c.praticaEmDescanso += 1
      return true
    default:
      return false
  }
}

export function calcularAtividade(
  e: EntradaAtividade,
  hoje: string,
  periodo: PeriodoEstatisticas
): ResultadoAtividade {
  const janela = janelaDoPeriodo(e, hoje, periodo)
  const contagens = contagensVazias()
  let quantidadeTotal = 0
  let diasComQuantidade = 0

  if (janela) {
    for (let dia = janela.inicio; dia <= janela.fim; dia = somarDias(dia, 1)) {
      const d = classificarDia(e, dia, hoje)
      if (!acumularDia(contagens, d)) continue
      if (d.quantidade !== null) {
        quantidadeTotal += d.quantidade
        diasComQuantidade += 1
      }
    }
  }

  const diasComPratica = contagens.concluidos + contagens.parciais
  return {
    janela,
    contagens,
    diasComPratica,
    consistencia: percentual(diasComPratica, contagens.previstos),
    cumprimento: percentual(contagens.concluidos, contagens.previstos),
    quantidadeTotal,
    diasComQuantidade,
    ...calcularSequencias(e, hoje)
  }
}

/**
 * Sequência de prática sobre todo o histórico (não depende do período escolhido).
 * - Dia previsto com prática: +1. Dia previsto sem prática (não realizada ou sem registro): zera.
 * - Descanso (semanal ou excepcional): neutro, não soma nem quebra.
 * - Hoje: se já houve prática conta; se ainda não, é neutro (o dia não terminou).
 */
export function calcularSequencias(
  e: EntradaAtividade,
  hoje: string
): { sequenciaAtual: number; maiorSequencia: number } {
  const fim = ultimoDiaAtivo(e, hoje)
  let atual = 0
  let maior = 0
  for (let dia = e.criadoEm; dia <= fim; dia = somarDias(dia, 1)) {
    const meta = metaEfetiva(e, dia)
    if (meta === undefined || meta === null) continue // sem programação ou descanso: neutro
    if (praticou(e.registros.get(dia))) {
      atual += 1
      if (atual > maior) maior = atual
    } else if (dia !== hoje) {
      atual = 0 // dia previsto terminado sem prática quebra a sequência
    }
  }
  return { sequenciaAtual: atual, maiorSequencia: maior }
}

/** Agrega indicadores gerais; quantidades de unidades diferentes nunca são somadas. */
export function agregarGeral(atividades: readonly ResultadoAtividade[]): MetricasGerais {
  const total = contagensVazias()
  let atividadesComDados = 0
  for (const a of atividades) {
    if (a.contagens.previstos > 0) atividadesComDados += 1
    for (const k of Object.keys(total) as (keyof Contagens)[]) total[k] += a.contagens[k]
  }
  const diasComPratica = total.concluidos + total.parciais
  return {
    atividadesComDados,
    contagens: total,
    diasComPratica,
    consistencia: percentual(diasComPratica, total.previstos),
    cumprimento: percentual(total.concluidos, total.previstos)
  }
}
