// Ferramentas comuns aos leitores por seguradora. Tudo roda no navegador, sem IA.
// Regra de ouro: todo valor devolvido é copiado do texto do PDF. A única conta feita é para
// classificar parcelamento com ou sem juros quando o PDF não diz (parcela × quantidade contra o preço total).

export const DINHEIRO = /\d{1,3}(?:\.\d{3})*,\d{2}/;
const DINHEIRO_G = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const DATA = /\b\d{1,2}\/\d{1,2}\/\d{4}\b/;
const MESES = ["JANEIRO","FEVEREIRO","MARÇO","ABRIL","MAIO","JUNHO","JULHO","AGOSTO","SETEMBRO","OUTUBRO","NOVEMBRO","DEZEMBRO"];

export const sem = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
export const up = (s) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

/** "1.234,56" ou "R$ 1.234,56" → "R$ 1.234,56"; sem valor → "". */
export function R(s) { const m = String(s || "").match(DINHEIRO); return m ? "R$ " + m[0] : ""; }
export function valores(s) { return String(s || "").match(DINHEIRO_G) || []; }
export function num(s) { const m = String(s || "").match(DINHEIRO); return m ? parseFloat(m[0].replace(/\./g, "").replace(",", ".")) : NaN; }
export function data(s) {
  const m = String(s || "").match(DATA); if (!m) return "";
  const [d, mo, a] = m[0].split("/"); return `${d.padStart(2, "0")}/${mo.padStart(2, "0")}/${a}`;
}
export function datas(s) { return (String(s || "").match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g) || []).map(data); }
/** "11 DE AGOSTO DE 2026" → "11/08/2026" */
export function dataExtenso(s) {
  const m = up(sem(s)).match(/(\d{1,2}) DE ([A-Z]+) DE (\d{4})/); if (!m) return "";
  const i = MESES.map(sem).indexOf(m[2]); return i < 0 ? "" : `${m[1].padStart(2, "0")}/${String(i + 1).padStart(2, "0")}/${m[3]}`;
}
export function cep(s) { const m = String(s || "").match(/\b(\d{5})-?(\d{3})\b/); return m ? `${m[1]}-${m[2]}` : ""; }
export function placa(s) { const m = String(s || "").toUpperCase().match(/\b([A-Z]{3})-?(\d[A-Z0-9]\d{2})\b/); return m ? m[1] + m[2] : ""; }
export function anoModelo(s) { const m = String(s || "").match(/\b(\d{4})\s*\/\s*(\d{4})\b/); return m ? `${m[1]}/${m[2]}` : ""; }
/** "100.00%", "100,00%" → "100%" */
export function pct(s) { const m = String(s || "").match(/(\d{1,3}(?:[.,]\d+)?)\s*%/); return m ? `${parseFloat(m[1].replace(",", "."))}%` : ""; }

export function tipoSeguro(s) {
  const t = up(sem(s));
  if (/RENOV/.test(t)) return "RENOVACAO";
  if (/NOVO/.test(t)) return "NOVO";
  return "";
}
export function simNao(s) { const t = up(sem(s)); return /^(S|SIM)\b/.test(t) ? "SIM" : /^(N|NAO)\b/.test(t) ? "NÃO" : ""; }
export function usoVeiculo(s) {
  const t = up(sem(s)); if (!t) return "";
  return /COMERC|PRESTAC|APLICATIVO|TAXI|FRETE|REPRESENT/.test(t) && !/SEM FINALIDADE COMERCIAL/.test(t) ? "COMERCIAL" : "PARTICULAR";
}
export function estadoCivil(s) {
  const t = up(sem(s)); if (!t) return "";
  if (/CASAD|UNIAO|UNIAO ESTAVEL|^C\b/.test(t)) return "CASADO(A)";
  if (/SOLTEIR/.test(t)) return "SOLTEIRO(A)";
  if (/DIVORC|SEPARAD/.test(t)) return "DIVORCIADO(A)/SEPARADO(A)";
  if (/VIUV/.test(t)) return "VIÚVO(A)";
  return up(s);
}

/** Rótulo curto da cobertura de vidros a partir da descrição do PDF. */
export function rotuloVidros(s) {
  const t = up(sem(s));
  if (!t || /NAO CONTRATAD|NAO POSSUI/.test(t)) return "NÃO CONTRATADO";
  const ret = /RETROV/.test(t), luz = /FAROI|FAROL|LANTERN/.test(t);
  if (/COMPLET|TOP|SUPERIOR|PLUS/.test(t) || (ret && luz)) return "COMPLETA";
  if (ret) return "VIDROS + RETROVISORES";
  return "SÓ VIDROS";
}
/** Limite do guincho: "300 KM", "ILIMITADO" ou "" */
export function guincho(s) {
  const t = up(sem(s)); if (!t) return "";
  if (/SEM LIMITE|ILIMITAD/.test(t) && !/\d+\s*KM/.test(t)) return "SEM LIMITE DE KM";
  const m = t.match(/(\d+)\s*KM/); return m ? `${m[1]} KM` : "";
}
/** "CARRO RESERVA PORTE BÁSICO - 7 DIAS" → "7 DIAS BÁSICO" */
export function carroReserva(s) {
  const t = up(s); const m = sem(t).match(/(\d+)\s*(DIAS|DIARIAS)/); if (!m) return "";
  const porte = sem(t).match(/BASICO|INTERMEDIARIO|EXECUTIVO|SUPERIOR|ESPECIAL|PREMIUM/);
  const nome = porte ? { BASICO: "BÁSICO", INTERMEDIARIO: "INTERMEDIÁRIO" }[porte[0]] || porte[0] : "";
  return `${m[1]} DIAS${nome ? " " + nome : ""}`;
}
/** Franquia no formato da v5: "R$ 2.874,00 (25% DA OBRIGATÓRIA)", até 32 caracteres. */
export function franquia(valor, tipo = "") {
  const v = R(valor); if (!v) return "";
  const t = up(tipo).replace(/^\(|\)$/g, "").replace(/(\d+)\s+DA\b/, "$1% DA").replace(/%%/g, "%");
  for (const tt of [t, t.replace("OBRIGATÓRIA", "OBRIG.").replace("FACULTATIVA", "FACULT.")]) {
    const out = tt ? `${v} (${tt})` : v;
    if (out.length <= 32) return out;
  }
  return v;
}

// ---------- Documento: linhas e células ----------
export function linhas(doc) { return doc.linhas; }
/** Índice da primeira linha (a partir de `de`) cujo texto casa com a expressão. */
export function achar(doc, re, de = 0) { for (let i = Math.max(0, de); i < doc.linhas.length; i++) if (re.test(doc.linhas[i].texto)) return i; return -1; }
/** Linha `n` posições depois da primeira que casa com `re` (o cabeçalho de um bloco). */
export function depois(doc, re, n = 1, de = 0) { const i = achar(doc, re, de); return i < 0 ? null : doc.linhas[i + n] || null; }
export function cel(linha, i) { return linha?.celulas?.[i]?.s?.trim() ?? ""; }
/** Grupo 1 da expressão aplicada ao texto todo. */
export function rx(doc, re) { const m = doc.texto.match(re); return m ? (m[1] ?? m[0]).trim() : ""; }

/** Associa cada célula à coluna de cabeçalho mais próxima pelo centro horizontal. */
export function colunaMaisProxima(celula, colunas) {
  const c = (celula.x + celula.x2) / 2; let melhor = 0, dist = Infinity;
  colunas.forEach((col, i) => { const d = Math.abs((col.x + col.x2) / 2 - c); if (d < dist) { dist = d; melhor = i; } });
  return melhor;
}

/**
 * Trechos de uma linha que casam com `re` (global), cada um com o centro horizontal estimado pela posição
 * do trecho dentro da célula. Serve para tabelas em que o PDF funde células vizinhas ("421,49 150.000,00").
 */
export function tokensComX(linha, re) {
  const out = [];
  for (const c of linha?.celulas || []) {
    const larg = (c.x2 - c.x) / Math.max(1, c.s.length);
    for (const m of c.s.matchAll(re)) out.push({ s: m[0], cx: c.x + larg * (m.index + m[0].length / 2) });
  }
  return out;
}
/**
 * Valor embaixo de um rótulo, em quadros "rótulos numa linha, valores na seguinte", alinhados à esquerda.
 * Cada palavra da linha de valores vai para o último rótulo que começa à esquerda dela, então o resultado não
 * depende de como as células foram separadas (o OCR às vezes funde "2202   49037" numa célula só).
 * @param reCab linha de rótulos; @param reRotulo rótulo da coluna desejada
 */
export function abaixo(doc, reCab, reRotulo) {
  const i = achar(doc, reCab); if (i < 0 || !doc.linhas[i + 1]) return "";
  const cab = doc.linhas[i].celulas, k = cab.findIndex((c) => reRotulo.test(c.s)); if (k < 0) return "";
  const out = [];
  for (const c of doc.linhas[i + 1].celulas) {
    const larg = (c.x2 - c.x) / Math.max(1, c.s.length);
    for (const m of c.s.matchAll(/\S+/g)) {
      const x = c.x + larg * m.index; let col = 0;
      cab.forEach((h, j) => { if (h.x <= x + 4) col = j; });
      if (col === k) out.push(m[0]);
    }
  }
  return out.join(" ");
}
/** Índice do centro mais próximo de `cx`. */
export function maisProximo(cx, centros) {
  let m = 0; centros.forEach((c, k) => { if (Math.abs(c - cx) < Math.abs(centros[m] - cx)) m = k; }); return m;
}

// ---------- Resultado no contrato da extração ----------
export function opcao(o = {}) {
  return { nome: "", fipe: "", franquia: "", danos_materiais: "", danos_corporais: "", danos_morais: "", app: "", guincho: "", carro_reserva: "", vidros: "",
    logo_marca: null, pequenos_reparos: null, roda_pneu: null, outras_coberturas: "", premio_total: "", pagamentos: [], ...o };
}
export function extracao(o = {}) {
  return { tipo_documento: "SEGURADORA", segurado: "", condutor: "", estado_civil: "", cep: "", uso: "", tipo: "", seguradora_anterior: "", bonus: "",
    vencimento_anterior: "", veiculo: "", placa: "", ano_modelo: "", valor_referencia: "", vigencia_inicio: "", vigencia_fim: "", data_cotacao: "",
    validade_cotacao: "", validade_dias: null, cobertura_menor_25: "", seguradoras: [], alertas: [], ...o };
}

/**
 * Reduz a tabela de parcelamento de uma forma de pagamento a até 3 linhas (como na v5):
 * à vista, maior parcelamento sem juros e maior parcelamento no total, se tiver juros.
 * @param itens [{ n, parcela, total?, entrada?, juros? }] com valores copiados do PDF
 */
export function resumirPagamentos(forma, itens, premioTotal) {
  const p = num(premioTotal);
  const lista = itens.filter((i) => i.n >= 1 && R(i.parcela)).map((i) => {
    let juros = i.juros;
    if (juros === undefined) {
      const tot = i.total ? num(i.total) : i.entrada ? num(i.entrada) + num(i.parcela) * (i.n - 1) : num(i.parcela) * i.n;
      juros = !isNaN(p) && tot > p * 1.005 + 1;
    }
    return { ...i, juros };
  });
  const avista = lista.find((i) => i.n === 1);
  const semJ = lista.filter((i) => !i.juros && i.n > 1).sort((a, b) => b.n - a.n)[0];
  const comJ = lista.filter((i) => i.juros).sort((a, b) => b.n - a.n)[0];
  const escolhidos = [avista, semJ, comJ && (!semJ || comJ.n > semJ.n) ? comJ : null].filter(Boolean);
  return escolhidos.map((i) => ({ forma, parcelas: i.n, valor_parcela: R(i.parcela), valor_entrada: i.entrada ? R(i.entrada) : "", total: i.total ? R(i.total) : "", juros: !!i.juros }));
}

/** Serviço citado no trecho: true se contratado, false se marcado como não contratado/não possui, null se ausente. */
export function servico(trecho, re) {
  const ls = String(trecho || "").split("\n").filter((l) => re.test(sem(l)));
  if (!ls.length) return null;
  return ls.some((l) => !/NAO CONTRATAD|NAO POSSUI|: 0,00/i.test(up(sem(l))));
}
