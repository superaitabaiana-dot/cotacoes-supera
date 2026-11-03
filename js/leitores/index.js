// Leitura automática por regras: identifica a seguradora pelo layout e devolve os campos no contrato da extração.
import { allianz } from "./allianz.js";
import { hdi } from "./hdi.js";
import { bradesco, mapfre, suhai, tokio, zurich } from "./outras.js";
import { portoAntigo, portoAtual } from "./porto.js";
import { cobertura, faltantes, resgatar, rotulo } from "./resgate.js";
import { yelum } from "./yelum.js";

export const LEITORES = [portoAtual, portoAntigo, hdi, yelum, bradesco, mapfre, tokio, zurich, suhai, allianz];

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
  const recuperados = resgatar(doc, dados);
  const faltam = faltantes(dados);
  dados.alertas = [
    `Lido automaticamente pelo leitor ${leitor.nome}.`,
    ...(recuperados.length ? [`Encontrado por rótulo alternativo, confira: ${recuperados.join(", ")}.`] : []),
    ...(faltam.length ? [`Não encontrado no PDF: ${faltam.map(rotulo).join(", ")}.`] : []),
    ...dados.alertas,
  ];
  return { leitor, dados, parcial: faltam.length > 0, faltam, recuperados, cobertura: cobertura(dados) };
}
