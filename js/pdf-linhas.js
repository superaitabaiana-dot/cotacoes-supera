// Monta as linhas do PDF a partir dos itens de texto do pdf.js, guardando a posição de cada célula.
// Módulo puro (sem DOM): usado no navegador e nos testes em Node.
// Uma "célula" é um trecho contínuo de texto; espaço maior que ~2 caracteres abre uma célula nova.

/** @param paginas array de páginas, cada uma com os itens de getTextContent() */
export function montarLinhas(paginas) {
  const linhas = [];
  paginas.forEach((itens, i) => {
    const pag = i + 1;
    linhas.push({ pag, y: Infinity, texto: `--- Página ${pag} ---`, celulas: [{ x: 0, x2: 0, s: `--- Página ${pag} ---` }] });
    const rows = [];
    for (const it of itens) {
      if (!it.str || !it.str.trim()) continue;
      const x = it.transform[4], y = it.transform[5];
      let r = rows.find((r) => Math.abs(r.y - y) < 2.5); if (!r) { r = { y, items: [] }; rows.push(r); }
      r.items.push({ x, w: it.width, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      const celulas = []; let atual = null, end = null;
      for (const it of r.items) {
        const cw = it.s.length ? it.w / it.s.length : 4;
        const gap = end === null ? Infinity : it.x - end;
        if (!atual || gap > cw * 2.2) { atual = { x: it.x, x2: it.x + it.w, s: it.s }; celulas.push(atual); }
        else { atual.s += gap > cw * 0.25 ? " " + it.s : it.s; atual.x2 = it.x + it.w; }
        end = it.x + it.w;
      }
      for (const c of celulas) c.s = c.s.replace(/\s+$/, "");
      linhas.push({ pag, y: r.y, texto: celulas.map((c) => c.s).join("   "), celulas });
    }
  });
  return { texto: linhas.map((l) => l.texto).join("\n"), linhas };
}
