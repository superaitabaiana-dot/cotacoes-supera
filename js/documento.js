// Documento Supera em PDF (jsPDF): página de comparativo + uma página no layout B por seguradora.
// Todas as coordenadas estão em pixels da arte (2480 x 3508, A4 a 300 dpi), como no SPEC da v5.
/* global jspdf */
import { compararCoberturas, linhasPagamento, melhorParcelamento, opcaoAtual, ordenadas, preco } from "./consolidar.js";
import { brl, fmtTel } from "./util.js";

const W = 2480, H = 3508, PW = 210, PH = 297, k = PW / W, PT = k * 72 / 25.4;
const NAVY = [11, 46, 131], SKY = [30, 143, 230], SKY_CLARO = [189, 219, 247], MIST = [238, 245, 253], LINHA = [214, 225, 240], SLATE = [91, 107, 140], BRANCO = [255, 255, 255];
const LIMITE_Y = 3190; // a partir daqui começa o rodapé da arte

// ---------- Imagens da arte ----------
let IMG = null;
async function dataUrl(caminho) {
  const r = await fetch(caminho); const b = await r.blob();
  return new Promise((ok) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(b); });
}
export async function carregarArte(base = "assets/") {
  if (!IMG) IMG = {
    arte: await dataUrl(base + "arte_supera_layout_B.png"),
    cab: await dataUrl(base + "pdf_cabecalho.jpg"),
    rod: await dataUrl(base + "pdf_rodape.jpg"),
  };
  return IMG;
}

// ---------- Primitivas ----------
function fonte(pdf, px, cor = NAVY, peso = "bold") { pdf.setFont("helvetica", peso); pdf.setFontSize(px * PT); pdf.setTextColor(...cor); }
function largura(pdf, t) { return pdf.getTextWidth(t) / k; } // em px da arte, com a fonte atual
function caber(pdf, t, maxPx, px, peso = "bold") { pdf.setFont("helvetica", peso); pdf.setFontSize(px * PT); const w = largura(pdf, t); return w > maxPx ? Math.max(px * 0.55, px * maxPx / w) : px; }
function texto(pdf, t, x, y, { px = 40, cor = NAVY, peso = "bold", max = null, alinhar = "left", espaco = 0 } = {}) {
  if (!t) return;
  const s = max ? caber(pdf, t, max - espaco * String(t).length, px, peso) : px;
  fonte(pdf, s, cor, peso);
  const opt = { align: alinhar }; if (espaco) opt.charSpace = espaco * (s / px) * k;
  pdf.text(String(t), x * k, y * k, opt);
}
function linhas(pdf, t, maxPx, px, peso = "normal") { pdf.setFont("helvetica", peso); pdf.setFontSize(px * PT); return pdf.splitTextToSize(String(t || ""), maxPx * k); }
function caixa(pdf, x0, y0, x1, y1, { fundo = null, borda = null, raio = 0 } = {}) {
  if (fundo) pdf.setFillColor(...fundo);
  if (borda) { pdf.setDrawColor(...borda); pdf.setLineWidth(3 * k); }
  const modo = fundo && borda ? "FD" : fundo ? "F" : "S";
  if (raio) pdf.roundedRect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, raio * k, raio * k, modo);
  else pdf.rect(x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k, modo);
}
function titulo(pdf, t, y) { texto(pdf, t.toUpperCase(), 160, y, { px: 38, espaco: 5 }); }

// ---------- Rodapé comum (consultor, WhatsApp, identificação) ----------
const PHONE_COVER = [790, 3340, 1320, 3415];
function rodape(pdf, ctx) {
  caixa(pdf, ...PHONE_COVER, { fundo: BRANCO });
  texto(pdf, ctx.consultor, 161, 3392, { px: 42, max: 609 });
  texto(pdf, ctx.whatsapp ? fmtTel(ctx.whatsapp) + " · WhatsApp" : "", 802, 3392, { px: 46, max: 758 });
  if (ctx.identificacao) texto(pdf, ctx.identificacao, 2320, 3484, { px: 22, cor: SLATE, peso: "normal", alinhar: "right" });
}

// ---------- Página de comparativo ----------
function paginaComparativo(pdf, ctx, nova) {
  if (nova) pdf.addPage();
  pdf.addImage(IMG.cab, "JPEG", 0, 0, PW, 345 * k, "cab", "FAST");
  if (!nova) caixa(pdf, 0, 344, W, 580, { fundo: MIST });
  pdf.addImage(IMG.rod, "JPEG", 0, 3240 * k, PW, 268 * k, "rod", "FAST");
  rodape(pdf, ctx);
}

function cartaoCliente(pdf, dados, segs) {
  const c = dados.comum, y0 = 380, y1 = 700, meio = 540;
  caixa(pdf, 160, y0, 2320, y1, { fundo: BRANCO, borda: LINHA, raio: 28 });
  caixa(pdf, 160, y0, 860, y1, { fundo: NAVY, raio: 28 });
  caixa(pdf, 820, y0, 860, y1, { fundo: NAVY });
  texto(pdf, "COMPARATIVO DE", 219, 500, { px: 30, cor: SKY_CLARO, espaco: 4 });
  texto(pdf, `${segs.length} SEGURADORAS`, 219, 600, { px: 64, cor: BRANCO, max: 600 });
  pdf.setDrawColor(...LINHA); pdf.setLineWidth(3 * k); pdf.line(860 * k, meio * k, 2320 * k, meio * k); pdf.line(1590 * k, y0 * k, 1590 * k, y1 * k);
  const cel = (x, y, rot, val, max) => { texto(pdf, rot, x, y, { px: 28, cor: SLATE, espaco: 3 }); texto(pdf, val, x, y + 66, { px: 40, max }); };
  cel(926, 440, "SEGURADO", c.segurado, 620);
  cel(1650, 440, "VEÍCULO E PLACA", [c.veiculo, c.placa].filter(Boolean).join(" - "), 640);
  cel(926, 600, "VIGÊNCIA DO SEGURO", c.vigencia_inicio && c.vigencia_fim ? `${c.vigencia_inicio} a ${c.vigencia_fim}` : "", 620);
  cel(1650, 600, "COTADO EM · VÁLIDO ATÉ", [c.data_cotacao, c.validade_cotacao].filter(Boolean).join(" · "), 640);
}

/** Nome curto da opção escolhida, só quando a seguradora cotou mais de uma; o que vem entre parênteses não cabe no documento. */
function nomeOpcao(s) {
  return s.opcoes.length > 1 ? String(opcaoAtual(s).nome || "").replace(/\s*\(.*$/, "").trim().toUpperCase() : "";
}

function barrasPreco(pdf, dados, segs, y) {
  titulo(pdf, "Preço total por seguradora", y);
  texto(pdf, "Do menor para o maior preço. O comprimento das barras é proporcional ao valor.", 160, y + 52, { px: 28, cor: SLATE, peso: "normal" });
  const precos = segs.map(preco).filter((v) => !isNaN(v));
  const max = Math.max(...precos, 1), menor = Math.min(...precos);
  const x0 = 760, larg = 1220, alt = 46, passo = segs.length > 7 ? 104 : 124;
  let yy = y + 130;
  for (const s of segs) {
    const p = preco(s), rec = s.id === dados.recomendada, eMenor = p === menor;
    texto(pdf, s.nome, 160, yy, { px: 40, max: 570 });
    texto(pdf, melhorParcelamento(opcaoAtual(s)), 160, yy + 40, { px: 26, cor: SLATE, peso: "normal", max: 570 });
    caixa(pdf, x0, yy - 34, x0 + larg, yy - 34 + alt, { fundo: MIST, raio: 23 });
    if (!isNaN(p)) {
      const w = Math.max(alt, larg * p / max);
      caixa(pdf, x0, yy - 34, x0 + w, yy - 34 + alt, { fundo: rec ? NAVY : eMenor ? SKY : SKY_CLARO, raio: 23 });
      const selo = rec ? "RECOMENDADA" : eMenor ? "MENOR PREÇO" : "";
      if (selo && w > 330) texto(pdf, selo, x0 + 24, yy - 2, { px: 24, cor: BRANCO, espaco: 3 });
    }
    texto(pdf, isNaN(p) ? "sem preço" : brl(p), 2320, yy, { px: 44, alinhar: "right", cor: isNaN(p) ? SLATE : NAVY });
    yy += passo;
  }
  return yy - 40;
}

const ROTULO_CURTO = { app: "APP", guincho: "Assistência", outras_coberturas: "Outras", servicos: "Serviços" };
function tabelaCoberturas(pdf, dados, segs, diferentes, y, ctx) {
  if (!diferentes.length) return y;
  const POR_TABELA = 5;
  for (let i = 0; i < diferentes.length; i += POR_TABELA) {
    const cols = diferentes.slice(i, i + POR_TABELA);
    const xNome = 160, larNome = 400, xIni = xNome + larNome, larCol = (2320 - xIni) / cols.length;
    const alturas = segs.map((s, si) => Math.max(1, ...cols.map((c) => linhas(pdf, c.valores[si] || "—", larCol - 50, 30).length)));
    const total = 150 + 72 + alturas.reduce((a, h) => a + Math.max(84, 24 + h * 38), 0);
    if (y + total > LIMITE_Y) { paginaComparativo(pdf, ctx, true); y = 440; }
    titulo(pdf, i === 0 ? "Coberturas que mudam entre as seguradoras" : "Coberturas que mudam (continuação)", y);
    let yy = y + 50;
    caixa(pdf, 160, yy, 2320, yy + 72, { fundo: NAVY, raio: 18 });
    caixa(pdf, 160, yy + 40, 2320, yy + 72, { fundo: NAVY });
    texto(pdf, "SEGURADORA", xNome + 40, yy + 47, { px: 24, cor: BRANCO, espaco: 3 });
    cols.forEach((c, j) => texto(pdf, (ROTULO_CURTO[c.k] || c.rotulo).toUpperCase(), xIni + j * larCol + 25, yy + 47, { px: 24, cor: BRANCO, espaco: 3, max: larCol - 40 }));
    yy += 72;
    segs.forEach((s, si) => {
      const h = Math.max(84, 24 + alturas[si] * 38);
      if (si % 2 === 1) caixa(pdf, 160, yy, 2320, yy + h, { fundo: MIST });
      if (s.id === dados.recomendada) caixa(pdf, 160, yy, 172, yy + h, { fundo: SKY });
      texto(pdf, s.nome, xNome + 40, yy + 54, { px: 32, max: larNome - 60 });
      cols.forEach((c, j) => {
        fonte(pdf, 30, NAVY, "normal");
        const ls = linhas(pdf, c.valores[si] || "—", larCol - 50, 30);
        ls.forEach((l, li) => pdf.text(l, (xIni + j * larCol + 25) * k, (yy + 54 + li * 38) * k));
      });
      yy += h;
    });
    caixa(pdf, 160, yy, 2320, yy + 3, { fundo: LINHA });
    y = yy + 110;
  }
  return y;
}

function iguais(pdf, itens, y, ctx) {
  if (!itens.length) return y;
  const linhasN = Math.ceil(itens.length / 2), alt = 120 + linhasN * 104;
  if (y + alt > LIMITE_Y) { paginaComparativo(pdf, ctx, true); y = 440; }
  titulo(pdf, "Iguais em todas as seguradoras", y);
  caixa(pdf, 160, y + 40, 2320, y + 40 + alt - 60, { fundo: MIST, raio: 28 });
  itens.forEach((it, i) => {
    const col = i % 2, lin = Math.floor(i / 2), x = col ? 1270 : 220, yy = y + 130 + lin * 104;
    texto(pdf, it.rotulo, x, yy, { px: 28, cor: SLATE, peso: "normal" });
    texto(pdf, it.valor, x, yy + 44, { px: 34, max: 1000 });
  });
  return y + alt + 60;
}

function recomendacao(pdf, dados, y, ctx) {
  const s = dados.seguradoras.find((x) => x.id === dados.recomendada && x.incluir);
  if (!s) return y;
  const nota = linhas(pdf, dados.nota || "", 1960, 32);
  const alt = 230 + nota.length * 44;
  if (y + alt > LIMITE_Y) { paginaComparativo(pdf, ctx, true); y = 440; }
  caixa(pdf, 160, y, 2320, y + alt, { fundo: NAVY, raio: 28 });
  texto(pdf, "RECOMENDAÇÃO DO SEU CONSULTOR", 220, y + 80, { px: 28, cor: SKY_CLARO, espaco: 4 });
  texto(pdf, `${s.nome} · ${opcaoAtual(s).premio_total || ""}`, 220, y + 170, { px: 64, cor: BRANCO, max: 2040 });
  fonte(pdf, 32, BRANCO, "normal");
  nota.forEach((l, i) => pdf.text(l, 220 * k, (y + 240 + i * 44) * k));
  return y + alt + 90;
}

const GLOSSARIO = [
  ["Franquia", "Parte do conserto que fica por sua conta em um dano parcial. Não é cobrada em roubo, furto ou perda total."],
  ["FIPE", "Percentual da tabela FIPE que a seguradora paga se o carro for roubado ou tiver perda total."],
  ["Danos materiais e corporais", "Pagam o prejuízo que você causar a outras pessoas: no carro e nos bens delas, e em ferimentos."],
  ["Acidentes pessoais (APP)", "Indenização para quem está no seu carro em caso de morte ou invalidez por acidente."],
  ["Assistência", "Guincho, chaveiro, pane seca e outros serviços 24 horas. O limite em km é a distância do reboque."],
  ["Carro reserva", "Carro emprestado enquanto o seu está na oficina por um sinistro coberto."],
];
function glossario(pdf, y, ctx) {
  const alt = 120 + 3 * 150;
  if (y + alt > LIMITE_Y) { paginaComparativo(pdf, ctx, true); y = 440; }
  titulo(pdf, "Como ler este comparativo", y);
  GLOSSARIO.forEach(([t, d], i) => {
    const x = i % 2 ? 1270 : 160, yy = y + 90 + Math.floor(i / 2) * 150;
    texto(pdf, t, x, yy, { px: 30 });
    fonte(pdf, 26, SLATE, "normal");
    linhas(pdf, d, 1000, 26).slice(0, 3).forEach((l, li) => pdf.text(l, x * k, (yy + 40 + li * 34) * k));
  });
  return y + alt;
}

// ---------- Página no layout B (v5) ----------
const SPEC = [
  { k: "seguradora", x0: 219, x1: 850, y: 615, s: 64, c: BRANCO },
  { k: "tipo_txt", x0: 926, x1: 1360, y: 525, s: 44 }, { k: "data_cotacao", x0: 1408, x1: 1840, y: 525, s: 44 },
  { k: "validade_cotacao", x0: 1887, x1: 2320, y: 525, s: 44 }, { k: "vencimento", x0: 926, x1: 1360, y: 678, s: 44 },
  { k: "vigencia_inicio", x0: 1462, x1: 1795, y: 676, s: 40 }, { k: "vigencia_fim", x0: 1838, x1: 2320, y: 676, s: 40 },
  { k: "segurado", x0: 207, x1: 1190, y: 985, s: 44 }, { k: "cep", x0: 207, x1: 1190, y: 1123, s: 44 }, { k: "uso", x0: 207, x1: 1190, y: 1262, s: 44 },
  { k: "veiculo", x0: 1306, x1: 2290, y: 985, s: 44 }, { k: "condutor", x0: 1306, x1: 2290, y: 1123, s: 44 }, { k: "estado_civil", x0: 1306, x1: 2290, y: 1262, s: 44 },
  { k: "fipe", x0: 1011, x1: 2290, y: 1564, s: 42 }, { k: "franquia", x0: 1011, x1: 2290, y: 1645, s: 42 },
  { k: "danos_materiais", x0: 1011, x1: 2290, y: 1725, s: 42 }, { k: "danos_corporais", x0: 1011, x1: 2290, y: 1805, s: 42 },
  { k: "danos_morais", x0: 1011, x1: 2290, y: 1885, s: 42 }, { k: "app", x0: 1011, x1: 2290, y: 1965, s: 42 },
  { k: "guincho", x0: 1011, x1: 2290, y: 2045, s: 42 }, { k: "carro_reserva", x0: 1011, x1: 2290, y: 2125, s: 42 },
  { k: "menor25", x0: 1011, x1: 2290, y: 2205, s: 42 }, { k: "vidros", x0: 1011, x1: 2290, y: 2285, s: 42 },
  { k: "outras", x0: 207, x1: 2290, y: 2405, s: 38 },
  { k: "total", x0: 1040, x1: 2300, y: 2800, s: 112, c: BRANCO, a: "center" },
];
const CHECKS = { logo_marca: [225, 2638], pequenos_reparos: [225, 2774], roda_pneu: [225, 2910] };
const CHECK_HALF = 36, BULLETS = [[216, 3100], [216, 3180]], PAY_BG = [238, 245, 253], SKY_B = [11, 140, 235];

function payLayout(lines) {
  if (lines.length <= 2) return { cover: lines.length < 2 ? [BULLETS[1]] : [], items: lines.map((t, i) => ({ t, x0: 252, x1: 2290, y: [3116, 3196][i], s: 40, b: null })) };
  const cols = lines.length > 4 ? 2 : 1, rows = Math.ceil(lines.length / cols), pitch = Math.min(76, 150 / rows + (rows <= 2 ? 20 : 0)), s = Math.min(36, pitch * 0.8);
  const top = 3062;
  return { cover: BULLETS, items: lines.map((t, i) => {
    const c = Math.floor(i / rows), r = i % rows, x = cols === 1 ? 232 : (c === 0 ? 232 : 1260), y = top + s + r * pitch;
    return { t, x0: x + 22, x1: cols === 1 ? 2290 : (c === 0 ? 1230 : 2290), y, s, b: [x, y - s * 0.35] };
  }) };
}

function valoresLayoutB(dados, s) {
  const c = dados.comum, o = opcaoAtual(s);
  return {
    seguradora: s.nome.toUpperCase(),
    tipo_txt: c.tipo === "NOVO" ? "SEGURO NOVO" : c.tipo === "RENOVACAO" ? "RENOVAÇÃO" : "",
    data_cotacao: c.data_cotacao, validade_cotacao: c.validade_cotacao,
    vencimento: c.tipo === "NOVO" ? "—" : (c.vencimento_anterior || c.vigencia_inicio || ""),
    vigencia_inicio: c.vigencia_inicio, vigencia_fim: c.vigencia_fim,
    segurado: c.segurado, cep: c.cep, uso: c.uso,
    veiculo: [c.veiculo, c.placa].filter(Boolean).join(" - "), condutor: c.condutor, estado_civil: c.estado_civil,
    fipe: o.fipe, franquia: o.franquia, danos_materiais: o.danos_materiais, danos_corporais: o.danos_corporais,
    danos_morais: o.danos_morais, app: o.app, guincho: o.guincho, carro_reserva: o.carro_reserva,
    menor25: c.cobertura_menor_25, vidros: o.vidros, outras: o.outras_coberturas, total: o.premio_total,
    pay: linhasPagamento(o).slice(0, 8),
    logo_marca: o.logo_marca === true, pequenos_reparos: o.pequenos_reparos === true, roda_pneu: o.roda_pneu === true,
  };
}

function paginaLayoutB(pdf, dados, s, ctx, nova) {
  if (nova) pdf.addPage();
  pdf.addImage(IMG.arte, "PNG", 0, 0, PW, PH, "arteB", "FAST");
  const v = valoresLayoutB(dados, s);
  rodape(pdf, ctx);
  const PL = payLayout(v.pay);
  pdf.setFillColor(...PAY_BG); for (const [bx, by] of PL.cover) pdf.circle(bx * k, by * k, 16 * k, "F");
  for (const it of PL.items) {
    if (it.b) { pdf.setFillColor(...SKY_B); pdf.circle(it.b[0] * k, it.b[1] * k, 8 * k, "F"); }
    texto(pdf, it.t, it.x0, it.y, { px: it.s, max: it.x1 - it.x0 });
  }
  for (const f of SPEC) {
    const t = v[f.k]; if (!t) continue;
    if (f.a === "center") texto(pdf, t, (f.x0 + f.x1) / 2, f.y, { px: f.s, cor: f.c || NAVY, max: f.x1 - f.x0, alinhar: "center" });
    else texto(pdf, t, f.x0, f.y, { px: f.s, cor: f.c || NAVY, max: f.x1 - f.x0 });
  }
  const opc = nomeOpcao(s), recomendada = s.id === dados.recomendada;
  if (opc) texto(pdf, `OPÇÃO: ${opc}`, 219, recomendada ? 660 : 672, { px: 26, cor: BRANCO, max: 620 });
  if (recomendada) texto(pdf, "RECOMENDADA PELO SEU CONSULTOR", 219, opc ? 698 : 680, { px: 24, cor: SKY_CLARO, espaco: 3, max: 620 });
  for (const [kk, [x, y]] of Object.entries(CHECKS)) {
    if (!v[kk]) continue;
    pdf.setFillColor(...NAVY); pdf.roundedRect((x - CHECK_HALF) * k, (y - CHECK_HALF) * k, 2 * CHECK_HALF * k, 2 * CHECK_HALF * k, 14 * k, 14 * k, "F");
    pdf.setDrawColor(255, 255, 255); pdf.setLineWidth(8 * k); pdf.setLineCap("round"); pdf.setLineJoin("round");
    pdf.lines([[12 * k, 12 * k], [24 * k, -28 * k]], (x - 17) * k, (y + 2) * k, [1, 1], "S", false);
  }
}

/**
 * Gera o documento completo.
 * @param ctx { consultor, whatsapp, identificacao } textos do rodapé
 * @param ctx.omitir Set de chaves de página que não entram no PDF (seletor de páginas)
 * @returns { blob, paginas: [{ chave, rotulo, detalhe }] } com todas as páginas montadas, omitidas ou não
 */
export async function gerarDocumento(dados, ctx) {
  await carregarArte(ctx.base);
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const segs = ordenadas(dados);
  const paginas = [];
  let primeira = true;
  if (segs.length > 1) {
    const cmp = compararCoberturas(dados);
    paginaComparativo(pdf, ctx, false);
    cartaoCliente(pdf, dados, segs);
    let y = barrasPreco(pdf, dados, segs, 820) + 90;
    y = recomendacao(pdf, dados, y, ctx);
    y = tabelaCoberturas(pdf, dados, segs, cmp.diferentes, y, ctx);
    y = iguais(pdf, cmp.iguais, y, ctx);
    glossario(pdf, y, ctx);
    primeira = false;
    const n = pdf.getNumberOfPages();
    for (let i = 1; i <= n; i++) paginas.push({ chave: `comparativo-${i}`, rotulo: n > 1 ? `Comparativo (${i} de ${n})` : "Comparativo", detalhe: "" });
  }
  for (const s of segs) {
    paginaLayoutB(pdf, dados, s, ctx, !primeira); primeira = false;
    paginas.push({ chave: `seguradora-${s.id}`, rotulo: s.nome, detalhe: opcaoAtual(s).premio_total || "" });
  }
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
