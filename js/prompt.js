// Pedido de leitura para colar no claude.ai (reserva para seguradoras sem leitor automático).
// Mesmas regras de supabase/functions/extrair/contrato.ts; ao mudar uma, mude a outra.
import { extracao, opcao } from "./leitores/base.js";
import { fmtDate } from "./util.js";

const MODELO = JSON.stringify({
  ...extracao(), tipo_documento: "SEGURADORA|MULTICALCULO|OUTRO", tipo: "NOVO|RENOVACAO|", cobertura_menor_25: "SIM|NÃO|",
  seguradoras: [{ seguradora: "", numero_cotacao: "", opcoes: [{ ...opcao(), pagamentos: [{ forma: "", parcelas: 1, valor_parcela: "", valor_entrada: "", total: "", juros: false }] }] }],
});

const REGRAS = `Você é o assistente de backoffice da Supera Seguros, uma corretora brasileira. Abaixo está o TEXTO extraído de um PDF de cotação de seguro auto (ou moto). Pode ser de uma única seguradora ou um comparativo de multicálculo (Segfy, Agger) com várias. Dados pessoais foram trocados por marcadores como [CPF]; não tente reconstruí-los.

Extraia os campos com FIDELIDADE ABSOLUTA ao documento. É melhor deixar um campo vazio do que adivinhar.
- Nunca invente, estime ou calcule valores. Todo valor em R$ precisa aparecer no texto. Campo ausente: "" (ou null nos serviços).
- Valores no formato "R$ 1.234,56", com os dígitos exatamente como no documento. Datas em dd/mm/aaaa (transcreva datas por extenso).
- "seguradoras": uma entrada por seguradora do documento. "opcoes": um item para cada opção apresentada (franquia normal x reduzida, valor de mercado x determinado, pacotes).
- "fipe": percentual (ex.: "100%"); valor determinado: "VALOR DETERMINADO R$ x"; sem casco: descreva (ex.: "100% (SÓ ROUBO/FURTO)").
- "franquia": até 32 caracteres, valor e tipo (ex.: "R$ 2.874,00 (REDUZIDA)"); sem casco: "NÃO SE APLICA".
- Danos materiais, corporais e morais, APP ("R$ x POR PASSAGEIRO"), guincho ("300 KM", "SEM LIMITE DE KM"), carro reserva ("7 DIAS BÁSICO"): se não contratado, "NÃO CONTRATADO" (carro reserva: "NÃO").
- "vidros": rótulo de até 25 caracteres ("COMPLETA", "SÓ VIDROS", "VIDROS + RETROVISORES", "NÃO CONTRATADO").
- "logo_marca", "pequenos_reparos" (martelinho, para-choque, arranhões), "roda_pneu": true se contratado, false se não contratado, null se não mencionado.
- "outras_coberturas": só o que não cabe em outro campo, por extenso, sem siglas, até 80 caracteres.
- "premio_total": prêmio total com IOF, à vista.
- "pagamentos": para cada forma de pagamento, até 3 linhas: à vista, maior parcelamento sem juros e maior parcelamento com juros. "parcelas" inteiro; primeira parcela diferente vai em "valor_entrada".
- "estado_civil": do principal condutor. "tipo": "NOVO" ou "RENOVACAO". "validade_cotacao": data; se só houver prazo em dias, deixe "" e preencha "validade_dias".
- "alertas": até 5 pontos que o consultor deve conferir.

Responda SOMENTE com um JSON neste formato, sem texto antes ou depois:`;

export function montarPrompt(textoMascarado) {
  return `${REGRAS}\n${MODELO}\n\nData de hoje: ${fmtDate(new Date())}.\n\nTEXTO DA COTAÇÃO:\n"""\n${textoMascarado}\n"""`;
}

/** Lê a resposta colada do Claude e completa os campos que faltarem com vazio. */
export function lerResposta(texto) {
  const t = String(texto || "");
  const ini = t.indexOf("{"), fim = t.lastIndexOf("}");
  if (ini < 0 || fim <= ini) throw new Error("Não encontrei o JSON na resposta. Copie a resposta inteira do Claude.");
  let d;
  try { d = JSON.parse(t.slice(ini, fim + 1)); } catch { throw new Error("A resposta veio incompleta ou com texto misturado. Peça ao Claude para responder só com o JSON e cole de novo."); }
  if (!Array.isArray(d.seguradoras) || !d.seguradoras.length) throw new Error("A resposta não trouxe nenhuma seguradora.");
  const out = extracao(d);
  out.seguradoras = d.seguradoras.map((s) => ({ seguradora: s.seguradora || "Seguradora", numero_cotacao: s.numero_cotacao || "",
    opcoes: (s.opcoes?.length ? s.opcoes : [{}]).map((o) => opcao({ ...o, pagamentos: Array.isArray(o.pagamentos) ? o.pagamentos : [] })) }));
  out.alertas = ["Lido pelo Claude a partir do texto colado.", ...(Array.isArray(d.alertas) ? d.alertas : [])];
  return out;
}
