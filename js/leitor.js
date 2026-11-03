// Leitura do PDF no navegador e ocultação de dados pessoais (mesma lógica da v5).
/* global pdfjsLib */
import { montarLinhas } from "./pdf-linhas.js";
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

/** Lê o PDF e devolve { texto, linhas }: o texto linha a linha e cada linha com as células e suas posições. */
export async function lerPdf(buf) {
  const pdf = await pdfjsLib.getDocument({ data: buf, isEvalSupported: false }).promise;
  const paginas = [];
  for (let p = 1; p <= pdf.numPages; p++) paginas.push((await (await pdf.getPage(p)).getTextContent()).items);
  return montarLinhas(paginas);
}

export function cpfOk(d) {
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +d[i] * (10 - i);
  let r = (s * 10) % 11 % 10; if (r !== +d[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +d[i] * (11 - i);
  r = (s * 10) % 11 % 10; return r === +d[10];
}
export function cnpjOk(d) {
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const c = (n) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return c(12) === +d[12] && c(13) === +d[13];
}

/** Oculta CPF/CNPJ válidos, e-mail, telefone com DDD e datas de nascimento prováveis. Nome, placa e CEP ficam. */
export function mask(text) {
  const n = { cpf: 0, cnpj: 0, nasc: 0, tel: 0, email: 0 }; const yLimit = new Date().getFullYear() - 16;
  let t = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => { n.email++; return "[EMAIL]"; });
  t = t.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, (m) => { const d = m.replace(/\D/g, ""); if (cnpjOk(d)) { n.cnpj++; return "[CNPJ]"; } return m; });
  t = t.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, (m) => { const d = m.replace(/\D/g, ""); if (cpfOk(d)) { n.cpf++; return "[CPF]"; } return m; });
  t = t.replace(/\(\s?\d{2,3}\s?\)\s?\d{4,5}-?\d{4}/g, () => { n.tel++; return "[TELEFONE]"; });
  t = t.replace(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g, (m, d, mo, y) => { if (+y <= yLimit) { n.nasc++; return "[DATA DE NASCIMENTO]"; } return m; });
  return { text: t, n };
}

export function resumoOcultos(n) {
  return [n.cpf && `${n.cpf} CPF`, n.cnpj && `${n.cnpj} CNPJ`, n.nasc && `${n.nasc} nascimento`, n.tel && `${n.tel} telefone`, n.email && `${n.email} e-mail`].filter(Boolean).join(", ");
}
