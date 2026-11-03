// Allianz Auto: "DETALHES DAS OFERTAS" com várias ofertas (Roubo e Furto, Básico, Ampliado, Completo, Master, Exclusivo),
// em blocos de 3 colunas "Limite Máximo de Indenização | Preço por Cobertura", e parcelamento numa tabela por forma
// de pagamento com uma coluna por oferta.
import { R, achar, carroReserva, cep, data, dataExtenso, estadoCivil, extracao, franquia, guincho, maisProximo, opcao, pct, placa, resumirPagamentos, rotuloVidros, rx, servico, simNao, tipoSeguro, tokensComX, up, usoVeiculo } from "./base.js";

const TOK = /Não Contratado|Km Livre|\d+% FIPE|Plano \d+|[\d.]+,\d{2}|(?<=\s|^)-(?=\s|$)/gi;
const nomeOferta = (s) => String(s || "").replace(/\s*\*+\s*$/, "").trim();

/** Blocos de ofertas: nomes na linha acima de "Coberturas  Limite", linhas até "Preço Total". */
function blocosDeOfertas(doc) {
  const blocos = [];
  doc.linhas.forEach((l, i) => {
    if (!/^Coberturas\s+Limite/.test(l.texto) || i === 0) return;
    const cab = doc.linhas[i - 1].celulas;
    let fim = i + 1; while (fim < doc.linhas.length && !/^Preço Total/.test(doc.linhas[fim].texto)) fim++;
    blocos.push({ nomes: cab.map((c) => c.s), centros: cab.map((c) => (c.x + c.x2) / 2), linhas: doc.linhas.slice(i + 1, fim + 1) });
  });
  return blocos;
}

export const allianz = {
  id: "allianz", nome: "Allianz",
  detecta: (doc) => /ALLIANZ/i.test(doc.texto) && /DETALHES DAS OFERTAS/.test(doc.texto),
  ler(doc) {
    // Franquia: quadro único "Franquia | Valor (R$)" (a mesma para as ofertas com casco compreensivo).
    const iFr = achar(doc, /^Franquia\s+Valor \(R\$\)/);
    const lFr = iFr >= 0 ? doc.linhas[iFr + 1] : null;
    const frq = lFr && R(lFr.texto) ? franquia(lFr.celulas.at(-1).s, lFr.celulas[0].s) : "";
    const iCR = achar(doc, /^Modelo\s+Quantidade de Diárias/);
    const crTexto = iCR >= 0 ? doc.linhas[iCR + 1]?.texto || "" : "";

    const opcoes = [];
    for (const b of blocosDeOfertas(doc)) {
      // Cada valor vai para a oferta de centro mais próximo; em cada oferta, 1º = limite, 2º = preço da cobertura.
      const linha = (re, n = 0) => { const k = b.linhas.findIndex((x) => re.test(x.texto)); return k < 0 ? null : b.linhas[k + n]; };
      const porCol = (l) => { const r = b.nomes.map(() => []); for (const t of tokensComX(l, TOK)) if (t.cx > b.centros[0] - 80) r[maisProximo(t.cx, b.centros)].push(t.s); return r; };
      // Células inteiras (carro reserva e guincho podem trazer texto livre, como "7 Diárias Básico").
      const porCel = (l) => { const r = b.nomes.map(() => []); for (const c of l?.celulas || []) { const cx = (c.x + c.x2) / 2; if (c.x > b.centros[0] - 80) r[maisProximo(cx, b.centros)].push(c.s); } return r; };
      const casco = porCol(linha(/^Casco/, 1)), dm = porCol(linha(/Danos Materiais/)), dc = porCol(linha(/Danos Corporais/)), mo = porCol(linha(/Danos Morais/));
      const app = porCol(linha(/^APP\W+Morte/)), def = porCol(linha(/Gastos com Defesa/));
      const vid = porCol(linha(/^Vidros, lanternas/, 1)), cr = porCel(linha(/^Tipo de Carro Reserva/)), gu = porCel(linha(/^Guincho/));
      const as = porCol(linha(/^Assistência 24/)), tot = porCol(linha(/^Preço Total/));
      const lim = (toks) => (toks?.[0] && /,\d{2}$/.test(toks[0]) ? R(toks[0]) : "");
      const nao = (t) => !t || /Não Contratado|^-$/i.test(t);
      b.nomes.forEach((nomeBruto, k) => {
        const soRoubo = /\*\s*$/.test(nomeBruto); // nota "*": vale só para roubo, furto ou incêndio total
        const fipe = pct(casco[k]?.find((t) => /FIPE/i.test(t)));
        const g = gu[k]?.[0];
        opcoes.push(opcao({
          nome: up(nomeOferta(nomeBruto)),
          fipe: fipe ? (soRoubo ? `${fipe} (SÓ ROUBO/FURTO/INCÊNDIO)` : fipe) : "",
          franquia: soRoubo ? "NÃO SE APLICA" : frq,
          danos_materiais: lim(dm[k]) || "NÃO CONTRATADO", danos_corporais: lim(dc[k]) || "NÃO CONTRATADO", danos_morais: lim(mo[k]) || "NÃO CONTRATADO",
          app: lim(app[k]) ? `${lim(app[k])} POR PASSAGEIRO` : "NÃO CONTRATADO",
          guincho: nao(as[k]?.[0]) && nao(g) ? "NÃO CONTRATADO" : /LIVRE/i.test(g || "") ? "SEM LIMITE DE KM" : guincho(g) || up(as[k]?.[0]),
          carro_reserva: nao(cr[k]?.[0]) ? "NÃO" : carroReserva(`${cr[k][0]} ${crTexto}`) || up(cr[k][0]),
          vidros: nao(vid[k]?.[0]) ? "NÃO CONTRATADO" : rotuloVidros("VIDROS LANTERNAS FARÓIS RETROVISORES"),
          logo_marca: servico(doc.texto, /LOGOMARCA|LOGO MARCA/i),
          pequenos_reparos: servico(doc.texto, /MARTELINHO|PARA-?CHOQUE|REPARO RAPIDO/i),
          roda_pneu: servico(doc.texto, /RODAS?,? PNEUS?/i),
          outras_coberturas: lim(def[k]) ? `GASTOS COM DEFESA ${lim(def[k])}` : "",
          premio_total: R(tot[k]?.[0]),
        }));
      });
    }

    // Parcelamento: "Boleto Bancário | Débito em Conta | Cartão de Crédito", linhas "NN  juros  v1 … vN" na ordem do cabeçalho.
    doc.linhas.forEach((l, i) => {
      if (!/^Parcelas\s+Juros/.test(l.texto)) return;
      const forma = up(doc.linhas[i - 1]?.celulas[0]?.s);
      const ofertas = l.celulas.slice(2).map((c) => up(nomeOferta(c.s)));
      const itens = ofertas.map(() => []);
      for (let j = i + 1; j < doc.linhas.length; j++) {
        const cs = doc.linhas[j].celulas; if (!/^\d{1,2}$/.test(cs[0]?.s || "")) break;
        cs.slice(2).forEach((c, k) => itens[k]?.push({ n: +cs[0].s, parcela: c.s, juros: !/sem juros/i.test(cs[1].s) }));
      }
      ofertas.forEach((nome, k) => { const o = opcoes.find((x) => x.nome === nome); if (o) o.pagamentos.push(...resumirPagamentos(forma, itens[k], o.premio_total)); });
    });

    const vig = doc.texto.match(/das 24H de (\S+) às 24H de (\S+)/i);
    const segurado = up(rx(doc, /Nome:\s*(.+?)\s{2,}CPF\/CNPJ/));
    const iCond = achar(doc, /CONDUTOR PRINCIPAL/);
    const condutor = iCond >= 0 ? up(doc.linhas[iCond + 1]?.texto.match(/Nome:\s*(.+?)(\s{2,}|$)/)?.[1]) : "";
    const rod = doc.texto.match(/^(\d{2})-(\d{2})-(\d{4}) \d{2}:\d{2}:\d{2}/m);
    return extracao({
      segurado, condutor: condutor || segurado,
      estado_civil: estadoCivil(rx(doc, /Estado Civil:\s*(.+)/)),
      cep: cep(rx(doc, /CEP Pernoite:\s*(\S+)/)), uso: usoVeiculo(rx(doc, /Finalidade de Uso:\s*(.+)/)),
      tipo: tipoSeguro(rx(doc, /Tipo de Seguro:\s*(.+?)(\s{2,}|$)/m)),
      seguradora_anterior: up(rx(doc, /Seguradora Anterior:\s*\d+\s*-\s*(.+)/)),
      bonus: String(parseInt(rx(doc, /Classe Bônus:\s*(\d+)/), 10) || ""),
      vencimento_anterior: data(rx(doc, /Fim da vigência anterior:\s*(\S+)/)),
      veiculo: up(rx(doc, /Veículo:\s*(.+?)\s{2,}Versão/)), placa: placa(rx(doc, /Placa:\s*(\S+)/)), ano_modelo: rx(doc, /Ano\/Modelo:\s*(\S+)/),
      vigencia_inicio: data(vig?.[1]), vigencia_fim: data(vig?.[2]),
      data_cotacao: rod ? `${rod[1]}/${rod[2]}/${rod[3]}` : dataExtenso(rx(doc, /,\s*(\d{1,2} de \S+ de \d{4})/)),
      validade_cotacao: data(rx(doc, /condições desta cotação até\s*(\S+)/)),
      cobertura_menor_25: simNao(rx(doc, /idade entre 18 a 25 anos:\s*(\S+)/)),
      seguradoras: [{ seguradora: "Allianz", numero_cotacao: rx(doc, /Nº Cotação:\s*(\d+)/), opcoes }],
      alertas: frq ? ["A Allianz mostra uma única franquia para todas as ofertas com casco compreensivo; confira."] : [],
    });
  },
};
