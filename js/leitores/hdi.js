// HDI ("Hdi Auto Perfil"): até duas opções lado a lado (valor de mercado referenciado e valor determinado).
import { R, achar, anoModelo, carroReserva, cep, colunaMaisProxima, data, dataExtenso, estadoCivil, extracao, franquia, guincho, opcao, resumirPagamentos, rotuloVidros, rx, servico, simNao, tipoSeguro, up, usoVeiculo, valores } from "./base.js";

const FORMAS = ["CARTÃO DE CRÉDITO", "DÉBITO EM CONTA", "CARNÊ"];

/** Tabela "Cartão de / Débito Em / Carnê" (uma trinca por opção) com pares "N x valor". */
function pagamentosHdi(doc, nOpcoes) {
  const iCab = achar(doc, /^Cartão de\s+Débito Em\s+Carnê/);
  if (iCab < 0) return [];
  const cols = doc.linhas[iCab].celulas;
  const porCol = cols.map(() => []);
  for (let i = iCab + 1; i < doc.linhas.length && !/^Assinatura/.test(doc.linhas[i].texto); i++) {
    const cs = doc.linhas[i].celulas;
    for (let k = 0; k < cs.length; k++) {
      const m = cs[k].s.match(/^(\d+)\s*x\s*([\d.]+,\d{2})?$/);
      if (!m) continue;
      const alvo = cs[k]; let v = m[2];
      if (!v && cs[k + 1] && /^[\d.]+,\d{2}$/.test(cs[k + 1].s.trim())) v = cs[++k].s.trim();
      if (v) porCol[colunaMaisProxima(alvo, cols)].push({ n: +m[1], parcela: v });
    }
  }
  return porCol.map((itens, c) => ({ opcao: Math.min(nOpcoes - 1, Math.floor(c / 3)), forma: FORMAS[c % 3], itens }));
}

export const hdi = {
  id: "hdi", nome: "HDI",
  detecta: (doc) => /HDI SEGUROS S\.A/.test(doc.texto) && /Garantias de Auto/.test(doc.texto),
  ler(doc) {
    const linha = (re) => doc.linhas.find((l) => re.test(l.texto))?.texto || "";
    const det = /Valor Determinado/i.test(linha(/^Garantias de Auto/));
    const nOp = det ? 2 : 1;
    // Em cada linha da tabela: descrição, depois LMI e prêmio de cada opção, e a franquia no fim (só no casco).
    const lmis = (re) => { const l = doc.linhas.find((x) => re.test(x.texto)); if (!l) return []; const cs = l.celulas.slice(1).map((c) => c.s); return [cs[0], cs[2]]; };
    const casco = doc.linhas.find((l) => /^CASCO/.test(l.texto));
    const frqValor = casco ? casco.celulas[casco.celulas.length - 1].s : "";
    const frqTipo = rx(doc, /Franquia:\s*(.+?)\s{2,}/);
    const totais = valores(linha(/^TOTAL À VISTA/));
    const vid = [linha(/AUTO VIDROS/i), linha(/FARÓIS, LANTERNAS|RETROV/i)].join(" ");
    const lmiVidros = /VIDRO/i.test(vid) ? rotuloVidros(vid) : "NÃO CONTRATADO";
    const assist = linha(/VIP AUTO|ASSIST/i).replace(/\(\*\d\).*/, ""); // a nota de rodapé fala do 2º guincho
    const cr = linha(/DIAS CR|CARRO RESERVA/i);
    const pagos = pagamentosHdi(doc, nOp);
    const opcoes = [];
    for (let k = 0; k < nOp; k++) {
      const app = lmis(/^APP MORTE/)[k];
      const morais = lmis(/^DANOS MORAIS/)[k];
      const o = opcao({
        nome: k === 0 ? "Valor de mercado referenciado" : "Valor determinado",
        fipe: k === 0 ? (casco ? up(casco.celulas[1]?.s).replace(/,00%/, "%").replace(/\s*FIPE/, "") : "") : `VALOR DETERMINADO ${R(casco?.celulas[3]?.s)}`,
        franquia: casco ? franquia(frqValor, frqTipo) : "NÃO SE APLICA",
        danos_materiais: R(lmis(/^RCF-V DANOS MATERIAIS/)[k]) || "NÃO CONTRATADO",
        danos_corporais: R(lmis(/^RCF-V DANOS CORPORAIS/)[k]) || "NÃO CONTRATADO",
        danos_morais: R(morais) && morais !== "0,00" ? R(morais) : "NÃO CONTRATADO",
        app: R(app) && app !== "0,00" ? `${R(app)} POR PASSAGEIRO` : "NÃO CONTRATADO",
        guincho: guincho(assist) || "NÃO CONTRATADO",
        carro_reserva: carroReserva(cr) || "NÃO",
        vidros: lmiVidros,
        logo_marca: servico(doc.texto, /LOGOMARCA|LOGO MARCA/i),
        pequenos_reparos: servico(doc.texto, /MARTELINHO|REPARO RAPIDO|PARA-?CHOQUE|ARRANH/i),
        roda_pneu: servico(doc.texto, /RODAS?,? PNEUS?/i),
        premio_total: R(totais[k]),
      });
      for (const p of pagos.filter((p) => p.opcao === k)) o.pagamentos.push(...resumirPagamentos(p.forma, p.itens, o.premio_total));
      opcoes.push(o);
    }
    const vig = doc.texto.match(/DIA (\d\d\/\d\d\/\d{4}) ÀS 24 HS DO DIA (\d\d\/\d\d\/\d{4})/);
    return extracao({
      segurado: up(rx(doc, /Proponente:\s*(.+?)\s{2,}/)),
      condutor: up(rx(doc, /Nome do Condutor:\s*(.+)/)),
      estado_civil: estadoCivil(rx(doc, /^Estado Civil\s+(.+)$/m)),
      cep: cep(rx(doc, /CEP Pernoite:\s*(\d+)/)),
      uso: usoVeiculo(rx(doc, /Utilizacao do Veiculo\s+(.+)/i)),
      tipo: tipoSeguro(doc.linhas.slice(0, 10).map((l) => l.texto).join(" ")),
      seguradora_anterior: up(rx(doc, /Companhia Anterior:\s*(.+?)\s{2,}/)),
      bonus: String(parseInt(rx(doc, /Classe Bônus:\s*(\d+)/), 10) || ""),
      vencimento_anterior: data(rx(doc, /Fim da Vig\. Anterior:\s*(\S+)/)),
      veiculo: up(rx(doc, /Veículo:\s*\d+\s*-\s*(.+?)\s*\(FIPE/)),
      ano_modelo: anoModelo(rx(doc, /Ano\/Modelo:\s*(\S+)/)),
      vigencia_inicio: vig?.[1] || "", vigencia_fim: vig?.[2] || "",
      data_cotacao: dataExtenso(rx(doc, /^[A-ZÀ-Ú ]+,\s*(\d{1,2} DE .+ DE \d{4})/m)),
      validade_cotacao: data(rx(doc, /V[ÁA]LIDA AT[ÉE] (\d\d\/\d\d\/\d{4})/i)),
      cobertura_menor_25: simNao(rx(doc, /Cob Demais Condutores Resid entre 18 Até 25 Anos\s+(\S+)/i)),
      seguradoras: [{ seguradora: "HDI", numero_cotacao: rx(doc, /Cálculo - (\d+)/), opcoes }],
    });
  },
};
