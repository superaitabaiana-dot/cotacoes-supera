// Yelum e Aliro (mesmo modelo de cotação, emitido pela Yelum).
import { R, abaixo, achar, anoModelo, carroReserva, cel, colunaMaisProxima, data, datas, depois, estadoCivil, extracao, franquia, guincho, opcao, pct, placa, resumirPagamentos, rotuloVidros, rx, sem, servico, simNao, up, usoVeiculo, valores } from "./base.js";

function pagamentosYelum(doc, premio) {
  const iFormas = achar(doc, /^CARNÊ\s+DÉBITO/i);
  if (iFormas < 0) return [];
  const nomes = doc.linhas[iFormas].celulas.map((c) => up(c.s));
  const cols = doc.linhas[iFormas + 1].celulas.slice(1); // "Valor das Parcelas (R$)" de cada forma
  const porCol = nomes.map(() => []);
  for (let i = iFormas + 2; i < doc.linhas.length; i++) {
    const l = doc.linhas[i];
    const m = l.texto.match(/^([ÀA] vista|1\s*\+\s*(\d+))\s/i); // "A vista": o OCR às vezes perde o acento
    if (!m) break;
    const n = m[2] ? 1 + Number(m[2]) : 1;
    for (const c of l.celulas.slice(1)) for (const v of valores(c.s)) porCol[colunaMaisProxima(c, cols)].push({ n, parcela: v });
  }
  return nomes.flatMap((f, k) => resumirPagamentos(f, porCol[k], premio));
}

export const yelum = {
  id: "yelum", nome: "Yelum / Aliro",
  detecta: (doc) => /YELUM AUTO|ALIRO SEGURO AUTO|Yelum Seguros S\.A/.test(doc.texto) && /DADOS DO SEGURO\/COBERTURA/.test(doc.texto),
  ler(doc) {
    const seguradora = /ALIRO/.test(doc.linhas[1]?.texto || doc.texto.slice(0, 200)) ? "Aliro" : "Yelum";
    const linha = (re) => doc.linhas.find((l) => re.test(l.texto))?.texto || "";
    const cab = depois(doc, /^Cotação Nº\s+Vigência/);
    const vig = datas(cab?.texto);
    const prem = valores(depois(doc, /^Prêmio Líquido \(R\$\)/)?.texto);
    const premio = R(prem[prem.length - 2]);
    // Quadros "rótulos / valores": pela posição embaixo do rótulo (resiste a células fundidas pelo OCR).
    const VEIC = /^Código FIPE\s+Marca\/Tipo/, CAT = /^Capacidade\s+Categoria/;
    const casco = linha(/^BASICA/);
    const vs = valores(casco);
    const morais = linha(/DANOS MORAIS/);
    const app = linha(/ACIDENTES PESSOAIS PASSAGEIROS/);
    const assist = linha(/^ASSISTENCIA/i);
    const vid = linha(/^VIDROS/i);
    const info = doc.texto.slice(doc.texto.indexOf("INFORMAÇÕES COMPLEMENTARES"));
    const bonus = depois(doc, /^Classe de Bônus\s+Renova/);
    const perfil = depois(doc, /^Nome do Principal Condutor\s+Estado Civil/);
    const res = depois(doc, /^Residente 18\/24/);
    const o = opcao({
      nome: /VMR|MERCADO/i.test(casco) ? "Valor de mercado" : "Valor determinado",
      fipe: pct(casco),
      franquia: casco ? franquia(vs[vs.length - 1], (abaixo(doc, CAT, /Tipo de Franquia/i).match(/[A-ZÇÃÉ]{4,}/i) || [""])[0]) : "NÃO SE APLICA",
      danos_materiais: R(linha(/DANOS MATERIAIS/)) || "NÃO CONTRATADO",
      danos_corporais: R(linha(/DANOS CORPORAIS/)) || "NÃO CONTRATADO",
      danos_morais: R(morais) && R(morais) !== "R$ 0,00" ? R(morais) : "NÃO CONTRATADO",
      app: R(app) && R(app) !== "R$ 0,00" ? `${R(app)} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: guincho(assist) || (assist ? up(assist.split("   ")[0].replace(/^ASSISTENCIA\s*-\s*/i, "ASSISTÊNCIA ")) : "NÃO CONTRATADO"),
      carro_reserva: carroReserva(linha(/CARRO RESERVA/i)) || "NÃO",
      vidros: vid ? rotuloVidros(vid + " " + (info.match(/\nVIDROS[\s\S]*?(?=prestador|\nASSIST|\nATENÇÃO)/)?.[0] || "")) : "NÃO CONTRATADO",
      logo_marca: servico(info, /LOGOMARCA|LOGO MARCA/i),
      pequenos_reparos: servico(info, /MARTELINHO|PARA-?CHOQUE|ARRANH/i),
      roda_pneu: servico(doc.texto, /RODAS?,? PNEUS?/i),
      premio_total: premio,
    });
    o.pagamentos = pagamentosYelum(doc, premio);
    const renova = /\d/.test(cel(bonus, 1));
    const antes = bonus ? datas([bonus.texto, doc.linhas[doc.linhas.indexOf(bonus) + 1]?.texto].join(" ")) : [];
    const cia = sem(bonus?.texto || "").match(/\(\d+\)\s*([A-Z][A-Z \/]+?)\s*(?:S\.A\.|\(|\s{2,}|$)/); // "BRADESCO AUTO/RE"
    const cepPdf = abaixo(doc, CAT, /CEP/i);
    return extracao({
      alertas: /^\d{5}-\d{3}$/.test(cepPdf) ? [] : [`O PDF traz o CEP de pernoite incompleto (${cepPdf}). Complete com o CEP do cliente.`],
      segurado: cel(depois(doc, /^Nome do Segurado/), 0),
      condutor: cel(perfil, 0), estado_civil: estadoCivil(abaixo(doc, /^Nome do Principal Condutor\s+Estado Civil/, /Estado Civil/i)),
      cep: cepPdf, uso: usoVeiculo(cel(depois(doc, /^Utilização\s+Antifurto/) || depois(doc, /^Uti\S*\s.*Isen/), 0)), // 2º: rótulo truncado pelo OCR
      tipo: renova ? "RENOVACAO" : "NOVO", bonus: cel(bonus, 0),
      seguradora_anterior: renova && cia ? up(cia[1]) : "",
      vencimento_anterior: renova ? antes[1] || "" : "",
      veiculo: up(abaixo(doc, VEIC, /Marca\/Tipo/i)), placa: placa(abaixo(doc, VEIC, /^Placa/i)), ano_modelo: anoModelo(abaixo(doc, VEIC, /Ano Fabrica/i)),
      vigencia_inicio: vig[0] || "", vigencia_fim: vig[1] || "",
      data_cotacao: data(rx(doc, /Atualizado por:.*?-\s*(\d{1,2}\/\d{1,2}\/\d{4})/)),
      validade_cotacao: data(rx(doc, /validade até o dia\s+(\d{1,2}\/\d{1,2}\/\d{4})/)),
      cobertura_menor_25: simNao(cel(res, 0)),
      seguradoras: [{ seguradora, numero_cotacao: cel(cab, 0), opcoes: [o] }],
    });
  },
};
