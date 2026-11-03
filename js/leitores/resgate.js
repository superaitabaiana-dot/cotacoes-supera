// Rede de segurança dos leitores: quando um campo vem vazio (rótulo renomeado, linha mudou de lugar),
// procura no texto todo pelas variações mais comuns do rótulo. O valor continua copiado do PDF e o campo
// recuperado é avisado ao consultor para conferência.
import { R, data, datas, sem } from "./base.js";

/** Variações de rótulo por campo. A primeira linha que casar e trouxer valor é usada. */
export const SINONIMOS = {
  premio_total: [/^(valor total|premio total(, com iof)?|total a pagar|total a vista( \(r\$\))?|premio final|valor do seguro|preco total)\b/i],
  franquia: [/^(franquia( do)? (casco|veiculo|basica)|veiculo:|casco:|indenizacao parcial)/i, /franquia[^\n]*(obrigatori|reduzid|facultativ|normal|basica)/i],
  danos_materiais: [/(rcf-?v?|rcfa|rcv|resp(\.|onsabilidade)? civil[^\n]*)\s*-?\s*danos materiais/i, /^danos materiais/i, /\bd\.m\.:/i],
  danos_corporais: [/(rcf-?v?|rcfa|rcv|resp(\.|onsabilidade)? civil[^\n]*)\s*-?\s*danos corporais/i, /^danos corporais/i, /\bd\.c\.:/i],
  danos_morais: [/danos morais/i, /\bd\. ?morais/i],
  app: [/(app|acidentes pessoais)[^\n]*(morte|passageiro)/i],
};

/** Primeiro valor em R$ que aparece DEPOIS do rótulo, na mesma linha; ignora linhas "não contratado". */
function valorApos(texto, re) {
  for (const linha of texto.split("\n")) {
    const l = sem(linha), m = l.match(re);
    if (!m || /nao contratad|nao possui/i.test(l)) continue;
    const v = R(linha.slice(m.index + m[0].length));
    if (v && v !== "R$ 0,00") return v;
  }
  return "";
}

/**
 * Preenche campos vazios pelos sinônimos. Só mexe em valores de cobertura quando a seguradora tem uma única opção
 * (com várias opções lado a lado não dá para saber de qual coluna é o valor).
 * @returns lista de campos recuperados, para o aviso ao consultor
 */
export function resgatar(doc, dados) {
  const t = doc.texto, recuperados = [];
  if (!dados.vigencia_inicio) {
    const m = sem(t).match(/vig[e]ncia[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) { dados.vigencia_inicio = data(m[1]); dados.vigencia_fim ||= data(m[2]); recuperados.push("vigência"); }
  }
  if (!dados.validade_cotacao && !dados.validade_dias) {
    const m = sem(t).match(/(validade|valid[ao] ate|valido ate)[^\n]*?(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) { dados.validade_cotacao = data(m[2]); recuperados.push("validade"); }
  }
  if (!dados.data_cotacao) {
    const m = sem(t).match(/(data da cotacao|data do calculo|realizado em|data:)\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (m) { dados.data_cotacao = data(m[2]); recuperados.push("data da cotação"); }
  }
  for (const s of dados.seguradoras) {
    if (s.opcoes.length !== 1) continue;
    const o = s.opcoes[0];
    for (const [campo, res] of Object.entries(SINONIMOS)) {
      if (o[campo] && o[campo] !== "NÃO CONTRATADO") continue;
      if (o[campo] === "NÃO CONTRATADO" && campo !== "premio_total") continue; // o leitor já viu "não contratado"
      for (const re of res) {
        const v = valorApos(t, re);
        if (v) { o[campo] = campo === "app" ? `${v} POR PASSAGEIRO` : v; recuperados.push(rotulo(campo)); break; }
      }
    }
  }
  return recuperados;
}

export const rotulo = (campo) => ({ premio_total: "preço total", franquia: "franquia", danos_materiais: "danos materiais", danos_corporais: "danos corporais",
  danos_morais: "danos morais", app: "APP", pagamentos: "formas de pagamento", vigencia_inicio: "vigência", segurado: "segurado", veiculo: "veículo",
  validade_cotacao: "validade", fipe: "FIPE", guincho: "assistência" })[campo] || campo;

/** Campos essenciais: sem eles a leitura é considerada parcial. */
export function faltantes(dados) {
  const f = [];
  for (const k of ["segurado", "veiculo", "vigencia_inicio"]) if (!dados[k]) f.push(k);
  if (!dados.validade_cotacao && !dados.validade_dias) f.push("validade_cotacao");
  for (const s of dados.seguradoras) for (const o of s.opcoes) {
    for (const k of ["premio_total", "franquia", "danos_materiais"]) if (!o[k] && !f.includes(k)) f.push(k);
    if (!o.pagamentos.length && !f.includes("pagamentos")) f.push("pagamentos");
  }
  return f;
}

/** Quantos dos campos medidos o leitor preencheu (para o registro de saúde dos leitores). */
export function cobertura(dados) {
  const comuns = ["segurado", "condutor", "cep", "veiculo", "vigencia_inicio", "vigencia_fim", "data_cotacao", "validade_cotacao", "tipo"];
  const porOpcao = ["premio_total", "franquia", "fipe", "danos_materiais", "danos_corporais", "guincho", "vidros"];
  let ok = 0, total = 0;
  for (const k of comuns) { total++; if (dados[k] || (k === "validade_cotacao" && dados.validade_dias)) ok++; }
  for (const s of dados.seguradoras) for (const o of s.opcoes) {
    for (const k of porOpcao) { total++; if (o[k]) ok++; }
    total++; if (o.pagamentos.length) ok++;
  }
  return { ok, total };
}
