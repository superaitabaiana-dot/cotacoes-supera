// Junta as leituras de vários PDFs (uma por seguradora, ou um multicálculo) numa única cotação para conferência.
import { addDays, brl, fmtDate, norm, parseBRL, parseDate, uid } from "./util.js";

/** Campos do cliente, veículo e vigência, comuns a todas as seguradoras. */
export const CAMPOS_COMUNS = [
  ["segurado", "Segurado"], ["condutor", "Condutor principal"], ["estado_civil", "Estado civil do condutor"],
  ["cep", "CEP de pernoite"], ["uso", "Uso"], ["veiculo", "Veículo"], ["placa", "Placa"], ["ano_modelo", "Ano/modelo"],
  ["valor_referencia", "Valor de referência (FIPE)"], ["seguradora_anterior", "Seguradora anterior"], ["bonus", "Classe de bônus"],
  ["vigencia_inicio", "Vigência de"], ["vigencia_fim", "Vigência até"], ["vencimento_anterior", "Vencimento da apólice atual"],
  ["data_cotacao", "Data da cotação"], ["validade_cotacao", "Validade da cotação"], ["cobertura_menor_25", "Condutor menor de 25 anos"],
];

/** Campos que precisam ser iguais em todos os PDFs: se diferirem, a comparação pode estar desigual. */
export const CAMPOS_CONSISTENCIA = ["segurado", "condutor", "cep", "placa", "uso", "tipo", "bonus", "valor_referencia", "vigencia_inicio", "vigencia_fim"];

/** Coberturas comparadas entre seguradoras, na ordem do documento. */
export const COBERTURAS = [
  ["franquia", "Franquia"], ["fipe", "FIPE"], ["danos_materiais", "Danos materiais"], ["danos_corporais", "Danos corporais"],
  ["danos_morais", "Danos morais"], ["app", "Acidentes pessoais (APP)"], ["vidros", "Vidros"], ["carro_reserva", "Carro reserva"],
  ["guincho", "Assistência e guincho"], ["outras_coberturas", "Outras coberturas"],
];
export const SERVICOS = [["logo_marca", "Logomarca"], ["pequenos_reparos", "Pequenos reparos"], ["roda_pneu", "Roda e pneu"]];

export function novaCotacao() {
  return { fonte: "seguradoras", comum: { tipo: "" }, seguradoras: [], fontes: [], recomendada: null, nota: "", validade_calculada: false };
}

/** Acrescenta a leitura de um PDF à cotação. `fonte` = { id, arquivo_nome, extracao, ocr? } (ocr: lido pela imagem). */
export function incorporar(dados, fonte) {
  const x = fonte.extracao || {};
  const valores = {};
  for (const [k] of CAMPOS_COMUNS) valores[k] = x[k] ?? "";
  valores.tipo = x.tipo ?? "";
  if (!valores.validade_cotacao && x.validade_dias && parseDate(x.data_cotacao)) {
    valores.validade_cotacao = fmtDate(addDays(parseDate(x.data_cotacao), Number(x.validade_dias)));
    valores._validade_calculada = true;
  }
  const nomes = (x.seguradoras || []).map((s) => s.seguradora).filter(Boolean);
  dados.fontes.push({ id: fonte.id, arquivo_nome: fonte.arquivo_nome, tipo_documento: x.tipo_documento || "SEGURADORA", alertas: x.alertas || [], valores, nomes, ...(fonte.ocr ? { ocr: true } : {}) });
  if (x.tipo_documento === "MULTICALCULO") dados.fonte = "segfy";

  for (const s of x.seguradoras || []) {
    dados.seguradoras.push({
      id: uid(), nome: s.seguradora || "Seguradora", numero: s.numero_cotacao || "", fonte_id: fonte.id,
      incluir: true, opcao: 0,
      opcoes: (s.opcoes?.length ? s.opcoes : [{}]).map((o) => ({ ...o, pagamentos: (o.pagamentos || []).map((p) => ({ ...p, sel: true })) })),
    });
  }
  recalcularComum(dados);
  return dados;
}

export function removerFonte(dados, fonteId) {
  dados.fontes = dados.fontes.filter((f) => f.id !== fonteId);
  dados.seguradoras = dados.seguradoras.filter((s) => s.fonte_id !== fonteId);
  if (dados.recomendada && !dados.seguradoras.some((s) => s.id === dados.recomendada)) dados.recomendada = null;
  dados.fonte = dados.fontes.some((f) => f.tipo_documento === "MULTICALCULO") ? "segfy" : "seguradoras";
  recalcularComum(dados, true);
}

/** Preenche os campos comuns com o primeiro valor encontrado; a validade é a mais curta entre os PDFs. */
export function recalcularComum(dados, refazer = false) {
  const c = dados.comum;
  for (const k of [...CAMPOS_COMUNS.map(([k]) => k), "tipo"]) {
    if (!refazer && c[k]) continue;
    if (k === "validade_cotacao") continue;
    c[k] = dados.fontes.map((f) => f.valores[k]).find((v) => v) || (refazer ? "" : c[k] || "");
  }
  if (refazer || !c.validade_cotacao) {
    const validas = dados.fontes.map((f) => ({ d: parseDate(f.valores.validade_cotacao), calc: f.valores._validade_calculada })).filter((v) => v.d);
    validas.sort((a, b) => a.d - b.d);
    c.validade_cotacao = validas[0] ? fmtDate(validas[0].d) : "";
    dados.validade_calculada = !!validas[0]?.calc;
  }
}

/** Para cada campo de consistência, os valores diferentes encontrados e de qual PDF vieram. */
export function divergencias(dados) {
  const out = {};
  if (dados.fontes.length < 2) return out;
  for (const k of CAMPOS_CONSISTENCIA) {
    const vistos = new Map();
    for (const f of dados.fontes) {
      const v = f.valores[k]; if (!v) continue;
      const chave = k === "valor_referencia" ? String(parseBRL(v)) : norm(v);
      if (!vistos.has(chave)) vistos.set(chave, { valor: v, origens: [] });
      vistos.get(chave).origens.push(f.nomes.join(", ") || f.arquivo_nome);
    }
    if (vistos.size > 1) out[k] = [...vistos.values()];
  }
  return out;
}

export const opcaoAtual = (s) => s.opcoes[s.opcao] || s.opcoes[0] || {};
export const incluidas = (dados) => dados.seguradoras.filter((s) => s.incluir);
export const preco = (s) => parseBRL(opcaoAtual(s).premio_total);

/** Seguradoras incluídas, da mais barata à mais cara (sem preço vão para o fim). */
export function ordenadas(dados) {
  return incluidas(dados).slice().sort((a, b) => (isNaN(preco(a)) ? Infinity : preco(a)) - (isNaN(preco(b)) ? Infinity : preco(b)));
}

export function tipoFranquia(f) {
  const t = norm(f);
  if (t.includes("reduzida")) return "reduzida";
  if (t.includes("majorada") || t.includes("ampliada")) return "majorada";
  if (t.includes("facultativa")) return "facultativa";
  if (t.includes("obrigatoria") || t.includes("normal") || t.includes("basica")) return "normal";
  return "";
}

/** Maior parcelamento sem juros entre os planos marcados, para a linha de destaque do preço. */
export function melhorParcelamento(op) {
  const sem = (op.pagamentos || []).filter((p) => p.sel && !p.juros && (+p.parcelas || 1) > 1)
    .sort((a, b) => (+b.parcelas || 1) - (+a.parcelas || 1))[0];
  if (!sem) return "";
  return sem.valor_parcela ? `${sem.parcelas}x de ${sem.valor_parcela} sem juros` : `em até ${sem.parcelas}x sem juros`;
}

export function textoPlano(p) {
  const n = Number(p.parcelas) || 1;
  if (n === 1) return `À VISTA ${p.valor_parcela || p.total}`;
  const v = p.valor_parcela ? ` ${p.valor_parcela}` : "";
  return `${n}X${v}${p.juros ? " COM JUROS" : " SEM JUROS"}${p.valor_entrada ? " (1ª " + p.valor_entrada + ")" : ""}`;
}

/** Uma linha por forma de pagamento, no formato usado no layout B. */
export function linhasPagamento(op) {
  const grupos = new Map();
  for (const p of (op.pagamentos || []).filter((p) => p.sel)) {
    const f = String(p.forma || "PAGAMENTO").toUpperCase().trim();
    if (!grupos.has(f)) grupos.set(f, []); grupos.get(f).push(p);
  }
  return [...grupos].map(([f, ps]) => f + ": " + ps.sort((a, b) => (+a.parcelas || 1) - (+b.parcelas || 1)).map(textoPlano).join(" · "));
}

export function textoServicos(op) {
  const sim = SERVICOS.filter(([k]) => op[k] === true).map(([, r]) => r);
  return sim.length ? sim.join(", ") : "Nenhum";
}

/** Coberturas iguais em todas as seguradoras incluídas e coberturas que mudam entre elas. */
export function compararCoberturas(dados) {
  const segs = ordenadas(dados);
  const iguais = [], diferentes = [];
  const lista = [...COBERTURAS, ["servicos", "Serviços inclusos"]];
  for (const [k, rotulo] of lista) {
    const valores = segs.map((s) => (k === "servicos" ? textoServicos(opcaoAtual(s)) : opcaoAtual(s)[k] || ""));
    if (valores.every((v) => !v)) continue;
    const distintos = new Set(valores.map((v) => (k.startsWith("danos") || k === "app" ? String(parseBRL(v)) + norm(v).replace(/[0-9]/g, "") : norm(v))));
    if (segs.length > 1 && distintos.size === 1 && k !== "franquia") iguais.push({ k, rotulo, valor: valores[0] });
    else diferentes.push({ k, rotulo, valores });
  }
  return { segs, iguais, diferentes };
}

/** Avisos de comparação desigual: não bloqueiam a emissão, mas o consultor deve saber. */
export function avisosComparacao(dados) {
  const segs = incluidas(dados);
  if (segs.length < 2) return [];
  const avisos = [];
  const tipos = new Map(segs.map((s) => [s.nome, tipoFranquia(opcaoAtual(s).franquia)]));
  if (new Set([...tipos.values()].filter(Boolean)).size > 1)
    avisos.push("Tipos de franquia diferentes: " + [...tipos].filter(([, t]) => t).map(([n, t]) => `${n} ${t}`).join(", ") + ".");
  const fipes = new Set(segs.map((s) => norm(opcaoAtual(s).fipe)).filter(Boolean));
  if (fipes.size > 1) avisos.push("O percentual da FIPE ou o valor determinado muda entre as seguradoras.");
  const semPreco = segs.filter((s) => isNaN(preco(s))).map((s) => s.nome);
  if (semPreco.length) avisos.push(`Sem preço total: ${semPreco.join(", ")}.`);
  return avisos;
}

/** Resumo gravado com cada versão, usado na lista de cotações. */
export function resumo(dados) {
  const segs = ordenadas(dados);
  const rec = dados.seguradoras.find((s) => s.id === dados.recomendada);
  const menor = segs.find((s) => !isNaN(preco(s)));
  return {
    cliente: dados.comum.segurado || "", placa: dados.comum.placa || "", veiculo: dados.comum.veiculo || "",
    seguradoras: segs.map((s) => s.nome),
    menor_preco: menor ? { seguradora: menor.nome, valor: brl(preco(menor)) } : null,
    recomendada: rec ? { seguradora: rec.nome, valor: opcaoAtual(rec).premio_total || "" } : null,
  };
}
