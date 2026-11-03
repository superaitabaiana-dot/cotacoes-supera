// Leitura por OCR, no navegador, de PDFs sem texto. Caso comum: "Microsoft Print to PDF", que grava cada letra
// como desenho vetorial (o PDF tem zero caracteres). Cada página é desenhada em alta resolução, as linhas de grade
// das tabelas são apagadas e o tesseract.js (português) reconhece as palavras com a posição de cada uma.
// O resultado tem o mesmo formato de lerPdf ({ texto, linhas }), então os leitores por seguradora funcionam igual.
// Nada sai do navegador: só o programa do OCR e o dicionário de português são baixados do CDN (jsDelivr).
/* global pdfjsLib, Tesseract */
import { montarLinhas } from "./pdf-linhas.js";

const TESSERACT_JS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
export const ESCALA_OCR = 4; // ~288 dpi: letras nítidas em PDF vetorial

let carregando = null;
function carregarTesseract() {
  if (window.Tesseract) return Promise.resolve();
  carregando ||= new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = TESSERACT_JS; s.onload = ok;
    s.onerror = () => { carregando = null; falha(new Error("Não foi possível carregar o leitor de imagem (OCR). Verifique a internet e tente de novo.")); };
    document.head.append(s);
  });
  return carregando;
}

/**
 * Apaga linhas finas e longas (bordas de tabela) de uma imagem em tons de cinza, sem tocar em caixas preenchidas.
 * Puro, para poder ser testado fora do navegador.
 * @param cinza Uint8ClampedArray com um byte por pixel (0 = preto); é alterado no lugar
 */
export function apagarGrade(cinza, w, h, { escuro = 170, minH = 40 * ESCALA_OCR, minV = 30 * ESCALA_OCR, espessura = 2 * ESCALA_OCR } = {}) {
  const linha = new Uint8Array(w * h);
  const marcar = (i0, passo, n, min, bit) => { // runs de pixels escuros ao longo de uma linha ou coluna
    let ini = -1;
    for (let k = 0; k <= n; k++) {
      const esc = k < n && cinza[i0 + k * passo] < escuro;
      if (esc && ini < 0) ini = k;
      if (!esc && ini >= 0) { if (k - ini >= min) for (let j = ini; j < k; j++) linha[i0 + j * passo] |= bit; ini = -1; }
    }
  };
  for (let y = 0; y < h; y++) marcar(y * w, 1, w, minH, 1);
  for (let x = 0; x < w; x++) marcar(x, w, h, minV, 2);
  // Linha de verdade é fina: na direção perpendicular, a faixa marcada não passa de `espessura`.
  const fina = (i0, passo, n, bit) => {
    let ini = -1;
    for (let k = 0; k <= n; k++) {
      const m = k < n && linha[i0 + k * passo] & bit;
      if (m && ini < 0) ini = k;
      if (!m && ini >= 0) { if (k - ini > espessura) for (let j = ini; j < k; j++) linha[i0 + j * passo] &= ~bit; ini = -1; }
    }
  };
  for (let x = 0; x < w; x++) fina(x, w, h, 1);
  for (let y = 0; y < h; y++) fina(y * w, 1, w, 2);
  for (let i = 0; i < linha.length; i++) if (linha[i]) cinza[i] = 255;
  return cinza;
}

/**
 * Corrige só a forma de números (nunca os dígitos): "4,838,94" → "4.838,94"; "R$1.637.04" → "R$1.637,04"; "r$" → "R$".
 * Com um único ponto e sem "R$" ("16.49") não mexe: pode não ser dinheiro.
 */
export function normalizarPalavra(s) {
  let t = String(s).replace(/^[rR]\$/, "R$");
  const m = t.match(/^(R\$)?(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})$/);
  if (m && ((m[2].match(/[.,]/g) || []).length > 1 || m[1])) {
    const partes = m[2].split(/[.,]/); const cent = partes.pop();
    t = (m[1] || "") + partes.join(".") + "," + cent;
  }
  return t;
}

/**
 * Valor monetário que o OCR leu mal: caractere estranho no meio ("168,6]", "4,3/5,14"), uma casa só ("168,6")
 * ou casas a mais ("1.218,3868"). Percentuais ("100,00%") e pontuação em volta ("R$450,00),") não contam.
 */
export function valorSuspeito(s) {
  const reais = /^R\$/.test(String(s)), t = String(s).replace(/^R\$/, "");
  if (!/\d,\d/.test(t)) return false;
  if (/[^\d.,%():;\s-]/.test(t) || /^\d{1,3}(?:\.\d{3})*,\d$/.test(t)) return true;
  // Casas a mais só contam em dinheiro (com "R$" ou milhar): taxas como "10,054940" são legítimas.
  return (reais || /\./.test(t)) && /^\d{1,3}(?:\.\d{3})*,\d{3,}$/.test(t);
}

/**
 * Palavras do OCR (por linha do tesseract) → itens no formato do pdf.js para montarLinhas.
 * Junta "3.337" + "45" (vírgula que o OCR perdeu) quando o primeiro já tem separador de milhar.
 * Valor suspeito vira "??" (com o "R$", se tinha): o campo fica vazio e vira pendência, em vez de o leitor
 * aproveitar um pedaço errado. O texto original vai para `suspeitos`, que o consultor vê no aviso.
 * @param linhasOCR [[{ s, conf, x0, x1, base }]] com coordenadas em pixels da imagem
 */
export function palavrasParaItens(linhasOCR, alturaPt, escala = ESCALA_OCR) {
  const itens = [], suspeitos = [];
  for (const ws of linhasOCR) {
    const lista = [];
    for (const w of ws) {
      const s0 = String(w.s).trim().replace(/^[—–]+(?=(R\$)?\d)/, ""); // traço de borda colado no valor
      if (!s0 || /^[|[\]]+$/.test(s0)) continue; // resto de borda de tabela
      const s1 = normalizarPalavra(s0.replace(/^[|[]+(?=\S)/, "").replace(/(?<=[^\d])[|\]]+$/, ""));
      lista.push({ ...w, s: s1, orig: s0 });
    }
    for (let i = 0; i < lista.length; i++) {
      const w = lista[i], prox = lista[i + 1];
      if (prox && /^(R\$)?\d{1,3}(\.\d{3})+$/.test(w.s) && /^\d{2}$/.test(prox.s) && prox.x0 - w.x1 < 3 * escala) {
        w.s = `${w.s},${prox.s}`; w.x1 = prox.x1; lista.splice(i + 1, 1);
      }
      if (valorSuspeito(w.s)) { suspeitos.push(w.orig); w.s = (/^R\$/.test(w.s) ? "R$" : "") + "??"; }
      itens.push({ str: w.s, width: (w.x1 - w.x0) / escala, transform: [1, 0, 0, 1, w.x0 / escala, alturaPt - w.base / escala] });
    }
  }
  return { itens, suspeitos };
}

/**
 * Lê um PDF sem texto por OCR.
 * @param buf ArrayBuffer do PDF (uma cópia nova: o pdf.js pode transferir o buffer)
 * @param aoProgresso (pagina, total) => void
 * @returns { texto, linhas, ocr: { paginas, suspeitos } }
 */
export async function lerPorOCR(buf, aoProgresso = () => {}) {
  await carregarTesseract();
  const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const worker = await Tesseract.createWorker("por", 1);
  await worker.setParameters({ preserve_interword_spaces: "1" });
  const paginas = [], suspeitos = [];
  try {
    for (let p = 1; p <= pdf.numPages; p++) {
      aoProgresso(p, pdf.numPages);
      const pg = await pdf.getPage(p), vp = pg.getViewport({ scale: ESCALA_OCR });
      const cv = document.createElement("canvas"); cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const img = ctx.getImageData(0, 0, cv.width, cv.height), d = img.data;
      const cinza = new Uint8ClampedArray(cv.width * cv.height);
      for (let i = 0; i < cinza.length; i++) cinza[i] = 0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2];
      apagarGrade(cinza, cv.width, cv.height);
      for (let i = 0; i < cinza.length; i++) { d[4 * i] = d[4 * i + 1] = d[4 * i + 2] = cinza[i]; d[4 * i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      const { data } = await worker.recognize(cv, {}, { text: false, blocks: true });
      const linhasOCR = [];
      for (const b of data.blocks || []) for (const par of b.paragraphs) for (const l of par.lines)
        linhasOCR.push(l.words.map((w) => ({ s: w.text, conf: w.confidence, x0: w.bbox.x0, x1: w.bbox.x1, base: (w.baseline.y0 + w.baseline.y1) / 2 })));
      const r = palavrasParaItens(linhasOCR, vp.height / ESCALA_OCR);
      paginas.push(r.itens); suspeitos.push(...r.suspeitos);
      cv.width = cv.height = 0; // libera a memória do canvas
    }
  } finally { await worker.terminate(); }
  const doc = montarLinhas(paginas);
  doc.ocr = { paginas: pdf.numPages, suspeitos };
  return doc;
}
