// Leitura automática por regras: identifica a seguradora pelo layout e devolve os campos no contrato da extração.
import { allianz } from "./allianz.js";
import { hdi } from "./hdi.js";
import { bradesco, mapfre, suhai, tokio, zurich } from "./outras.js";
import { portoAntigo, portoAtual } from "./porto.js";
import { tokioProdutos } from "./tokio-produtos.js";
import { cobertura, faltantes, resgatar, rotulo } from "./resgate.js";
import { yelum } from "./yelum.js";

export const LEITORES = [portoAtual, portoAntigo, hdi, yelum, bradesco, mapfre, tokioProdutos, tokio, zurich, suhai, allianz];

/**
 * Regra do tipo: se o PDF traz classe de bônus maior que zero, seguradora anterior ou vencimento da apólice anterior,
 * é renovação, mesmo que a seguradora chame de "Novo Negócio" (cliente vindo de outra seguradora com bônus).
 * Ajusta `dados.tipo` e devolve o aviso ao consultor (ou "" se nada mudou).
 */
export function renovacao(dados) {
  if (!dados || dados.tipo === "RENOVACAO") return "";
  const motivos = [
    parseInt(dados.bonus, 10) > 0 ? `classe de bônus ${parseInt(dados.bonus, 10)}` : "",
    dados.seguradora_anterior ? "seguradora anterior" : "",
    dados.vencimento_anterior ? "vencimento da apólice anterior" : "",
  ].filter(Boolean);
  if (!motivos.length) return "";
  const antes = dados.tipo; dados.tipo = "RENOVACAO";
  return `Tipo marcado como renovação porque o PDF traz ${motivos.join(", ")}${antes === "NOVO" ? " (o PDF chama de seguro novo)" : ""}. Confira.`;
}

/**
 * @param doc { texto, linhas } de lerPdf.
 * @returns null se nenhum layout for reconhecido; senão { leitor, dados, parcial, faltam, recuperados, cobertura }.
 *   parcial = faltou campo essencial (preço, franquia, danos materiais, pagamentos, vigência, validade, segurado ou veículo).
 */
export function lerPorRegras(doc) {
  const leitor = LEITORES.find((l) => { try { return l.detecta(doc); } catch { return false; } });
  if (!leitor) return null;
  let dados;
  try { dados = leitor.ler(doc); } catch (e) { console.error(e); return { leitor, dados: null, parcial: true, faltam: ["erro no leitor"], recuperados: [], cobertura: { ok: 0, total: 1 } }; }
  const renova = renovacao(dados);
  const recuperados = resgatar(doc, dados);
  const faltam = faltantes(dados);
  dados.alertas = [
    `Lido automaticamente pelo leitor ${leitor.nome}.`,
    ...(recuperados.length ? [`Encontrado por rótulo alternativo, confira: ${recuperados.join(", ")}.`] : []),
    ...(faltam.length ? [`Não encontrado no PDF: ${faltam.map(rotulo).join(", ")}.`] : []),
    ...(renova ? [renova] : []),
    ...dados.alertas,
  ];
  return { leitor, dados, parcial: faltam.length > 0, faltam, recuperados, cobertura: cobertura(dados) };
}
