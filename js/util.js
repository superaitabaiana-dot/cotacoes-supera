// Utilidades de formato (moeda, datas, telefone) compartilhadas pelo app e pelo documento.
export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (v === true) n.setAttribute(k, "");
    else n.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null && f !== false) n.append(f instanceof Node ? f : String(f));
  return n;
}

export function parseBRL(s) {
  if (s == null) return NaN;
  const m = String(s).match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+(?:\.\d+)?/);
  if (!m) return NaN;
  let t = m[0]; if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  return parseFloat(t);
}
export const brl = (n) => "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function moneyDigits(s) { return String(s || "").match(/\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}/g) || []; }

export function parseDate(s) {
  const m = String(s || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  return d.getDate() == +m[1] && d.getMonth() == +m[2] - 1 ? d : null;
}
export const fmtDate = (d) => String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
export function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function hoje() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }

export function fmtTel(s) {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(s || "").trim();
}

/** Normaliza para comparação: minúsculas, sem acento, só letras e dígitos. */
export function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, ""); }

export function semAcento(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }

export function dataHora(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function uid() { return Math.random().toString(36).slice(2, 10); }

export function senhaTemporaria() {
  const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = crypto.getRandomValues(new Uint32Array(12));
  return [...r].map((x) => a[x % a.length]).join("");
}

export function blobParaBase64(blob) {
  return new Promise((ok, falha) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(",")[1]);
    fr.onerror = falha;
    fr.readAsDataURL(blob);
  });
}

export function baixar(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nome });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** replaceChildren que ignora null/false (o nativo escreveria "null" na tela). */
export function repor(n, ...filhos) { if (n) n.replaceChildren(...filhos.flat().filter((f) => f != null && f !== false)); }
