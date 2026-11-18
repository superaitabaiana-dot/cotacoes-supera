// Documento Supera em PDF (jsPDF), no modelo de apresentação pedido pela equipe (1.11): cabeçalho com os dados do
// cliente e do condutor, aviso de validade e, em blocos de até 3 seguradoras, a tabela
// "Coberturas básicas" (logomarca de cada seguradora no topo da coluna) seguida das formas de pagamento.
// Mantém a arte da Supera (cabeçalho, rodapé, azul-marinho e azul-céu).
// Todas as coordenadas estão em pixels da arte (2480 x 3508, A4 a 300 dpi).
/* global jspdf */
import { opcaoAtual, ordenadas } from "./consolidar.js";
import { fmtTel } from "./util.js";

const W = 2480, PW = 210, k = PW / W, PT = k * 72 / 25.4;
const NAVY = [11, 46, 131], SKY = [30, 143, 230], SKY_CLARO = [189, 219, 247], MIST = [238, 245, 253], LINHA = [214, 225, 240], SLATE = [91, 107, 140], BRANCO = [255, 255, 255];
const VERMELHO = [200, 30, 70]; // só o "✕" de cobertura não contratada
const X0 = 160, X1 = 2320;       // margens do conteúdo
const TOPO = 600;                // início do conteúdo depois do cabeçalho
const LIMITE_Y = 3190;           // a partir daqui começa o rodapé da arte

/** Dados fixos da Supera mostrados no cabeçalho (como no modelo). */
export const EMPRESA = { unidade: "ITABAIANA", cnpj: "42.027.498/0001-26", cidade: "Itabaiana - SE" };

// ---------- Imagens ----------
let IMG = null;
const LOGOS = {};
async function dataUrl(caminho) {
  const r = await fetch(caminho); if (!r.ok) throw new Error(caminho);
  const b = await r.blob();
  return new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
}
export async function carregarArte(base = "assets/") {
  if (!IMG) IMG = { cab: await dataUrl(base + "pdf_cabecalho.jpg"), rod: await dataUrl(base + "pdf_rodape.jpg") };
  return IMG;
}

/** Arquivo da logomarca (em assets/seguradoras/) pelo nome da seguradora; "" se não houver. */
const MARCAS = [[/mitsui|msig/i, "mitsui"], [/ita[uú]/i, "itau"], [/azul/i, "azul"], [/porto/i, "porto"], [/hdi/i, "hdi"], [/yelum/i, "yelum"], [/aliro/i, "aliro"],
  [/bradesco/i, "bradesco"], [/mapfre/i, "mapfre"], [/tokio/i, "tokio"], [/zurich/i, "zurich"], [/suhai/i, "suhai"], [/allianz/i, "allianz"]];
export function arquivoLogo(nome) { return MARCAS.find(([re]) => re.test(nome || ""))?.[1] || ""; }
async function carregarLogo(nome, base) {
  const a = arquivoLogo(nome); if (!a) return null;
  if (!(a in LOGOS)) LOGOS[a] = await dataUrl(`${base}seguradoras/${a}.png`).catch(() => null);
  return LOGOS[a];
}

// ---------- Primitivas ----------
function fonte(pdf, px, cor = NAVY, peso = "bold") { pdf.setFont("helvetica", peso); pdf.setFontSize(px * PT); pdf.setTextColor(...cor); }
function largura(pdf, t) { return pdf.getTextWidth(t) / k; }
function texto(pdf, t, x, y, { px = 32, cor = NAVY, peso = "bold", alinhar = "left", max = null } = {}) {
  if (!t) return;
  let s = px;
  if (max) { fonte(pdf, px, cor, peso); const w = largura(pdf, String(t)); if (w > max) s = Math.max(px * 0.6, px * max / w); }
  fonte(pdf, s, cor, peso); pdf.text(String(t), x * k, y * k, { align: alinhar });
}
function quebrar(pdf, t, maxPx, px, peso = "normal") { pdf.setFont("helvetica", peso); pdf.setFontSize(px * PT); return pdf.splitTextToSize(String(t || ""), maxPx * k); }
function caixa(pdf, x0, y0, x1, y1, { fundo = null, borda = null, raio = 0, linha = 3 } = {}) {
  if (fundo) pdf.setFillColor(...fundo);
  if (borda) { pdf.setDrawColor(...borda); pdf.setLineWidth(linha * k); }
  const modo = fundo && borda ? "FD" : fundo ? "F" : "S";
  if (raio) pdf.roundedRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, raio * k, raio * k, modo);
  else pdf.rect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, modo);
}
function traco(pdf, x0, y0, x1, y1, cor = LINHA, esp = 3) { pdf.setDrawColor(...cor); pdf.setLineWidth(esp * k); pdf.line(x0 * k, y0 * k, x1 * k, y1 * k); }
function xis(pdf, cx, cy, r = 17) { pdf.setLineCap("round"); traco(pdf, cx - r, cy - r, cx + r, cy + r, VERMELHO, 6); traco(pdf, cx - r, cy + r, cx + r, cy - r, VERMELHO, 6); }

// ---------- Textos ----------
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o", "em", "com", "no", "na", "por"]);
const SIGLAS = new Set(["qr", "pix", "c", "cc", "vmr", "rcf", "km"]);
/** "VALOR DE MERCADO" → "Valor de Mercado"; "DÉBITO/PIX" → "Débito/PIX"; "C/C" → "C/C". */
export function titulo(s) {
  return String(s || "").toLowerCase().split(/([\s/]+)/).map((p, i) => {
    if (/^[\s/]+$/.test(p) || !p) return p;
    if (SIGLAS.has(p)) return p.toUpperCase();
    return i && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1);
  }).join("");
}
/** "MARIA EXEMPLO DA SILVA" → "Maria Silva" (primeiro e último nome, como no modelo). */
export function saudacao(nome) {
  const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
  return titulo(p.length > 1 ? `${p[0]} ${p[p.length - 1]}` : p[0] || "");
}
/** Franquia só com o valor: "R$ 2.785,00 (25% DA BÁSICA)" → "R$ 2.785,00". Sem valor em R$, o texto como está. */
export function soValor(s) { const m = String(s || "").match(/R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/); return m ? m[0].replace(/R\$\s*/, "R$ ") : String(s || ""); }
/** FIPE: tira a descrição do casco entre parênteses, mas mantém restrições (só roubo, perda total). */
export function fipeDoc(s) {
  const t = String(s || ""); const m = t.match(/^(.*?)\s*\((.*)\)\s*$/);
  if (!m) return t;
  return /SÓ |ROUBO|PERDA TOTAL|INCÊNDIO/i.test(m[2]) ? t : m[1];
}
/** Cobertura marcada como não contratada no PDF (vira "✕"); vazio não é "não contratado" (fica "—"). */
export function naoContratado(s) { return /^(NÃO|NAO)(\s+CONTRATAD[OA])?$/i.test(String(s || "").trim()); }

/** Linhas da tabela "Coberturas básicas", na ordem do modelo (sem Produto, Cobertura, Tipo da franquia e APP). */
export const LINHAS_DOC = [
  ["premio_total", "Valor do seguro"],
  ["franquia", "Valor da franquia"],
  ["fipe", "Percentual Fipe/Valor determinado"],
  ["danos_materiais", "Danos Materiais a Terceiros"],
  ["danos_corporais", "Danos Corporais a Terceiros"],
  ["danos_morais", "Danos Morais a Terceiros"],
  ["guincho", "Assistência 24hrs"],
  ["vidros", "Vidros"],
  ["carro_reserva", "Carro Reserva"],
];
function valorDoc(chave, o) {
  const v = o[chave] || "";
  if (chave === "franquia") return soValor(v);
  if (chave === "fipe") return fipeDoc(v);
  return v;
}

/** Nome da coluna nas formas de pagamento: "Allianz - Completo" (a opção só quando a seguradora cotou mais de uma). */
function nomeComOpcao(s) {
  const o = opcaoAtual(s);
  const opc = s.opcoes.length > 1 ? String(o.nome || "").replace(/\s*\(.*$/, "").trim() : "";
  return opc ? `${s.nome} - ${titulo(opc)}` : s.nome;
}
/** Formas de pagamento de uma opção: [{ forma, planos: ["À vista R$ 2.000,00", "10x R$ 200,00", "12x R$ 190,00*"] }] ("*" = com juros). */
export function pagamentosDoc(o) {
  const grupos = new Map();
  for (const p of (o.pagamentos || []).filter((p) => p.sel !== false)) {
    const f = titulo(String(p.forma || "Pagamento").trim()); if (!grupos.has(f)) grupos.set(f, []); grupos.get(f).push(p);
  }
  return [...grupos].map(([forma, ps]) => ({
    forma,
    planos: ps.sort((a, b) => (+a.parcelas || 1) - (+b.parcelas || 1)).map((p) => {
      const n = Number(p.parcelas) || 1, v = p.valor_parcela || p.total || "";
      return n === 1 ? `À vista ${v}` : `${n}x ${v}${p.juros ? "*" : ""}${p.valor_entrada ? ` (1ª ${p.valor_entrada})` : ""}`;
    }),
  }));
}
/** Linhas a desenhar numa coluna: o nome da forma e, abaixo, os planos separados por "·", quebrados na largura. */
function linhasPagamentoDoc(pdf, o, larg) {
  const out = [];
  for (const g of pagamentosDoc(o)) {
    out.push({ t: g.forma, forma: true });
    // Junta os planos na mesma linha enquanto couberem; nunca quebra um plano ("10x R$ 368,42*") ao meio.
    fonte(pdf, T.pagPlano, NAVY, "normal");
    let atual = "";
    for (const pl of g.planos) {
      const t = atual ? `${atual}  ·  ${pl}` : pl;
      if (atual && largura(pdf, t) > larg) { out.push({ t: atual }); atual = pl; } else atual = t;
    }
    if (atual) out.push({ t: atual });
  }
  return out;
}

// ---------- Moldura das páginas ----------
function rodape(pdf, ctx) {
  caixa(pdf, 790, 3340, 1320, 3415, { fundo: BRANCO });
  texto(pdf, ctx.consultor, 161, 3392, { px: 42, max: 609 });
  texto(pdf, ctx.whatsapp ? fmtTel(ctx.whatsapp) + " · WhatsApp" : "", 802, 3392, { px: 46, max: 758 });
}
/** Cabeçalho da Supera + faixa da unidade (como no modelo: unidade, CNPJ, cidade, e-mail do consultor e ID). */
function moldura(pdf, ctx, nova) {
  if (nova) pdf.addPage();
  pdf.addImage(IMG.cab, "JPEG", 0, 0, PW, 345 * k, "cab", "FAST");
  pdf.addImage(IMG.rod, "JPEG", 0, 3240 * k, PW, 268 * k, "rod", "FAST");
  rodape(pdf, ctx);
  texto(pdf, EMPRESA.unidade, X0, 420, { px: 34 });
  texto(pdf, `CNPJ: ${EMPRESA.cnpj} | ${EMPRESA.cidade}`, X0, 466, { px: 26, cor: SLATE, peso: "normal" });
  if (ctx.email) texto(pdf, `E-mail: ${ctx.email}`, X0, 510, { px: 26, cor: SKY });
  if (ctx.identificacao) {
    fonte(pdf, 26, NAVY, "normal"); const w = largura(pdf, `ID: ${ctx.identificacao}`) + 70;
    caixa(pdf, X1 - w, 410, X1, 476, { fundo: MIST, borda: LINHA, raio: 33 });
    texto(pdf, `ID: ${ctx.identificacao}`, X1 - w / 2, 453, { px: 26, peso: "normal", alinhar: "center" });
  }
  traco(pdf, 0, 548, W, 548);
}

// ---------- Blocos da primeira página ----------
function abertura(pdf, dados, y) {
  const c = dados.comum, nome = saudacao(c.segurado);
  texto(pdf, "Olá,", X0, y, { px: 56 });
  fonte(pdf, 56, NAVY, "bold"); const w = largura(pdf, "Olá, ");
  texto(pdf, nome, X0 + w, y, { px: 56, cor: SKY, max: X1 - X0 - w });
  texto(pdf, "Confira as melhores opções para seu seguro", X0, y + 60, { px: 30, cor: SLATE, peso: "normal" });
  y += 150;
  const tipo = c.tipo === "RENOVACAO" ? "Renovação" : c.tipo === "NOVO" ? "Seguro novo" : "";
  const menor = /^S/i.test(c.cobertura_menor_25 || "") ? "Sim" : /^N/i.test(c.cobertura_menor_25 || "") ? "Não" : "";
  const grade = [
    [["Tipo de cotação:", tipo], ["Início/Fim vigência:", c.vigencia_inicio && c.vigencia_fim ? `${c.vigencia_inicio} - ${c.vigencia_fim}` : ""], ["CEP pernoite:", c.cep]],
    [["Segurado(a):", c.segurado], ["Condutor(a):", c.condutor], ["Marca/Modelo:", c.veiculo]],
    [["Menores de 25 anos na residência:", menor], ["Estado civil do condutor:", titulo(c.estado_civil)], ["Placa:", c.placa]],
  ];
  const larg = (X1 - X0) / 3;
  for (const linha of grade) {
    let alt = 1;
    linha.forEach(([rot, val], i) => {
      const x = X0 + i * larg;
      texto(pdf, rot, x, y, { px: 28, max: larg - 40 });
      const ls = quebrar(pdf, val || "—", larg - 40, 28).slice(0, 2); alt = Math.max(alt, ls.length);
      fonte(pdf, 28, SLATE, "normal"); ls.forEach((l, li) => pdf.text(l, x * k, (y + 44 + li * 36) * k));
    });
    y += 92 + alt * 36;
  }
  // Aviso de validade, com o triângulo do modelo nas cores da Supera.
  y += 10;
  caixa(pdf, X0, y, X1, y + 100, { fundo: MIST, raio: 20 });
  pdf.setDrawColor(...SKY); pdf.setLineWidth(5 * k); pdf.setLineJoin("round");
  pdf.triangle((X0 + 60) * k, (y + 26) * k, (X0 + 30) * k, (y + 76) * k, (X0 + 90) * k, (y + 76) * k, "S");
  texto(pdf, "!", X0 + 60, y + 70, { px: 30, cor: SKY, alinhar: "center" });
  const validade = c.validade_cotacao ? ` (cotação válida até ${c.validade_cotacao})` : "";
  texto(pdf, `Atenção: As informações e valores neste relatório podem sofrer alterações de acordo com a validade do cálculo${validade}.`, X0 + 130, y + 61, { px: 27, cor: SLATE, peso: "normal", max: X1 - X0 - 160 });
  return y + 150;
}

// ---------- Tabela por bloco de até 3 seguradoras ----------
const LARG_ROT = 520;
function colunas(n, total) { const w = (X1 - X0 - LARG_ROT) / (total >= 3 ? 3 : total); return Array.from({ length: n }, (_, i) => X0 + LARG_ROT + i * w + w / 2).map((cx) => ({ cx, w })); }

/** Número da cotação na seguradora, como está no PDF dela (vai abaixo da logo, como no modelo). */
export function idCotacao(s) { return s.numero ? `ID: ${s.numero}` : ""; }

function cabecalhoTabela(pdf, dados, bloco, cols, y, logos) {
  const temId = bloco.some((s) => s.numero), alt = temId ? 170 : 130;
  caixa(pdf, X0, y, X1, y + alt, { fundo: MIST });
  texto(pdf, "Coberturas básicas", X0 + 30, y + alt / 2 + 12, { px: 32 });
  bloco.forEach((s, i) => {
    const { cx, w } = cols[i], logo = logos[i];
    traco(pdf, cx - w / 2, y, cx - w / 2, y + alt, BRANCO, 4);
    const caixaH = 84, topo = temId ? y + 22 : y + (alt - caixaH) / 2; // logo menor; com o ID, sobe para dar lugar a ele
    if (logo) {
      const p = pdf.getImageProperties(logo), esc = Math.min(Math.min(w - 180, 340) / p.width, caixaH / p.height);
      const lw = p.width * esc, lh = p.height * esc;
      pdf.addImage(logo, "PNG", (cx - lw / 2) * k, (topo + (caixaH - lh) / 2) * k, lw * k, lh * k, "logo-" + arquivoLogo(s.nome), "FAST");
    } else texto(pdf, s.nome, cx, topo + caixaH / 2 + 12, { px: 36, alinhar: "center", max: w - 60 });
    if (s.numero) texto(pdf, idCotacao(s), cx, y + alt - 24, { px: 24, cor: SLATE, peso: "normal", alinhar: "center", max: w - 60 });
  });
  traco(pdf, X0, y + alt, X1, y + alt, LINHA, 4);
  return y + alt;
}

const T = { rot: 30, val: 32, preco: 38, passo: 42, pagForma: 26, pagPlano: 30, pagPasso: 40 }; // tamanhos (px da arte)
function linhaTabela(pdf, rotulo, celulas, cols, y, { destaque = false } = {}) {
  const rotLs = quebrar(pdf, rotulo, LARG_ROT - 60, T.rot, "bold");
  const px = destaque ? T.preco : T.val, peso = destaque ? "bold" : "normal";
  const vals = celulas.map((v, i) => (naoContratado(v) ? null : quebrar(pdf, v || "—", cols[i].w - 50, px, peso).slice(0, 3)));
  const n = Math.max(rotLs.length, ...vals.map((v) => (v ? v.length : 1)));
  const alt = Math.max(100, 50 + n * T.passo), meioL = (ls) => (ls.length - 1) * T.passo / 2;
  return {
    alt,
    desenhar(yy) {
      const meio = yy + alt / 2;
      fonte(pdf, T.rot, NAVY, "bold"); rotLs.forEach((l, i) => pdf.text(l, (X0 + 30) * k, (meio + 11 - meioL(rotLs) + i * T.passo) * k));
      vals.forEach((ls, i) => {
        const { cx } = cols[i];
        if (!ls) return xis(pdf, cx, meio);
        fonte(pdf, px, destaque ? SKY : NAVY, peso);
        ls.forEach((l, li) => pdf.text(l, cx * k, (meio + 12 - meioL(ls) + li * T.passo) * k, { align: "center" }));
      });
      traco(pdf, X0, yy + alt, X1, yy + alt);
    },
  };
}

/** Formas de pagamento do bloco. Se não couber, continua na página seguinte com o cabeçalho repetido. */
function blocoPagamentos(pdf, bloco, cols, y, novaPagina) {
  const nomes = bloco.map((s, i) => quebrar(pdf, nomeComOpcao(s), cols[i].w - 50, 30, "bold").slice(0, 3));
  const altCab = Math.max(110, 50 + Math.max(...nomes.map((n) => n.length)) * 38);
  const listas = bloco.map((s, i) => linhasPagamentoDoc(pdf, opcaoAtual(s), cols[i].w - 50));
  const total = Math.max(1, ...listas.map((l) => l.length));
  const cab = (yy, cont) => {
    caixa(pdf, X0, yy, X1, yy + altCab, { fundo: MIST });
    const rot = quebrar(pdf, cont ? "Formas de pagamento (continuação)" : "Formas de pagamento", LARG_ROT - 60, 30, "bold");
    rot.forEach((l, i) => texto(pdf, l, X0 + 30, yy + altCab / 2 + 11 - (rot.length - 1) * 19 + i * 38, { px: 30 }));
    bloco.forEach((s, i) => {
      traco(pdf, cols[i].cx - cols[i].w / 2, yy, cols[i].cx - cols[i].w / 2, yy + altCab, BRANCO, 4);
      fonte(pdf, 30, NAVY, "bold"); nomes[i].forEach((l, li) => pdf.text(l, cols[i].cx * k, (yy + altCab / 2 + 11 - (nomes[i].length - 1) * 19 + li * 38) * k, { align: "center" }));
    });
    traco(pdf, X0, yy + altCab, X1, yy + altCab, LINHA, 4);
    return yy + altCab + 55;
  };
  // Começa em página nova só se não couberem o cabeçalho e 4 linhas.
  if (y + altCab + 55 + 4 * T.pagPasso > LIMITE_Y) y = novaPagina();
  y = cab(y, false);
  for (let li = 0; li < total; li++) {
    if (y + T.pagPasso > LIMITE_Y - 20) { y = cab(novaPagina(), true); }
    listas.forEach((ls, i) => {
      const l = ls[li];
      if (!ls.length && li === 0) return texto(pdf, "—", cols[i].cx, y, { px: T.pagPlano, cor: SLATE, peso: "normal", alinhar: "center" });
      if (l) texto(pdf, l.t, cols[i].cx, y, { px: l.forma ? T.pagForma : T.pagPlano, cor: l.forma ? SLATE : NAVY, peso: l.forma ? "bold" : "normal", alinhar: "center", max: cols[i].w - 40 });
    });
    y += T.pagPasso;
  }
  y += 5;
  traco(pdf, X0, y, X1, y);
  if (y + 60 > LIMITE_Y) y = novaPagina() - 50;
  texto(pdf, "Parcelas com juros terão o símbolo * indicado ao lado do valor", X0, y + 50, { px: 26, cor: SLATE, peso: "normal" });
  return y + 140;
}

// ---------- Documento ----------
/**
 * Gera o documento completo.
 * @param ctx { consultor, whatsapp, email, identificacao, base } textos do cabeçalho e do rodapé
 * @param ctx.omitir Set de chaves de página que não entram no PDF (seletor de páginas)
 * @returns { blob, paginas: [{ chave, rotulo, detalhe }] } com todas as páginas montadas, omitidas ou não
 */
export async function gerarDocumento(dados, ctx) {
  const base = ctx.base || "assets/";
  await carregarArte(base);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const segs = ordenadas(dados);
  const nomesPorPagina = [new Set()];
  const novaPagina = () => { moldura(pdf, ctx, true); nomesPorPagina.push(new Set()); return TOPO; };

  moldura(pdf, ctx, false);
  let y = abertura(pdf, dados, 640);
  for (let b = 0; b < segs.length; b += 3) {
    const bloco = segs.slice(b, b + 3), cols = colunas(bloco.length, segs.length);
    const logos = await Promise.all(bloco.map((s) => carregarLogo(s.nome, base)));
    const linhas = LINHAS_DOC.map(([chave, rot]) => linhaTabela(pdf, rot, bloco.map((s) => valorDoc(chave, opcaoAtual(s))), cols, 0, { destaque: chave === "premio_total" }));
    // Começa o bloco numa página nova se não couberem o cabeçalho e ao menos 3 linhas.
    if (y + 170 + linhas.slice(0, 3).reduce((a, l) => a + l.alt, 0) > LIMITE_Y) y = novaPagina();
    y = cabecalhoTabela(pdf, dados, bloco, cols, y, logos);
    bloco.forEach((s) => nomesPorPagina.at(-1).add(s.nome));
    for (const l of linhas) {
      if (y + l.alt > LIMITE_Y) { y = novaPagina(); y = cabecalhoTabela(pdf, dados, bloco, cols, y, logos); bloco.forEach((s) => nomesPorPagina.at(-1).add(s.nome)); }
      l.desenhar(y); y += l.alt;
    }
    y = blocoPagamentos(pdf, bloco, cols, y + 50, () => { const t = novaPagina(); bloco.forEach((s) => nomesPorPagina.at(-1).add(s.nome)); return t; });
  }

  const n = pdf.getNumberOfPages();
  const paginas = nomesPorPagina.map((ns, i) => ({ chave: `pagina-${i + 1}`, rotulo: n > 1 ? `Página ${i + 1} de ${n}` : "Página única", detalhe: [...ns].join(", ") }));
  const omitir = ctx.omitir || new Set();
  if (paginas.every((p) => omitir.has(p.chave))) throw new Error("Selecione ao menos uma página para o PDF.");
  for (let i = paginas.length; i >= 1; i--) if (omitir.has(paginas[i - 1].chave)) pdf.deletePage(i); // de trás para a frente: a numeração não muda
  pdf.setProperties({ title: "Cotação Seguro Auto - Supera", creator: "Supera Seguros e Planejamento" });
  return { blob: pdf.output("blob"), paginas };
}

export function nomeArquivo(dados, codigo, versao) {
  const base = ["Cotacao_Supera", codigo, dados.comum.segurado || "Cliente", versao ? "v" + versao : ""].filter(Boolean).join("_");
  return base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 100) + ".pdf";
}
