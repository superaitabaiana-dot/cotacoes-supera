// Regras de conferência. Dois estados: "ausente" (amarelo) e "divergente" (vermelho).
// Princípio: a IA extrai, o consultor confere. Todo valor em R$ precisa existir no texto do PDF de origem.
import { CAMPOS_COMUNS, divergencias, incluidas, opcaoAtual } from "./consolidar.js";
import { hoje, moneyDigits, parseBRL, parseDate } from "./util.js";

const ROTULO = Object.fromEntries(CAMPOS_COMUNS);
const OBRIGATORIOS = ["segurado", "veiculo", "vigencia_inicio", "vigencia_fim", "data_cotacao", "validade_cotacao"];
const DESEJAVEIS = ["condutor", "estado_civil", "cep", "uso", "placa", "cobertura_menor_25"];
const DATAS = ["vigencia_inicio", "vigencia_fim", "vencimento_anterior", "data_cotacao", "validade_cotacao"];
const OBRIG_SEG = [["fipe", "FIPE"], ["franquia", "Franquia"], ["danos_materiais", "Danos materiais"], ["danos_corporais", "Danos corporais"], ["premio_total", "Preço total"]];
const DESEJ_SEG = [["danos_morais", "Danos morais"], ["app", "APP"], ["guincho", "Assistência"], ["carro_reserva", "Carro reserva"], ["vidros", "Vidros"]];
const MONETARIOS = ["franquia", "danos_materiais", "danos_corporais", "danos_morais", "app", "premio_total"];
const MARCADOR = /\[(CPF|CNPJ|EMAIL|TELEFONE|DATA DE NASCIMENTO)\]/;

/** O valor monetário aparece literalmente no texto do PDF? Sem texto de origem, não há como checar. */
export function noTexto(valor, texto) {
  if (!texto) return true;
  const nums = moneyDigits(valor); if (!nums.length) return true;
  const src = texto.replace(/\s+/g, "");
  return nums.every((n) => src.includes(n) || src.includes(n.replace(/\./g, "")));
}

/**
 * @param dados cotação consolidada
 * @param textos Map fonte_id -> texto ocultado (para a checagem antialucinação)
 * @returns lista de pendências { onde: "comum"|seguradoraId, campo, tipo, msg }
 */
export function validar(dados, textos = new Map()) {
  const out = [];
  const add = (onde, campo, tipo, msg) => { if (!out.some((p) => p.onde === onde && p.campo === campo)) out.push({ onde, campo, tipo, msg }); };
  const c = dados.comum;

  for (const k of OBRIGATORIOS) if (!c[k]) add("comum", k, "ausente", `${ROTULO[k]}: não encontrado. Preencha ou confira o PDF.`);
  if (!c.tipo) add("comum", "tipo", "ausente", "Marque seguro novo ou renovação.");
  for (const k of DATAS) if (c[k] && !parseDate(c[k])) add("comum", k, "divergente", `${ROTULO[k]}: use o formato dd/mm/aaaa.`);
  const vi = parseDate(c.vigencia_inicio), vf = parseDate(c.vigencia_fim), dc = parseDate(c.data_cotacao), vc = parseDate(c.validade_cotacao);
  if (vi && vf) { const dias = Math.round((vf - vi) / 864e5); if (dias < 364 || dias > 366) add("comum", "vigencia_fim", "divergente", `Vigência de ${dias} dias. Confira se o período é anual.`); }
  if (dc && vc && vc < dc) add("comum", "validade_cotacao", "divergente", "Validade anterior à data da cotação.");
  if (vc && vc < hoje()) add("comum", "validade_cotacao", "divergente", "Cotação vencida. Recalcule nas seguradoras antes de enviar.");
  if (dados.validade_calculada) add("comum", "validade_cotacao", "ausente", "Validade calculada pelo prazo em dias informado no PDF. Confira.");
  if (dados.fontes.length > 1 && c.validade_cotacao) {
    const datas = new Set(dados.fontes.map((f) => f.valores.validade_cotacao).filter(Boolean));
    if (datas.size > 1) add("comum", "validade_cotacao", "ausente", "As seguradoras têm validades diferentes; o documento usa a mais curta.");
  }
  if (c.tipo === "RENOVACAO" && !c.vencimento_anterior) add("comum", "vencimento_anterior", "ausente", "Informe o vencimento da apólice atual.");
  for (const k of DESEJAVEIS) if (!c[k]) add("comum", k, "ausente", `${ROTULO[k]}: não informado nos PDFs.`);

  for (const [k, valores] of Object.entries(divergencias(dados)))
    add("comum", k, "divergente", `${ROTULO[k] || "Tipo"} diferente entre os PDFs: ` + valores.map((v) => `${v.valor} (${v.origens.join(", ")})`).join(" × ") + ". Comparação pode estar desigual.");

  const segs = incluidas(dados);
  if (!segs.length) add("geral", "seguradoras", "ausente", "Inclua pelo menos uma seguradora no documento.");
  if (dados.recomendada && !segs.some((s) => s.id === dados.recomendada)) add("geral", "recomendada", "divergente", "A seguradora recomendada está fora do documento.");

  for (const s of segs) {
    const o = opcaoAtual(s); const texto = textos.get(s.fonte_id) || "";
    for (const [k, r] of OBRIG_SEG) if (!o[k]) add(s.id, k, "ausente", `${s.nome}: ${r} não encontrado.`);
    for (const [k, r] of DESEJ_SEG) if (!o[k]) add(s.id, k, "ausente", `${s.nome}: ${r} não informado.`);
    for (const k of MONETARIOS) {
      const v = o[k] || "";
      if (/\d/.test(v) && /R\$/.test(v) && !/R\$\s?\d{1,3}(\.\d{3})*,\d{2}/.test(v)) add(s.id, k, "divergente", `${s.nome}: formato monetário inválido (use R$ 1.234,56).`);
      else if (v && !noTexto(v, texto)) add(s.id, k, "divergente", `${s.nome}: valor ${v} não localizado no PDF. Confira.`);
    }
    const sel = (o.pagamentos || []).filter((p) => p.sel);
    if (!sel.length) add(s.id, "pagamentos", "ausente", `${s.nome}: nenhuma forma de pagamento marcada.`);
    for (const p of sel) {
      const n = Number(p.parcelas) || 1, vp = parseBRL(p.valor_parcela), tt = parseBRL(p.total), ve = parseBRL(p.valor_entrada);
      const calc = isNaN(ve) ? vp * n : ve + vp * (n - 1);
      if (!isNaN(vp) && !isNaN(tt) && Math.abs(calc - tt) > Math.max(1, tt * 0.005)) add(s.id, "pagamentos", "divergente", `${s.nome}: ${n}x ${p.valor_parcela} não fecha com o total ${p.total}.`);
      if (p.valor_parcela && !noTexto(p.valor_parcela, texto)) add(s.id, "pagamentos", "divergente", `${s.nome}: parcela ${p.valor_parcela} não localizada no PDF.`);
    }
    const nd = [["logo_marca", "logomarca"], ["pequenos_reparos", "pequenos reparos"], ["roda_pneu", "roda e pneu"]].filter(([k]) => o[k] == null).map(([, r]) => r);
    if (nd.length) add(s.id, "servicos", "ausente", `${s.nome}: ${nd.join(", ")} não mencionado no PDF. Confira.`);
    if (MARCADOR.test(JSON.stringify(o))) add(s.id, "marcador", "divergente", `${s.nome}: há um marcador de dado oculto num campo. Troque pelo valor real.`);
  }
  if (MARCADOR.test(JSON.stringify(c))) add("comum", "segurado", "divergente", "Há um marcador de dado oculto num campo do cliente. Troque pelo valor real.");
  return out;
}

export function pendenciasDe(lista, onde, campo) { return lista.find((p) => p.onde === onde && p.campo === campo); }
