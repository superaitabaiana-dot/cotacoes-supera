// Tokio Marine, formato com vários produtos lado a lado ("Escolha o produto ideal": Auto, Auto Clássico,
// Auto Proteção Mensal, Auto Roubo). Cada produto vira uma opção. Os quadros têm uma coluna por produto; cada valor
// vai para o produto de centro mais próximo (funciona com texto do PDF e com o OCR, que funde células vizinhas).
import { R, achar, carroReserva, cep, data, datas, estadoCivil, extracao, franquia, maisProximo, opcao, pct, placa, resumirPagamentos, rotuloVidros, rx, simNao, tipoSeguro, tokensComX, up, usoVeiculo } from "./base.js";

const TOK = /Não contratada|Não Possui|Não Disponível|Indisponível|Sem Juros|R\$\s*[\d.]+,\d{2}(?:\s*\([^)]*\))?|[\d.]+,\d{2}%?|Ajuste\s*-\s*[\d,]+%|=\s*(?:Ilimitado|\d+\s*KM)|\d+\s*diárias[^|]*?(?=\s{2,}|$)|Completo|Completa|VIP/gi;

/** Linha de cabeçalho com os produtos (a partir de `de`): centros de cada coluna e nomes. */
function cabecalho(doc, de = 0) {
  for (let i = Math.max(0, de); i < doc.linhas.length; i++) {
    const cs = doc.linhas[i].celulas.filter((c) => /^Auto\b/i.test(c.s));
    if (cs.length >= 2 && /Auto Roubo|Auto Clássico/i.test(doc.linhas[i].texto)) return { i, nomes: cs.map((c) => up(c.s)), centros: cs.map((c) => (c.x + c.x2) / 2) };
  }
  return null;
}

export const tokioProdutos = {
  id: "tokio-produtos", nome: "Tokio Marine (produtos)",
  detecta: (doc) => /Cotação Tokio Marine/i.test(doc.texto) && (/Escolha o produto ideal/i.test(doc.texto) || /Auto Clássico[\s\S]*Auto Roubo/.test(doc.texto)),
  ler(doc) {
    const iCob = achar(doc, /^COBERTURAS/i);
    const cab = cabecalho(doc, iCob);
    if (!cab) throw new Error("Tokio (produtos): cabeçalho dos produtos não encontrado");
    const nomesBase = cab.nomes.map((n) => n.replace(/^AUTO PROTEÇÃO$/, "AUTO PROTEÇÃO MENSAL"));
    const porCol = (l, centros = cab.centros) => { const r = centros.map(() => []); for (const t of tokensComX(l, TOK)) if (t.cx > centros[0] - 120) r[maisProximo(t.cx, centros)].push(t.s); return r; };
    const juntar = (...ls) => { const r = cab.centros.map(() => []); for (const l of ls) porCol(l).forEach((v, k) => r[k].push(...v)); return r; };
    const L = (re, de = iCob) => { const i = achar(doc, re, de); return i < 0 ? null : doc.linhas[i]; };
    const lmi = (toks) => { const t = toks?.find((x) => /R\$|Não contratada/i.test(x)); return t && /R\$/.test(t) ? R(t) : ""; };

    // Casco: "Valor Referenciado (VMR) % de Ajuste - 100,00%" ocupa várias linhas; a cobertura vem na linha do rótulo.
    const iCol = achar(doc, /Colisão, Incêndio e Roubo/i, iCob), iInc = achar(doc, /^Incêndio e Roubo\/Furto/i, iCob), iDesp = achar(doc, /^Despesa extraordin/i, iCob);
    const colisao = porCol(doc.linhas[iCol]);
    const ajusteCol = juntar(...doc.linhas.slice(iCol + 1, iInc > iCol ? iInc : iCol + 3));
    const ajusteInc = juntar(...doc.linhas.slice(iInc + 1, iDesp > iInc ? iDesp : iInc + 3));
    const dm = porCol(L(/^RCF-V - Danos Materiais/i)), dc = porCol(L(/^RCF-V - Danos Corporais/i)), mo = porCol(L(/^RCF-V - Danos Morais/i));
    const app = porCol(L(/^APP - Morte/i));

    // Quadros da página seguinte, com o mesmo cabeçalho de produtos.
    const linhaProd = (re) => { const i = achar(doc, re, iCob); if (i < 0) return null; const c = cabecalho(doc, i - 6); return { linha: doc.linhas[i], centros: c && c.i < i ? c.centros : cab.centros }; };
    const celulas = (re) => { const x = linhaProd(re); if (!x) return cab.centros.map(() => ""); const r = x.centros.map(() => []);
      for (const c of x.linha.celulas) { const cx = (c.x + c.x2) / 2; if (c.x > x.centros[0] - 120 && !/^\|$/.test(c.s)) r[maisProximo(cx, x.centros)].push(c.s); }
      return r.map((v) => v.join(" ")); };
    const frq = celulas(/^Indenização Parcial do Veículo/i);
    const vid = celulas(/^Vidros\s/i), logo = celulas(/^Logomarca/i), mart = celulas(/^Martelinho/i), roda = celulas(/^Roda, pneu/i), cr = celulas(/^Carro reserva\s/i);
    const iRb = achar(doc, /\(adicional\)\s*=/i, iCob);
    const reboque = iRb >= 0 ? porCol(doc.linhas[iRb], linhaProd(/^Km adicional reboque/i)?.centros || cab.centros) : cab.centros.map(() => []);
    const tem = (s) => (!s ? null : !/Não possui|Não contratad/i.test(s));

    // Pagamentos: três quadros (Débito/Pix, Ficha, Cartão), cada produto com "Parcela | Juros | Total" ou "Indisponível".
    const pag = nomesBase.map(() => []);
    for (const [re, forma] of [[/^Débito/i, "DÉBITO/PIX AUTOMÁTICO"], [/^Ficha/i, "FICHA"], [/^Cartão/i, "CARTÃO DE CRÉDITO"]]) {
      const i = doc.linhas.findIndex((l, k) => k > iCob && re.test(l.texto) && /Auto/i.test(l.texto)); if (i < 0) continue;
      const c = cabecalho(doc, i); if (!c || c.i !== i) continue;
      const itens = c.nomes.map(() => []); let n = 0;
      for (let j = i + 1; j < doc.linhas.length; j++) {
        const l = doc.linhas[j]; if (/^(Pix|Parcela)/i.test(l.texto)) continue;
        const toks = tokensComX(l, /Indisponível|Sem Juros|[\d.]+,\d{2}/gi); if (toks.length < 3) { if (n) break; else continue; }
        // Nº de parcelas: o número no início da linha; se o OCR o embaralhou ("nn"), a linha seguinte à anterior.
        const num = l.texto.match(/^(\d{1,2})\s/); n = num ? +num[1] : n + 1;
        const r = c.centros.map(() => []); for (const t of toks) r[maisProximo(t.cx, c.centros)].push(t.s);
        r.forEach((v, k) => { if (v.length === 3 && !/Indispon/i.test(v[0])) itens[k].push({ n, parcela: v[0], juros: !/Sem Juros/i.test(v[1]), total: v[2] }); });
      }
      c.nomes.forEach((nome, k) => { const p = nomesBase.findIndex((x) => x === nome || x.startsWith(nome)); if (p >= 0) pag[p].push({ forma, itens: itens[k] }); });
    }

    const opcoes = nomesBase.map((nome, k) => {
      // Preço: o total da menor quantidade de parcelas sem juros no primeiro quadro (à vista; no produto mensal, as 12x).
      const base = pag[k][0]?.itens.filter((x) => !x.juros).sort((a, b) => a.n - b.n)[0];
      const premio = R(base?.total);
      const fipeCol = pct(ajusteCol[k].find((t) => /Ajuste/i.test(t))), fipeInc = pct(ajusteInc[k].find((t) => /Ajuste/i.test(t)));
      const temColisao = !/Não contratada/i.test(colisao[k][0] || "Não contratada");
      const g = reboque[k].find((t) => /=/.test(t));
      const fr = frq[k].match(/R\$\s*([\d.]+,\d{2})\s*\(([^)]+)\)/);
      const o = opcao({
        nome,
        fipe: temColisao ? fipeCol : fipeInc ? `${fipeInc} (SÓ INCÊNDIO E ROUBO/FURTO)` : "",
        franquia: fr ? franquia(fr[1], fr[2]) : temColisao ? "" : "NÃO SE APLICA",
        danos_materiais: lmi(dm[k]) || "NÃO CONTRATADO", danos_corporais: lmi(dc[k]) || "NÃO CONTRATADO", danos_morais: lmi(mo[k]) || "NÃO CONTRATADO",
        app: lmi(app[k]) ? `${lmi(app[k])} POR PASSAGEIRO` : "NÃO CONTRATADO",
        guincho: g ? (/Ilimitado/i.test(g) ? "SEM LIMITE DE KM" : up(g.replace(/^=\s*/, ""))) : "",
        carro_reserva: tem(cr[k]) ? carroReserva(cr[k]) || up(cr[k]) : "NÃO",
        vidros: tem(vid[k]) ? rotuloVidros(vid[k]) : "NÃO CONTRATADO",
        logo_marca: tem(logo[k]), pequenos_reparos: tem(mart[k]), roda_pneu: tem(roda[k]),
        premio_total: premio,
      });
      for (const f of pag[k]) o.pagamentos.push(...resumirPagamentos(f.forma, f.itens, premio));
      return o;
    });

    const iProp = achar(doc, /^Proponente\s+CPF/i); const prop = iProp >= 0 ? doc.linhas[iProp + 1] : null;
    const segurado = up(prop?.celulas[0]?.s);
    const iVei = achar(doc, /^Tipo Seguro\s+Vigência/i); const vei = iVei >= 0 ? doc.linhas[iVei + 1] : null;
    const iFab = achar(doc, /^Fabricante\s+Veículo/i);
    const iRen = achar(doc, /^Nome da Congênere/i); const ren = iRen >= 0 ? doc.linhas[iRen + 1] : null;
    const iUso = achar(doc, /^Tipo de utilização/i);
    const iMenor = achar(doc, /faixa etária de 18 a 25 anos/i);
    const vig = datas(rx(doc, /Vigência:\s*([^|\n]+)/));
    return extracao({
      segurado, condutor: /Próprio Segurado/i.test(prop?.texto || "") ? segurado : up(prop?.celulas[2]?.s),
      estado_civil: estadoCivil(prop?.celulas.slice(3).map((c) => c.s).join(" ")),
      cep: cep(doc.texto.slice(doc.texto.search(/CEP de pernoite/i))),
      uso: usoVeiculo(iUso >= 0 ? doc.linhas[iUso + 1]?.celulas[0]?.s : ""),
      tipo: tipoSeguro(vei?.celulas[0]?.s),
      seguradora_anterior: up(ren?.celulas[0]?.s.replace(/^\d+\s*-\s*/, "")), vencimento_anterior: data(ren?.texto.match(/\d{2}\/\d{2}\/\d{4}/)?.[0]),
      bonus: String(parseInt(ren?.celulas.at(-1)?.s, 10) || ""),
      veiculo: up(iFab >= 0 ? doc.linhas[iFab + 1]?.texto.replace(/\s{3,}/g, " ") : ""), placa: placa(vei?.texto), ano_modelo: rx({ texto: vei?.celulas.at(-1)?.s || "" }, /^(\d{4})$/),
      vigencia_inicio: vig[0] || "", vigencia_fim: vig[1] || "",
      data_cotacao: data(rx(doc, /Data impressão:\s*(\S+)/)), validade_cotacao: data(rx(doc, /Validade cotação:\s*(\S+)/)),
      cobertura_menor_25: simNao(iMenor >= 0 ? doc.linhas[iMenor + 1]?.texto : ""),
      seguradoras: [{ seguradora: "Tokio Marine", numero_cotacao: rx(doc, /Nº Cotação:\s*(\d+)/), opcoes }],
      alertas: [],
    });
  },
};

