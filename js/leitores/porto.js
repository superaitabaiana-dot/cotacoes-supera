// Grupo Porto: Porto Seguro, Azul e Itaú. Dois formatos: "Orçamento de Seguro v1.0" (atual) e "Orçamento de Seguro Auto" (antigo).
import { R, achar, anoModelo, carroReserva, cel, cep, colunaMaisProxima, data, datas, depois, extracao, franquia, guincho, opcao, pct, placa, resumirPagamentos, rotuloVidros, rx, sem, servico, tipoSeguro, up, usoVeiculo, valores } from "./base.js";

function marca(texto) {
  const t = up(sem(texto));
  if (/ITAU/.test(t)) return "Itaú";
  if (/AZUL/.test(t)) return "Azul";
  return "Porto Seguro";
}

/** Tabelas "1x 2x ... 12x" com os valores alinhados por coluna; o título da forma vem na linha anterior. */
function pagamentosPorto(doc, de, premio) {
  const formas = [];
  if (de < 0) return formas; // seção de pagamento não encontrada
  for (let i = Math.max(0, de); i < doc.linhas.length; i++) {
    const l = doc.linhas[i];
    if (!/^1x\s+2x\s+3x/.test(l.texto)) continue;
    const forma = doc.linhas[i - 1].texto.replace(/^TODAS\s+/i, "").trim();
    const cols = l.celulas.map((c) => ({ ...c, n: parseInt(c.s, 10) }));
    let linhaValores = null;
    for (let j = i + 1; j <= i + 4 && j < doc.linhas.length; j++) {
      const cs = doc.linhas[j].celulas;
      if (cs.length && cs.every((c) => /^(\d{1,3}(\.\d{3})*,\d{2}\s*)+$/.test(c.s.trim()))) { linhaValores = doc.linhas[j]; break; }
    }
    if (!linhaValores) continue;
    const itens = [];
    for (const c of linhaValores.celulas) {
      const vs = valores(c.s);
      if (vs.length === 1) itens.push({ n: cols[colunaMaisProxima(c, cols)].n, parcela: vs[0] });
      else { // duas colunas coladas na mesma célula: divide a largura
        const w = (c.x2 - c.x) / vs.length;
        vs.forEach((v, k) => itens.push({ n: cols[colunaMaisProxima({ x: c.x + k * w, x2: c.x + (k + 1) * w }, cols)].n, parcela: v }));
      }
    }
    formas.push(...resumirPagamentos(up(forma), itens, premio));
  }
  // Boleto à vista avulso: "BOLETO / À vista / (5% de desc.) R$ x"
  const b = achar(doc, /^BOLETO$/i, de);
  if (b >= 0) {
    const v = R([doc.linhas[b + 1]?.texto, doc.linhas[b + 2]?.texto].join(" "));
    if (v) formas.push({ forma: "BOLETO", parcelas: 1, valor_parcela: v, valor_entrada: "", total: "", juros: false });
  }
  return formas;
}

function servicos(doc) {
  const t = doc.texto;
  return {
    logo_marca: servico(t, /LOGOMARCA|LOGO MARCA/i),
    pequenos_reparos: servico(t, /MARTELINHO|REPARO RAPIDO|PARA-?CHOQUE|ARRANH|LATARIA/i),
    roda_pneu: servico(t, /RODAS?,? PNEUS?|RODA E PNEU/i),
  };
}

export const portoAtual = {
  id: "porto-v1", nome: "Porto Seguro / Azul / Itaú",
  detecta: (doc) => /Orçamento de Seguro\s+v1\.0/.test(doc.texto) && /Dados da cotação/.test(doc.texto),
  ler(doc) {
    const seguradora = marca(doc.linhas.slice(0, 4).map((l) => l.texto).join(" "));
    const cot = depois(doc, /^Orçamento\s+Versão\s+Oferta\s+Realizado/);
    const ds = datas(cot?.texto);
    const op = depois(doc, /^Tipo de Operação/);
    const veic = depois(doc, /^Placa\s+Chassi\s+Veículo/);
    const vcel = veic?.celulas.find((c) => / - - /.test(c.s));
    const uso = depois(doc, /^Tipo de uso\s+CEP de pernoite/);
    const ant = depois(doc, /^Seguradora\s+Sucursal\s+Apólice/);

    const iCasco = achar(doc, /^(Compreensiva|Colisão|Incêndio|Roubo)/i);
    const casco = iCasco >= 0 ? doc.linhas[iCasco] : null;
    // "R$ 2.874,00 (25% da" nesta linha e "Obrigatória)" na seguinte
    const tipoFrq = casco ? (casco.texto.match(/\((\d+%\s*da)/i)?.[1] || "") + " " + (doc.linhas[iCasco + 1]?.texto.match(/(\S+)\)\s*$/)?.[1] || "") : "";
    const linhaDe = (re) => doc.linhas.find((l) => re.test(l.texto))?.texto || "";
    const iVid = achar(doc, /^Vidros$/);
    const vidros = iVid >= 0 ? [doc.linhas[iVid + 2]?.texto, doc.linhas[iVid + 3]?.texto, doc.linhas[iVid + 4]?.texto].join(" ") : "";
    const iAss = achar(doc, /^Assistências$/);
    const assist = iAss >= 0 ? doc.linhas[iAss + 2]?.texto || "" : "";
    const carro = linhaDe(/Carro Reserva/i);
    const premio = R(linhaDe(/^Valor total\s/));
    const morais = linhaDe(/Danos Morais/i), app = linhaDe(/Acidentes Pessoais|^APP/i);
    const defesa = linhaDe(/Custos de defesa/i);

    const o = opcao({
      nome: casco && /determinado/i.test(casco.texto) ? "Valor determinado" : "Valor de mercado",
      fipe: casco ? pct(casco.texto) : "",
      franquia: casco ? franquia(casco.texto, tipoFrq.trim()) : "NÃO SE APLICA",
      danos_materiais: R(linhaDe(/Danos Materiais/i)) || "NÃO CONTRATADO",
      danos_corporais: R(linhaDe(/Danos Corporais/i)) || "NÃO CONTRATADO",
      danos_morais: R(morais) || "NÃO CONTRATADO",
      app: R(app) ? `${R(app)} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: guincho(assist) || (assist ? up(assist.split("   ")[0]) : "NÃO CONTRATADO"),
      carro_reserva: carroReserva(carro) || "NÃO",
      vidros: rotuloVidros(vidros),
      outras_coberturas: defesa && !/não contratado/i.test(defesa) ? "CUSTOS DE DEFESA" : "",
      premio_total: premio,
      ...servicos(doc),
    });
    o.pagamentos = pagamentosPorto(doc, achar(doc, /^Formas de pagamento/i), premio);

    return extracao({
      segurado: cel(depois(doc, /^Segurado\(a\)\s+Nascimento/), 0),
      condutor: cel(depois(doc, /^Condutor\s+Nascimento/), 0),
      cep: cep(uso?.texto), uso: usoVeiculo(cel(uso, 0)),
      tipo: tipoSeguro(cel(op, 0)), bonus: (op?.texto.match(/Classe\s+(\d+)/i) || [])[1] || "",
      seguradora_anterior: /renova/i.test(cel(op, 0)) ? cel(ant, 0) : "",
      veiculo: vcel ? up(vcel.s.split(" - - ")[1]) : "", placa: placa(veic?.texto), ano_modelo: anoModelo(veic?.texto).replace("/", "/"),
      data_cotacao: ds[0] || "", validade_cotacao: ds[1] || "", vigencia_inicio: ds[2] || "", vigencia_fim: ds[3] || "",
      seguradoras: [{ seguradora, numero_cotacao: (cot?.texto.match(/^\d{8,}/) || [""])[0], opcoes: [o] }],
    });
  },
};

export const portoAntigo = {
  id: "porto-antigo", nome: "Porto Seguro / Azul / Itaú (formato antigo)",
  detecta: (doc) => /Orçamento de Seguro Auto/.test(doc.texto) && /PROPONENTE/.test(doc.texto),
  ler(doc) {
    const seguradora = marca(doc.linhas.slice(0, 8).map((l) => l.texto).join(" "));
    const linhaDe = (re) => doc.linhas.find((l) => re.test(l.texto))?.texto || "";
    const vig = depois(doc, /^Vigência\s+Bônus/);
    const veic = depois(doc, /^Veículo\s+Ano Fabricação/);
    const pl = depois(doc, /^Placa\s+Chassi\s+Fipe/);
    const op = depois(doc, /^Tipo de Operação/);
    const casco = linhaDe(/^COMPREENSIVA|^COLISÃO|^INCÊNDIO/i);
    const iVid = achar(doc, /^Vidros$/i);
    const vidros = iVid >= 0 ? [doc.linhas[iVid + 1]?.texto, doc.linhas[iVid + 2]?.texto].join(" ") : "";
    const premio = R(rx(doc, /Prêmio Total:\s*(R\$\s*[\d.,]+)/));
    const app = linhaDe(/ACIDENTES PESSOAIS PASSAGEIROS/i), morais = linhaDe(/DANOS MORAIS/i);
    const o = opcao({
      nome: /determinado/i.test(rx(doc, /opção escolhida foi indenização por ([^.]+)/i)) ? "Valor determinado" : "Valor de mercado",
      fipe: pct(casco),
      franquia: casco ? franquia(casco, rx(doc, /^Franquia:\s*(.+)$/m)) : "NÃO SE APLICA",
      danos_materiais: R(linhaDe(/RCF-V DANOS MATERIAIS/i)) || "NÃO CONTRATADO",
      danos_corporais: R(linhaDe(/RCF-V DANOS CORPORAIS/i)) || "NÃO CONTRATADO",
      danos_morais: R(morais) || "NÃO CONTRATADO",
      app: R(app) ? `${R(app)} POR PASSAGEIRO` : "NÃO CONTRATADO",
      guincho: guincho(linhaDe(/^ASSIST[ÊE]NCIA/i)) || "NÃO CONTRATADO",
      carro_reserva: carroReserva(linhaDe(/CARRO RESERVA/i)) || "NÃO",
      vidros: rotuloVidros(vidros),
      premio_total: premio,
      ...servicos(doc),
    });
    o.pagamentos = pagamentosPorto(doc, achar(doc, /^FORMAS DE PAGAMENTO/i), premio);
    const v = datas(vig?.texto);
    return extracao({
      segurado: cel(depois(doc, /^Proponente \/ Segurado/), 0),
      condutor: up(rx(doc, /Nome do principal Condutor:\s*(.+?)\s{2,}/i)),
      cep: cep(rx(doc, /CEP PERNOITE:\s*(\S+)/i)), uso: usoVeiculo(rx(doc, /Tipo do Uso:\s*(\S+)/i)),
      tipo: tipoSeguro(cel(op, 0)), bonus: (vig?.texto.match(/CLASSE\s+(\d+)/i) || [])[1] || "",
      veiculo: up((cel(veic, 0).split(" - - ")[1]) || cel(veic, 0)), placa: placa(cel(pl, 0)), ano_modelo: anoModelo(veic?.texto),
      data_cotacao: data(rx(doc, /Realizado em (\S+)/)), validade_cotacao: data(rx(doc, /Orçamento válido (\S+)/)),
      vigencia_inicio: v[0] || "", vigencia_fim: v[1] || "",
      seguradoras: [{ seguradora, numero_cotacao: rx(doc, /Orçamento:\s*([\d-]+)/), opcoes: [o] }],
    });
  },
};
