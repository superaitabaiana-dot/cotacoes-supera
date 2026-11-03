// Bradesco, Mapfre, Tokio Marine, Zurich e Suhai: um layout próprio cada.
import { R, achar, anoModelo, carroReserva, cel, cep, colunaMaisProxima, data, datas, depois, estadoCivil, extracao, franquia, guincho, maisProximo, opcao, pct, placa, resumirPagamentos, rotuloVidros, rx, sem, servico, simNao, tipoSeguro, tokensComX, up, usoVeiculo, valores } from "./base.js";

const linhaDe = (doc, re) => doc.linhas.find((l) => re.test(l.texto))?.texto || "";
/** Limite da cobertura; vazio quando a linha diz "não contratada" (o R$ 0,00 ao lado é o prêmio). */
const lmi = (linha) => (/não contratad/i.test(linha) ? "" : R(linha));

// ---------- Bradesco ----------
export const bradesco = {
  id: "bradesco", nome: "Bradesco",
  detecta: (doc) => /Bradesco Auto\/Re/i.test(doc.texto) && /DEMONSTRATIVO DE C[ÁA]LCULO/.test(doc.texto),
  ler(doc) {
    const premio = R(rx(doc, /TOTAL A PAGAR:\s*([\d.,]+)/));
    const clausulas = doc.texto.slice(doc.texto.indexOf("CLÁUSULAS"), doc.texto.indexOf("Este cálculo"));
    // Franquia do casco: "(25 da Obrigatória)" ou só o tipo, como "(Reduzida)".
    const frqM = doc.texto.match(/Veículo:\s*([\d.]+,\d{2})\s*\(([^)]+)\)/i);
    const frqT = frqM?.[2].match(/^(\d+)\s*da\s*(.+)$/i);
    const frq = frqM ? [frqM[0], frqM[1], frqT ? `${frqT[1]}% DA ${frqT[2]}` : frqM[2]] : null;
    const tem = (re) => re.test(sem(clausulas));
    const morais = rx(doc, /D\. Morais\.?:\s*([\d.,]+)/);
    const appM = rx(doc, /Morte p\/ Passageiro:\s*([\d.,]+)/);
    const vidroRet = (rx(doc, /Retrovisores:\s*([\d.,]+)/) || "0,00") !== "0,00";
    const o = opcao({
      nome: rx(doc, /Veículo:\s*(Valor de [^\n]+?)\s{2,}/i) || "Valor de mercado referenciado",
      fipe: `${rx(doc, /Fator de Ajuste:\s*(\d+)/)}%`.replace(/^%$/, ""),
      franquia: frq ? franquia(frq[1], frq[2]) : "",
      danos_materiais: R(rx(doc, /D\.M\.:\s*([\d.,]+)/)) || "NÃO CONTRATADO",
      danos_corporais: R(rx(doc, /D\.C\.:\s*([\d.,]+)/)) || "NÃO CONTRATADO",
      danos_morais: morais && morais !== "0,00" ? R(morais) : "NÃO CONTRATADO",
      app: appM && appM !== "0,00" ? `${R(appM)} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: tem(/ASSIST/i) ? guincho(clausulas.match(/Assist[^(]*/i)?.[0]) || up(clausulas.match(/\(\d+\)\s*(Assist[^(]*)/i)?.[1]) : "NÃO CONTRATADO",
      carro_reserva: carroReserva(clausulas.match(/\(\d+\)\s*([^(]*Reserva[^(]*)/i)?.[1]) || "NÃO",
      vidros: tem(/VIDRO/i) ? (vidroRet ? "COMPLETA" : "SÓ VIDROS") : "NÃO CONTRATADO",
      logo_marca: tem(/LOGO/i) ? true : null,
      pequenos_reparos: tem(/MARTELINHO|REPARE|PARA-?CHOQUE/i) ? true : false,
      roda_pneu: tem(/RODAS|PNEU/i) ? true : false,
      outras_coberturas: tem(/MERCOSUL/i) ? "EXTENSÃO MERCOSUL" : "",
      premio_total: premio,
    });
    // Pagamento: "Nx R$ parcela R$ total" para cada forma, na ordem do cabeçalho.
    const iCab = achar(doc, /^Débito em Conta\s+Cartão/i);
    if (iCab >= 0) {
      const cols = doc.linhas[iCab].celulas;
      const porCol = cols.map(() => []);
      for (let i = iCab + 2; i < doc.linhas.length; i++) {
        const l = doc.linhas[i]; const m = l.texto.match(/^(\d+)x/); if (!m) break;
        const cs = l.celulas.filter((c) => /R\$/.test(c.s));
        const pares = []; for (let k = 0; k + 1 < cs.length; k += 2) pares.push([cs[k], cs[k + 1]]);
        pares.forEach(([p, t], k) => porCol[pares.length === cols.length ? k : colunaMaisProxima(p, cols)].push({ n: +m[1], parcela: p.s, total: t.s }));
      }
      cols.forEach((c, k) => o.pagamentos.push(...resumirPagamentos(up(c.s), porCol[k], premio)));
    }
    const vig = doc.texto.match(/das 24h de (\S+) às 24h de (\S+)/);
    const principal = /principal condutor \?\s+Sim/i.test(doc.texto);
    const segurado = up(rx(doc, /Nome:\s*(.+?)\s{2,}Vigência/));
    const iCond = achar(doc, /Características do principal condutor/i);
    return extracao({
      segurado, condutor: principal ? segurado : up(rx({ texto: doc.linhas.slice(iCond).map((l) => l.texto).join("\n") }, /Nome:\s*(.+)/)),
      estado_civil: estadoCivil(rx(doc, /Estado Civil:\s*(.+?)(\s{2,}|$)/m)),
      cep: cep(rx(doc, /CEP de Pernoite:\s*(\S+)/)), uso: usoVeiculo(rx(doc, /Uso Veículo:\s*(\S+)/)),
      tipo: /Cia Renovação:\s*\d+/.test(doc.texto) ? "RENOVACAO" : "NOVO",
      bonus: String(parseInt(rx(doc, /Bônus:\s*(\d+)/), 10) || ""),
      veiculo: up(`${rx(doc, /Marca:\s*(\S+)/)} ${rx(doc, /Tipo do Veículo:\s*(.+?)\s{2,}/)}`),
      placa: placa(rx(doc, /Placa:\s*(\S+)/)),
      ano_modelo: `${rx(doc, /Ano Fab\.:\s*(\d{4})/)}/${rx(doc, /Ano Mod\.:\s*(\d{4})/)}`.replace(/^\/$/, ""),
      vigencia_inicio: data(vig?.[1]), vigencia_fim: data(vig?.[2]),
      data_cotacao: data(rx(doc, /Data do 1º Cálculo:\s*(\S+)/)), validade_cotacao: data(rx(doc, /Cálculo válido até:\s*(\S+)/)),
      cobertura_menor_25: simNao(rx(doc, /18 E 25 ANOS\?\s*R\.:\s*(\S+)/i)),
      seguradoras: [{ seguradora: "Bradesco", numero_cotacao: rx(doc, /Nº Cotação:\s*(\S+)/), opcoes: [o] }],
    });
  },
};

// ---------- Mapfre ----------
export const mapfre = {
  id: "mapfre", nome: "Mapfre",
  detecta: (doc) => /MAPFRE/.test(doc.texto) && /Cotação de Seguro/i.test(doc.texto),
  ler(doc) {
    const l = (re) => linhaDe(doc, re);
    const premio = R(valores(depois(doc, /^Prêmio Líquido\s+Encargos/)?.texto).pop());
    const casco = l(/^Casco - /);
    const frq = doc.texto.match(/Casco:\s*(.+?)\s{2,}([\d.]+,\d{2})/);
    const assist = l(/^Assistência 24h/), ext = l(/Extensão de Reboque/i);
    const vid = l(/^Vidros/);
    const app = l(/^APP - Morte/i);
    const outras = [l(/Objetos Transportados/i) ? "OBJETOS TRANSPORTADOS" : "", l(/Despesas Extraordin/i) ? "DESPESAS EXTRAORDINÁRIAS" : ""].filter(Boolean).join(", ");
    const g = guincho(assist);
    const o = opcao({
      nome: up(rx(doc, /Modalidade:\s*(VALOR [A-Z ]+?)\s+Fator/)) || "VALOR DE MERCADO REFERENCIADO",
      fipe: pct(casco),
      franquia: frq ? franquia(frq[2], frq[1].replace(/\s*%/, "%")) : "",
      danos_materiais: R(l(/Danos Materiais/i)) || "NÃO CONTRATADO",
      danos_corporais: R(l(/Danos Corporais/i)) || "NÃO CONTRATADO",
      danos_morais: R(l(/Danos Morais/i)) || "NÃO CONTRATADO",
      app: R(app) ? `${R(app)} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: g ? (guincho(ext) ? `${g} + ${guincho(ext)} ADICIONAL` : g) : "NÃO CONTRATADO",
      carro_reserva: carroReserva(l(/Carro Reserva/i)) || "NÃO",
      vidros: vid ? rotuloVidros(vid + " " + (/Retrovisores/.test(doc.texto) ? "RETROVISORES FARÓIS" : "")) : "NÃO CONTRATADO",
      logo_marca: servico(doc.texto, /LOGOMARCA|LOGO MARCA/i),
      pequenos_reparos: servico(doc.texto, /MARTELINHO|PARA-?CHOQUE|REPARO RAPIDO/i),
      roda_pneu: servico(doc.texto, /RODAS?,? PNEUS?/i),
      outras_coberturas: outras,
      premio_total: premio,
    });
    // Quatro formas lado a lado, em trincas "Nx Sem/Com Juros | R$ parcela | R$ total"; "-" marca coluna vazia.
    const iF = achar(doc, /^Boleto\s+Débito em Conta/i);
    if (iF >= 0) {
      const formas = doc.linhas[iF].celulas.map((c) => up(c.s));
      const porForma = formas.map(() => []);
      for (let i = iF + 1; i < doc.linhas.length; i++) {
        const t = doc.linhas[i].texto;
        if (!/^(\d+x|-)\s/.test(t)) continue;
        // Valor ilegível ("R$??", vindo do OCR) ainda ocupa a trinca, para as formas seguintes não mudarem de coluna.
        const grupos = [...t.matchAll(/(\d+)x\s+(Sem|Com) Juros\s+R\$\s*(\S+)\s+R\$\s*(\S+)|-\s+-\s+-/g)];
        const ok = (v) => /^\d{1,3}(\.\d{3})*,\d{2}$/.test(v);
        grupos.forEach((g, k) => { if (g[1] && porForma[k] && ok(g[3]) && ok(g[4])) porForma[k].push({ n: +g[1], juros: g[2] === "Com", parcela: g[3], total: g[4] }); });
      }
      formas.forEach((f, k) => o.pagamentos.push(...resumirPagamentos(f, porForma[k], premio)));
    }
    const vig = doc.texto.match(/dia (\d\d\/\d\d\/\d{4}) até as 24 horas do dia (\d\d\/\d\d\/\d{4})/);
    return extracao({
      segurado: up(rx(doc, /Segurado:\s*(.+?)\s{2,}/)),
      condutor: up(rx(doc, /Nome do Principal Condutor:\s*(.+)/)),
      estado_civil: estadoCivil(rx(doc, /Estado Civil do Condutor:\s*\S+\s*-\s*(.+)/)),
      cep: cep(rx(doc, /CEP de pernoite do veículo:\s*(\S+)/)), uso: usoVeiculo(rx(doc, /Uso:\s*\d*\s*-?\s*(\S+)/)),
      tipo: tipoSeguro(rx(doc, /Tipo de Seguro:\s*(.+?)\s{2,}/)), bonus: rx(doc, /Classe de Bônus:\s*(\d+)/),
      veiculo: up(rx(doc, /Veículo:\s*[\d;]+\s*\S+\s+(.+)/)), ano_modelo: rx(doc, /Ano Modelo:\s*(\d{4})/),
      vigencia_inicio: vig?.[1] || "", vigencia_fim: vig?.[2] || "",
      data_cotacao: data(rx(doc, /Data da Cotação:\s*(\S+)/)), validade_cotacao: data(rx(doc, /Validade da Cotação:\s*(\S+)/)),
      cobertura_menor_25: simNao(rx(doc, /entre 18 e 25 anos\?\s*(\S+)/i)),
      seguradoras: [{ seguradora: "Mapfre", numero_cotacao: rx(doc, /Cotação nº:\s*(\d+)/), opcoes: [o] }],
    });
  },
};

// ---------- Tokio Marine ----------
export const tokio = {
  id: "tokio", nome: "Tokio Marine",
  detecta: (doc) => /Cotação Tokio Marine/.test(doc.texto),
  ler(doc) {
    const l = (re) => linhaDe(doc, re);
    const premio = R(rx(doc, /R\$\s*\n\s*([\d.]+,\d{2})\s*\n\s*à vista/));
    const frq = doc.texto.match(/Indenização Parcial do Veículo\s+(R\$\s*[\d.,]+)\s*\(([^)]+)\)/);
    // Quadro de serviços: rótulos numa linha, situação na seguinte, na mesma ordem.
    const quadro = {};
    for (const re of [/^Vidros\s+Martelinho/, /^Logomarca/]) {
      const i = achar(doc, re); if (i < 0) continue;
      doc.linhas[i].celulas.forEach((c, k) => { quadro[up(sem(c.s))] = cel(doc.linhas[i + 1], k); });
    }
    const q = (re) => Object.entries(quadro).find(([k]) => re.test(k))?.[1] || "";
    const sim = (v) => !v ? null : !/NAO POSSUI|NAO CONTRATAD/i.test(up(sem(v)));
    const km = rx(doc, /Km adicional reboque\s+(.+)/i);
    const g = km.match(/(\d+)\s*km \(padrão\)\s*\+\s*(\d+)\s*km \(adicional\)\s*=\s*(\d+)\s*KM/i);
    const o = opcao({
      nome: "Valor de mercado referenciado",
      fipe: pct(l(/^\d{2,3},\d{2}%$/) || l(/% de Ajuste/)),
      franquia: frq ? franquia(frq[1], frq[2]) : "",
      danos_materiais: lmi(l(/Danos Materiais/i)) || "NÃO CONTRATADO",
      danos_corporais: lmi(l(/Danos Corporais/i)) || "NÃO CONTRATADO",
      danos_morais: lmi(l(/Danos Morais/i)) || "NÃO CONTRATADO",
      app: lmi(l(/APP - Morte/i)) ? `${lmi(l(/APP - Morte/i))} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: g ? `${g[3]} KM (${g[1]} + ${g[2]} ADICIONAL)` : guincho(km) || (l(/^Assistência 24 horas/) ? up(cel({ celulas: doc.linhas.find((x) => /^Assistência 24 horas/.test(x.texto))?.celulas }, 1)) : "NÃO CONTRATADO"),
      carro_reserva: carroReserva(q(/CARRO RESERVA/)) || "NÃO",
      vidros: rotuloVidros(q(/^VIDROS/)),
      logo_marca: sim(q(/LOGOMARCA/)), pequenos_reparos: sim(q(/MARTELINHO/)), roda_pneu: sim(q(/RODA/)),
      premio_total: premio,
    });
    // Três tabelas (Débito/Pix, Ficha, Cartão), cada uma em duas metades: "n parcela juros total".
    for (const [re, forma] of [[/^Débito\/Pix/, "DÉBITO/PIX AUTOMÁTICO"], [/^Ficha\s+Parcela/, "FICHA"], [/^Cartão\s+Parcela/, "CARTÃO DE CRÉDITO"]]) {
      const i = achar(doc, re); if (i < 0) continue;
      const itens = [];
      for (let j = i + 1; j < doc.linhas.length; j++) {
        const t = doc.linhas[j].texto; if (!/^\d+\s/.test(t)) break;
        for (const m of t.matchAll(/(\d+)\s+([\d.]+,\d{2})\s+(Antecipado\*|Sem Juros|[\d,]+)\s+([\d.]+,\d{2})/g))
          if (!/Antecipado/.test(m[3])) itens.push({ n: +m[1], parcela: m[2], total: m[4], juros: m[3] !== "Sem Juros" });
      }
      o.pagamentos.push(...resumirPagamentos(forma, itens, premio));
    }
    const cab = doc.linhas.find((x) => /\d{3}\.\d{3}\.\d{3}-\d{2}/.test(x.texto) && achar(doc, /^Proponente\s+CPF/) >= 0);
    const tipo = depois(doc, /^Tipo Seguro\s+Vigência/);
    const ap = depois(doc, /^Número da apólice\s+Fim de vigência/);
    const iEC = achar(doc, /^Proponente\s+CPF/);
    const estado = [cel(doc.linhas[iEC + 1], 0), doc.linhas[iEC + 3]?.texto].join(" ");
    const vig = datas(rx(doc, /Vigência:\s*([^|\n]+)/));
    const segurado = cel(cab, 0);
    return extracao({
      segurado, condutor: /Próprio Segurado/i.test(cab?.texto || "") ? segurado : cel(cab, 2),
      estado_civil: estadoCivil(estado),
      cep: cep(doc.texto.slice(doc.texto.indexOf("CEP de pernoite"))), uso: usoVeiculo(cel(depois(doc, /^Tipo de utilização/), 0)),
      tipo: tipoSeguro(cel(tipo, 0)), bonus: cel(ap, 2), vencimento_anterior: data(cel(ap, 1)),
      seguradora_anterior: /Renovação Tokio/i.test(tipo?.texto || "") ? "TOKIO MARINE" : "",
      veiculo: up(depois(doc, /^Fabricante\s+Veículo/)?.texto.replace(/\s{3,}/g, " ")), placa: placa(tipo?.texto), ano_modelo: cel(tipo, tipo ? tipo.celulas.length - 1 : 0),
      vigencia_inicio: vig[0] || "", vigencia_fim: vig[1] || "",
      data_cotacao: data(rx(doc, /Data impressão:\s*(\S+)/)), validade_cotacao: data(rx(doc, /Validade cotação:\s*(\S+)/)),
      cobertura_menor_25: simNao(rx(doc, /faixa etária de 18 a 25 anos[^\n]*\n\s*(\S+)/i)),
      seguradoras: [{ seguradora: "Tokio Marine", numero_cotacao: rx(doc, /Nº Cotação:\s*(\d+)/), opcoes: [o] }],
    });
  },
};

// ---------- Zurich ----------
export const zurich = {
  id: "zurich", nome: "Zurich",
  detecta: (doc) => /ZURICH AUTOM[ÓO]VEL/.test(doc.texto),
  ler(doc) {
    const l = (re) => linhaDe(doc, re);
    const tabela = doc.linhas.filter((x) => /^0?1(\s*\+\s*\d+)?\s/.test(x.texto) && valores(x.texto).length >= 2 && achar(doc, /^Parcelas\s+Valor de Entrada/) >= 0);
    const premio = R(valores(tabela.find((x) => /^0?1\s/.test(x.texto) && !/\+/.test(x.texto))?.texto).pop());
    const casco = l(/^Veículo - /);
    const cv = valores(casco);
    const clausulas = doc.texto.slice(doc.texto.indexOf("Cláusulas"), doc.texto.indexOf("Prêmio Líquido"));
    const o = opcao({
      nome: /VMR|Mercado/i.test(rx(doc, /Modalidade:\s*(.+?)\s{2,}/)) ? "Valor de mercado referenciado" : "Valor determinado",
      fipe: pct(casco),
      franquia: cv.length >= 2 ? franquia(cv[0]) : "",
      danos_materiais: R(l(/RCV - Danos Materiais/i)) || "NÃO CONTRATADO",
      danos_corporais: R(l(/RCV - Danos Corporais/i)) || "NÃO CONTRATADO",
      danos_morais: R(l(/RCV - Danos Morais/i)) || "NÃO CONTRATADO",
      app: R(l(/^APP/)) ? `${R(l(/^APP/))} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: guincho(l(/Km de Reboque/i) || clausulas.match(/ASSIST[^\n]*/i)?.[0]) || "NÃO CONTRATADO",
      carro_reserva: carroReserva(clausulas.match(/CARRO RESERVA[^\n]*/i)?.[0]) || "NÃO",
      vidros: /VIDROS/i.test(clausulas) ? rotuloVidros(clausulas.match(/VIDROS[^\n]*/i)?.[0]) : "NÃO CONTRATADO",
      logo_marca: servico(doc.texto, /LOGOMARCA|LOGO MARCA/i),
      pequenos_reparos: servico(doc.texto, /MARTELINHO|PARA-?CHOQUE|REPARO RAPIDO/i),
      roda_pneu: servico(doc.texto, /RODAS?,? PNEUS?/i),
      premio_total: premio,
    });
    const itens = tabela.map((x) => { const m = x.texto.match(/^0?1(?:\s*\+\s*(\d+))?/); const v = valores(x.texto); const n = 1 + Number(m[1] || 0);
      return n === 1 ? { n, parcela: v[0], total: v[2] } : { n, entrada: v[0], parcela: v[1], total: v[2] }; });
    o.pagamentos = resumirPagamentos("PARCELAMENTO", itens, premio);
    return extracao({
      segurado: up(rx(doc, /Nome completo\/Razão social:\s*(.+?)\s{2,}/)),
      condutor: up(rx(doc, /Condutor principal:\s*(.+?)\s{2,}/)),
      estado_civil: estadoCivil(rx(doc, /Estado civil do condutor:\s*(\S+)/)),
      cep: cep(rx(doc, /pernoite do veículo:\s*(\d+)/)), uso: usoVeiculo(rx(doc, /Uso veículo:\s*(.+)/)),
      tipo: /Renovação:\s*(CONG|PR[ÓO]PRIA|SIM)/i.test(doc.texto) ? "RENOVACAO" : tipoSeguro(rx(doc, /Renovação:\s*(\S+)/)) || "NOVO",
      bonus: rx(doc, /Classe de bônus:\s*(\d+)/), vencimento_anterior: data(rx(doc, /Final Vigência Apólice Anterior:\s*(\S+)/)),
      veiculo: up(rx(doc, /Veículo:\s*(.+?)\s{2,}Ano Modelo/)), ano_modelo: rx(doc, /Ano Modelo:\s*(\d{4})/),
      vigencia_inicio: data(rx(doc, /Inicio de vigência:\s*24H\s*(\S+)/)), vigencia_fim: data(rx(doc, /Término de vigência:\s*24H\s*(\S+)/)),
      data_cotacao: data(rx(doc, /Data do cálculo:\s*(\S+)/)), validade_cotacao: data(rx(doc, /válido até o dia:\s*(\S+)/)),
      cobertura_menor_25: simNao(rx(doc, /menos de 25 anos\?\s*(\S+)/)),
      seguradoras: [{ seguradora: "Zurich", numero_cotacao: rx(doc, /Cálculo Nº\.:\s*(\d+)/), opcoes: [o] }],
    });
  },
};

// ---------- Suhai ----------
// Quadro de coberturas com uma coluna por opção (pares LMI/Prêmio); o número e o nome das opções variam
// (formato antigo: 5 opções; atual: 4, com a Compreensiva). Células vizinhas às vezes vêm fundidas
// ("421,49 150.000,00"), então cada valor é atribuído à coluna pela posição horizontal estimada.
const TOK_SUHAI = /Não Contratado|Não se aplica|\d+% Fipe|[A-Za-zÀ-ú]+:\s*R\$\s*[\d.]+,\d{2}|[\d.]+,\d{2}|\d+\s*km/gi;
const nomeSuhai = (s) => up(s.replace(/^OPÇÃO\s+/i, "").replace(/\(\*\)/g, "").replace(/\s*\+\s*/g, " + ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")"));
export const suhai = {
  id: "suhai", nome: "Suhai",
  detecta: (doc) => /SUHAI SEGURADORA/.test(doc.texto),
  ler(doc) {
    const L = (re) => doc.linhas.find((x) => re.test(x.texto));
    const iCab = achar(doc, /^LMI\s+Prêmio/);
    const cabCel = iCab >= 0 ? doc.linhas[iCab].celulas : [];
    const cols = []; cabCel.forEach((c, k) => { if (/^LMI$/.test(c.s) && cabCel[k + 1]) cols.push((c.x + cabCel[k + 1].x2) / 2); });
    const porCol = (...ls) => { const r = cols.map(() => []); for (const l of ls) for (const t of tokensComX(l, TOK_SUHAI)) r[maisProximo(t.cx, cols)]?.push(t.s); return r; };
    const lmi = (toks) => (toks?.[0] && /,\d{2}$/.test(toks[0]) ? R(toks[0]) : "");
    const temFipe = (toks) => toks?.find((t) => /Fipe/i.test(t));
    // Prêmio total: a linha do rótulo e as que só têm valores logo abaixo (valor que não coube na linha).
    const iTot = achar(doc, /^Prêmio total, com IOF/);
    const lsTot = iTot < 0 ? [] : [doc.linhas[iTot]];
    for (let j = iTot + 1; iTot >= 0 && /^[\d.,\s]+$/.test(doc.linhas[j]?.texto || ""); j++) lsTot.push(doc.linhas[j]);
    const totais = porCol(...lsTot).map((t) => R(t.find((v) => /,\d{2}$/.test(v))));
    const comp = porCol(L(/^Compreensiva\s/)), pt = porCol(L(/^Ind\. Int\. por Roubo\/Furto\/Colisão/)), rf = porCol(L(/^Ind\. Integral por Roubo\/Furto\s/));
    const dm = porCol(L(/^RCF - Danos Materiais/)), dc = porCol(L(/^RCF - Danos Corporais/)), mo = porCol(L(/^RCF - Danos Morais/));
    const frq = porCol(L(/^Franquia Perdas Parciais/));
    // Assistência: linhas do bloco entre "Assistência 24 horas" e "Prêmio líquido"; coluna com prêmio = contratada.
    const iAs = achar(doc, /Assistência 24 horas/), iLiq = achar(doc, /^Prêmio líquido/);
    const assist = iAs >= 0 && iLiq > iAs ? porCol(...doc.linhas.slice(iAs - 1, iLiq)) : cols.map(() => []);
    const kmGeral = guincho(iAs >= 0 && iLiq > iAs ? doc.linhas.slice(iAs - 1, iLiq).map((x) => x.texto).join(" ") : "");
    // Parcelamento: blocos "OPÇÃO ..." com grupos de 4 colunas "parcelas, valor, total, juros"; o nome pode seguir na linha de baixo.
    const blocos = [];
    doc.linhas.forEach((x, p) => {
      if (!/^Parcelas\s+Valor Parcela/.test(x.texto)) return;
      let i0 = p - 1; while (i0 > p - 4 && !/OPÇÃO|TERCEIROS/i.test(doc.linhas[i0]?.texto || "")) i0--;
      const cab = doc.linhas[i0]; if (!cab || !/OPÇÃO|TERCEIROS/i.test(cab.texto)) return;
      const nomes = cab.celulas.map((c) => ({ s: c.s, cx: (c.x + c.x2) / 2 }));
      for (const cont of doc.linhas.slice(i0 + 1, p)) for (const c of cont.celulas) {
        const cx = (c.x + c.x2) / 2; nomes.reduce((a, b) => (Math.abs(b.cx - cx) < Math.abs(a.cx - cx) ? b : a)).s += " " + c.s;
      }
      const its = nomes.map(() => []);
      for (let j = p + 1; j < doc.linhas.length; j++) {
        const t = doc.linhas[j].texto; if (!/^\d+\s/.test(t)) break;
        [...t.matchAll(/(\d+)\s+([\d.]+,\d{2})\s+([\d.]+,\d{2})\s*([\d,]+)/g)].forEach((m, k) => its[k]?.push({ n: +m[1], parcela: m[2], total: m[3], juros: parseFloat(m[4].replace(",", ".")) > 0 }));
      }
      nomes.forEach((n, k) => blocos.push({ nome: nomeSuhai(n.s), itens: its[k], avista: R(its[k].find((i) => i.n === 1)?.total) }));
    });
    const usados = new Set();
    const opcoes = cols.map((_, k) => {
      const premio = totais[k] || "";
      const bloco = blocos.find((b, n) => !usados.has(n) && premio && b.avista === premio);
      if (bloco) usados.add(blocos.indexOf(bloco));
      const f = temFipe(comp[k]) ? `${pct(temFipe(comp[k]))} (COMPREENSIVA)` : temFipe(pt[k]) ? `${pct(temFipe(pt[k]))} (ROUBO, FURTO E PERDA TOTAL)` : temFipe(rf[k]) ? `${pct(temFipe(rf[k]))} (SÓ ROUBO/FURTO)` : "NÃO SE APLICA";
      const fr = frq[k]?.find((t) => /R\$/.test(t));
      const km = assist[k].find((t) => /km/i.test(t));
      const o = opcao({
        nome: bloco?.nome || "",
        fipe: f,
        franquia: fr ? franquia(fr, fr.split(":")[0]) : "NÃO SE APLICA",
        danos_materiais: lmi(dm[k]) || "NÃO CONTRATADO", danos_corporais: lmi(dc[k]) || "NÃO CONTRATADO", danos_morais: lmi(mo[k]) || "NÃO CONTRATADO",
        app: "NÃO CONTRATADO",
        guincho: assist[k].some((t) => /,\d{2}$/.test(t)) ? guincho(km) || kmGeral || "CONTRATADO" : "NÃO CONTRATADO",
        carro_reserva: "NÃO", vidros: "NÃO CONTRATADO",
        logo_marca: false, pequenos_reparos: false, roda_pneu: false,
        premio_total: premio,
      });
      o.pagamentos = bloco ? resumirPagamentos("PARCELAMENTO", bloco.itens, premio) : [];
      return o;
    });
    // Opções que só aparecem no parcelamento (sem coluna no quadro de coberturas): ficam de fora, com aviso.
    const soParcelas = blocos.filter((b, n) => !usados.has(n) && b.avista).map((b) => `${b.nome} (${b.avista} à vista)`);
    const alertas = soParcelas.length ? [`A Suhai também traz, só na tabela de parcelamento, sem quadro de coberturas: ${soParcelas.join("; ")}. Não foram incluídas; confira se interessam ao cliente.`] : [];
    const prop = depois(doc, /^Nome\/Razão Social\s+Tipo Pessoa/);
    const iEC = achar(doc, /^Nome Social\s+Sexo\s+Nascimento\s+Estado Civil/);
    let ec = cel(doc.linhas[iEC + 1], 3);
    for (let j = iEC + 2; j < iEC + 5 && doc.linhas[j]?.celulas.length === 1 && !/^Telefone/.test(doc.linhas[j].texto); j++) ec += doc.linhas[j].texto;
    const uso = depois(doc, /^Utilização\s+Reg\. Tarif/);
    const vig = doc.texto.match(/das 24h de (\S+) às 24h de (\S+)/);
    const dias = rx(doc, /Validade desta cotação:\s*(\d+)\s*dias/);
    return extracao({
      segurado: cel(prop, 0), estado_civil: estadoCivil(ec),
      cep: cep(cel(uso, 1).split("/").pop()), uso: usoVeiculo(cel(uso, 0)), bonus: cel(uso, 3),
      tipo: tipoSeguro(cel(depois(doc, /^Tipo de Seguro\s+Ramo/), 0)),
      veiculo: up(depois(doc, /^Marca\s+Modelo do Veículo/, 2)?.texto.replace(/\s{3,}/g, " ")),
      ano_modelo: anoModelo(cel(depois(doc, /^Ano Fabr\.\/Modelo/), 0)),
      vigencia_inicio: data(vig?.[1]), vigencia_fim: data(vig?.[2]),
      data_cotacao: data(rx(doc, /Data:\s*(\d{2}\/\d{2}\/\d{4})/)), validade_dias: dias ? Number(dias) : null,
      seguradoras: [{ seguradora: "Suhai", numero_cotacao: rx(doc, /Cálculo Nº:\s*(\S+)/), opcoes }], alertas,
    });
  },
};
