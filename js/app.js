// Cotações Supera: telas e fluxo. Rotas por hash: #/cotacoes, #/nova, #/cotacao/<id>, #/equipe, #/perfil.
/* global pdfjsLib */
import { criarApi } from "./api.js";
import { CONFIG } from "./config.js";
import { CAMPOS_COMUNS, COBERTURAS, SERVICOS, avisosComparacao, compararCoberturas, incluidas, incorporar, melhorParcelamento, novaCotacao, opcaoAtual, ordenadas, preco, removerFonte, resumo } from "./consolidar.js";
import { gerarDocumento, nomeArquivo } from "./documento.js";
import { lerPdf, mask, resumoOcultos } from "./leitor.js";
import { LEITORES, lerPorRegras } from "./leitores/index.js";
import { rotulo as rotuloCampo } from "./leitores/resgate.js";
import { lerResposta, montarPrompt } from "./prompt.js";
import { $, $$, baixar, repor, blobParaBase64, brl, dataHora, el, fmtDate, fmtTel, hoje, norm, senhaTemporaria, uid } from "./util.js";
import { validar } from "./validacao.js";

const api = await criarApi();
const tela = $("#tela");
let eu = null, cfg = {};
let E = null; // cotação aberta

// ---------- Infra de tela ----------
function toast(msg, erro = false) {
  const t = el("div", { class: "toast" + (erro ? " erro" : "") }, msg);
  $("#toasts").append(t); setTimeout(() => t.remove(), erro ? 7000 : 3500);
}
function trocar(...filhos) { repor(tela, ...filhos); tela.focus({ preventScroll: true }); window.scrollTo(0, 0); }
function pagina(...filhos) { return el("div", { class: "pagina" }, ...filhos); }
const ir = (h) => { location.hash = h; };

window.addEventListener("beforeunload", (e) => { if (E?.sujo) { e.preventDefault(); e.returnValue = ""; } });
let hashAtual = location.hash;
window.addEventListener("hashchange", () => {
  if (E?.sujo && !location.hash.startsWith("#/cotacao/" + (E.id || "x")) && !confirm("Há alterações nesta cotação que ainda não viraram documento. Sair mesmo assim?")) {
    history.replaceState(null, "", hashAtual); return;
  }
  hashAtual = location.hash; rotear();
});

async function rotear() {
  $("#avisoDemo").hidden = !api.demo;
  let sess;
  try { sess = await api.sessao(); } catch { sess = null; }
  if (!sess) { $("#barra").hidden = true; return telaLogin(); }
  eu = await api.perfil().catch(() => null);
  if (!eu || !eu.ativo) { await api.sair(); $("#barra").hidden = true; return telaLogin("Seu acesso está desativado. Fale com o gestor."); }
  if (eu.trocar_senha) { $("#barra").hidden = true; return telaSenha(true); }
  cfg = await api.config().catch(() => ({}));
  montarBarra();
  const [, rota = "cotacoes", arg] = location.hash.replace(/^#/, "").split("/");
  if (rota !== "cotacao" && rota !== "nova") E = null;
  if (rota === "nova") return telaCotacao(null);
  if (rota === "cotacao" && arg) return telaCotacao(arg);
  if (rota === "equipe" && eu.papel === "gestor") return telaEquipe();
  if (rota === "perfil") return telaPerfil();
  return telaLista();
}

function montarBarra() {
  $("#barra").hidden = false;
  const rota = location.hash.split("/")[1] || "cotacoes";
  const link = (h, t, r) => el("a", { href: "#/" + h, "aria-current": rota === r ? "page" : null }, t);
  repor($("#nav"), link("cotacoes", "Cotações", "cotacoes"), link("nova", "Nova cotação", "nova"), eu.papel === "gestor" ? link("equipe", "Equipe", "equipe") : null);
  repor($("#quem"), 
    el("a", { href: "#/perfil", style: "color:inherit;text-decoration:none;text-align:right" },
      el("div", { class: "nome" }, eu.nome || eu.email), el("div", { class: "papel" }, eu.papel === "gestor" ? "Gestor" : "Consultor")),
    el("button", { onclick: async () => { if (E?.sujo && !confirm("Sair sem gerar o documento?")) return; E = null; await api.sair(); ir("#/"); rotear(); } }, "Sair"));
}

// ---------- Login e senha ----------
function telaLogin(msg = "") {
  const erro = el("p", { class: "erro", role: "alert" }, msg);
  const email = el("input", { id: "email", type: "email", autocomplete: "username", required: true });
  const senha = el("input", { id: "senha", type: "password", autocomplete: "current-password", required: true });
  const botao = el("button", { class: "primario", type: "submit" }, "Entrar");
  const form = el("form", { novalidate: true, onsubmit: async (e) => {
    e.preventDefault(); erro.textContent = ""; botao.disabled = true;
    try { await api.entrar(email.value, senha.value); await rotear(); } catch (x) { erro.textContent = x.message; } finally { botao.disabled = false; }
  } },
    el("img", { class: "logo-movel", src: "assets/logo_claro.png", alt: "Supera Seguros e Planejamento" }),
    el("h1", {}, "Entrar"),
    el("div", { class: "campo" }, el("label", { for: "email" }, "E-mail"), email),
    el("div", { class: "campo" }, el("label", { for: "senha" }, "Senha"), senha),
    erro, botao,
    el("p", { class: "mut", style: "font-size:13px" }, "Esqueceu a senha? Peça ao gestor para redefinir."),
    api.demo ? el("div", { class: "dica" }, "Demonstração: ", el("code", {}, "consultor@exemplo.com"), " / ", el("code", {}, "demo-consultor"), " ou ", el("code", {}, "gestor@exemplo.com"), " / ", el("code", {}, "demo-gestor"), ".") : null);
  trocar(el("div", { class: "entrada" },
    el("section", { class: "lado" },
      el("img", { class: "logo", src: "assets/logo_escuro.png", alt: "Supera Seguros e Planejamento" }),
      el("div", {}, el("h1", {}, "Cotações de seguro auto no padrão Supera"),
        el("p", {}, "Envie os PDFs das seguradoras, confira o que a leitura encontrou e entregue ao cliente um comparativo claro, com a marca da Supera.")),
      el("p", { class: "assinatura" }, "Para todas as fases da vida"),
      el("img", { class: "guarda", src: "assets/icone.png", alt: "" })),
    form));
  email.focus();
}

function telaSenha(obrigatoria) {
  const erro = el("p", { class: "erro", role: "alert", style: "color:var(--bad)" });
  const a = el("input", { id: "nova", type: "password", autocomplete: "new-password", minlength: 10 });
  const b = el("input", { id: "conf", type: "password", autocomplete: "new-password" });
  const form = el("form", { class: "painel", style: "max-width:440px;display:flex;flex-direction:column;gap:14px", onsubmit: async (e) => {
    e.preventDefault(); erro.textContent = "";
    if (a.value.length < 10) return (erro.textContent = "Use pelo menos 10 caracteres.");
    if (a.value !== b.value) return (erro.textContent = "As duas senhas não são iguais.");
    try { await api.trocarSenha(a.value); toast("Senha alterada"); if (obrigatoria) rotear(); else { a.value = b.value = ""; } } catch (x) { erro.textContent = x.message; }
  } },
    el("h2", {}, obrigatoria ? "Crie sua senha" : "Trocar senha"),
    obrigatoria ? el("p", { class: "mut" }, "Você entrou com uma senha temporária. Escolha uma senha só sua para continuar.") : null,
    el("div", { class: "campo" }, el("label", { for: "nova" }, "Nova senha (mínimo 10 caracteres)"), a),
    el("div", { class: "campo" }, el("label", { for: "conf" }, "Repita a nova senha"), b),
    erro, el("div", { class: "linha" }, el("button", { class: "primario", type: "submit" }, "Salvar senha"),
      obrigatoria ? el("button", { type: "button", class: "discreto", onclick: async () => { await api.sair(); rotear(); } }, "Sair") : null));
  if (!obrigatoria) return form;
  trocar(pagina(form));
}

// ---------- Perfil ----------
function telaPerfil() {
  const nome = el("input", { id: "p_nome", value: eu.nome || "" });
  const tel = el("input", { id: "p_tel", value: fmtTel(eu.telefone), inputmode: "tel", onblur: () => { tel.value = fmtTel(tel.value); } });
  trocar(pagina(
    el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Meu perfil"), el("p", { class: "sub" }, eu.email))),
    el("div", { class: "dois" },
      el("form", { class: "painel", style: "display:flex;flex-direction:column;gap:14px", onsubmit: async (e) => {
        e.preventDefault();
        try { await api.atualizarPerfil(nome.value.trim(), fmtTel(tel.value)); eu = await api.perfil(); montarBarra(); toast("Perfil salvo"); } catch (x) { toast(x.message, true); }
      } },
        el("h2", {}, "Dados no rodapé do documento"),
        el("p", { class: "mut" }, "Seu nome e telefone aparecem em “Seu consultor” em todas as cotações que você emitir."),
        el("div", { class: "campo" }, el("label", { for: "p_nome" }, "Nome"), nome),
        el("div", { class: "campo" }, el("label", { for: "p_tel" }, "Telefone"), tel),
        el("div", {}, el("button", { class: "primario" }, "Salvar perfil"))),
      telaSenha(false))));
}

// ---------- Lista de cotações ----------
async function telaLista() {
  const busca = el("input", { id: "busca", type: "search", placeholder: "Cliente, placa ou código" });
  let consultor = null, usuarios = [];
  if (eu.papel === "gestor") {
    usuarios = (await api.usuarios("listar").catch(() => ({ usuarios: [] }))).usuarios;
    consultor = el("select", { id: "f_consultor", "aria-label": "Consultor" }, el("option", { value: "" }, "Todos os consultores"), ...usuarios.map((u) => el("option", { value: u.id }, u.nome || u.email)));
  }
  const corpo = el("div");
  const carregar = async () => {
    const lista = await api.listarCotacoes({ busca: busca.value, consultor: consultor?.value || "" }).catch((x) => { toast(x.message, true); return []; });
    if (!lista.length) {
      repor(corpo, el("div", { class: "painel vazio" },
        el("img", { src: "assets/icone.png", alt: "" }),
        el("h2", {}, busca.value ? "Nenhuma cotação encontrada" : "Nenhuma cotação ainda"),
        el("p", { class: "mut" }, busca.value ? "Confira o nome, a placa ou o código digitado." : "Comece enviando os PDFs das seguradoras de um cliente."),
        busca.value ? null : el("a", { class: "botao primario", href: "#/nova" }, "Nova cotação")));
      return;
    }
    const gestor = eu.papel === "gestor";
    repor(corpo, el("div", { class: "tabela-env" }, el("table", { class: "lista" },
      el("thead", {}, el("tr", {}, el("th", {}, "Cliente"), el("th", {}, "Seguradoras"), el("th", {}, "Menor preço"), el("th", {}, "Recomendada"), gestor ? el("th", {}, "Consultor") : null, el("th", {}, "Atualizada"), el("th", {}, "Drive"))),
      el("tbody", {}, ...lista.map((c) => {
        const r = c.resumo || {};
        return el("tr", { onclick: (e) => { if (!e.target.closest("a")) ir("#/cotacao/" + c.id); } },
          el("td", {}, el("div", { class: "cliente" }, c.cliente || "Sem nome"), el("div", { class: "mut", style: "font-size:13px" }, [c.veiculo, c.placa].filter(Boolean).join(" · ") || "—"), el("div", { class: "mut num", style: "font-size:12px" }, `${c.codigo} · versão ${c.versao_atual}`)),
          el("td", { "data-r": "Seguradoras" }, el("div", { class: "seg" }, ...(r.seguradoras || []).map((s) => el("span", { class: "chip" }, s)))),
          el("td", { "data-r": "Menor preço", class: "num" }, r.menor_preco ? `${r.menor_preco.valor} (${r.menor_preco.seguradora})` : "—"),
          el("td", { "data-r": "Recomendada" }, r.recomendada ? r.recomendada.seguradora : "—"),
          gestor ? el("td", { "data-r": "Consultor" }, c.consultor_nome || "—") : null,
          el("td", { "data-r": "Atualizada", class: "num" }, dataHora(c.atualizado_em)),
          el("td", { "data-r": "Drive" }, c.drive_pasta_url ? el("a", { href: c.drive_pasta_url, target: "_blank", rel: "noopener" }, "Abrir pasta") : el("span", { class: "mut" }, "—")));
      })))));
  };
  let t = null;
  busca.addEventListener("input", () => { clearTimeout(t); t = setTimeout(carregar, 250); });
  consultor?.addEventListener("change", carregar);
  trocar(pagina(
    el("div", { class: "topo" },
      el("div", {}, el("h1", {}, "Cotações"), el("p", { class: "sub" }, eu.papel === "gestor" ? "Todas as cotações da equipe." : "Suas cotações emitidas.")),
      el("a", { class: "botao primario", href: "#/nova" }, "Nova cotação")),
    el("div", { class: "filtros" }, busca, consultor), corpo));
  await carregar();
}

// ---------- Cotação: estado ----------
async function telaCotacao(id) {
  if (E && (id ? E.id === id : !E.id)) return desenharEtapa(); // volta para a mesma cotação aberta
  E = { id, codigo: "", versoes: [], dados: novaCotacao(), textos: new Map(), arquivos: [], etapa: 1, ack: false, sujo: false, dono: null, modo: "seguradoras", doc: null };
  if (id) {
    try {
      const r = await api.abrirCotacao(id);
      Object.assign(E, { codigo: r.cot.codigo, versoes: r.versoes, dono: r.dono, consultorNome: r.cot.consultor_nome, pastaUrl: r.cot.drive_pasta_url });
      if (r.versoes[0]) E.dados = structuredClone(r.versoes[0].dados);
      for (const f of r.fontes) E.textos.set(f.id, f.texto_mascarado);
      E.arquivos = E.dados.fontes.map((f) => ({ id: f.id, nome: f.arquivo_nome, estado: "salvo", salvo: true, nomes: f.nomes }));
      E.modo = E.dados.fonte;
      E.etapa = 2;
    } catch (x) { toast(x.message, true); return ir("#/cotacoes"); }
  }
  desenharEtapa();
}

function cabecalhoCotacao() {
  const c = E.dados.comum;
  const titulo = E.id ? (c.segurado || "Cotação") : "Nova cotação";
  const etapas = [["Arquivos", 1], ["Conferência", 2], ["Documento", 3]];
  return el("div", { class: "topo" },
    el("div", { style: "display:flex;flex-direction:column;gap:12px" },
      el("div", {}, el("h1", {}, titulo),
        el("p", { class: "sub num" }, E.id ? `${E.codigo} · versão ${E.versoes[0]?.numero ?? 0}${E.consultorNome && eu.papel === "gestor" ? " · " + E.consultorNome : ""}` : "Envie os PDFs, confira e gere o documento.")),
      el("ol", { class: "etapas", "aria-label": "Etapas" }, ...etapas.map(([t, n]) =>
        el("li", { "aria-current": E.etapa === n ? "step" : null, class: E.etapa > n ? "feita" : "" }, el("span", { class: "n" }, String(n)), t)))),
    el("div", { class: "linha" },
      E.pastaUrl ? el("a", { class: "botao", href: E.pastaUrl, target: "_blank", rel: "noopener" }, "Pasta no Drive") : null,
      E.versoes.length > 1 ? el("details", {}, el("summary", { class: "botao" }, `Versões (${E.versoes.length})`),
        el("ul", { class: "passos painel", style: "position:absolute;z-index:5;margin-top:6px" }, ...E.versoes.map((v) => el("li", {}, el("strong", {}, `v${v.numero}`), " ", dataHora(v.criado_em), " ", v.drive_arquivo_url ? el("a", { href: v.drive_arquivo_url, target: "_blank", rel: "noopener" }, "PDF") : null)))) : null));
}

function desenharEtapa() {
  if (E.etapa === 1) return etapaArquivos();
  if (E.etapa === 2) return etapaConferencia();
  return etapaDocumento();
}

// ---------- Etapa 1: arquivos ----------
function etapaArquivos() {
  const entrada = el("input", { type: "file", id: "arquivos", accept: "application/pdf,.pdf", multiple: E.modo === "seguradoras", hidden: true, onchange: (e) => { adicionar([...e.target.files]); e.target.value = ""; } });
  const soltar = el("div", { class: "soltar", id: "soltar" },
    el("div", {},
      el("strong", {}, E.modo === "segfy" ? "Envie o PDF do comparativo do Segfy" : "Envie os PDFs das seguradoras"),
      el("small", {}, E.modo === "segfy" ? "Um arquivo com todas as seguradoras cotadas." : "Um PDF por seguradora, todos do mesmo cliente. Você pode arrastar vários de uma vez.")),
    el("button", { class: "primario", type: "button", onclick: () => entrada.click() }, E.modo === "segfy" ? "Escolher PDF" : "Escolher PDFs"), entrada);
  ["dragenter", "dragover"].forEach((t) => soltar.addEventListener(t, (e) => { e.preventDefault(); soltar.classList.add("sobre"); }));
  ["dragleave", "drop"].forEach((t) => soltar.addEventListener(t, (e) => { e.preventDefault(); soltar.classList.remove("sobre"); }));
  soltar.addEventListener("drop", (e) => adicionar([...e.dataTransfer.files]));

  const modo = el("div", { class: "modo", role: "group", "aria-label": "Origem dos PDFs" },
    ...[["seguradoras", "PDFs das seguradoras"], ["segfy", "Comparativo do Segfy"]].map(([m, t]) =>
      el("button", { type: "button", "aria-pressed": String(E.modo === m), disabled: E.arquivos.length > 0 && E.modo !== m, onclick: () => { E.modo = m; etapaArquivos(); } }, t)));

  const prontos = E.arquivos.filter((a) => a.estado === "pronto" || a.estado === "salvo").length;
  const ocupados = E.arquivos.some((a) => ["fila", "lendo", "extraindo", "colar", "parcial"].includes(a.estado));
  trocar(pagina(cabecalhoCotacao(),
    el("div", { class: "linha", style: "justify-content:space-between" }, modo,
      el("p", { class: "mut", style: "font-size:13px;max-width:62ch" }, "A leitura acontece no seu navegador. Se a seguradora ainda não tiver leitor automático, o sistema prepara o texto, com CPF, e-mail, telefone e nascimento ocultos, para você ler no Claude.")),
    soltar,
    E.arquivos.length ? el("div", { class: "arquivos", id: "listaArquivos" }, ...E.arquivos.map(linhaArquivo)) : null,
    el("div", { class: "linha", style: "justify-content:flex-end" },
      E.id ? el("button", { type: "button", onclick: () => { E.etapa = 2; desenharEtapa(); } }, "Voltar à conferência") : null,
      el("button", { class: "primario", id: "irConferir", disabled: !prontos || ocupados, onclick: () => { E.etapa = 2; desenharEtapa(); } },
        E.arquivos.some((a) => a.estado === "parcial") ? "Decida sobre a leitura parcial" : E.arquivos.some((a) => a.estado === "colar") ? "Falta ler PDF no Claude" : ocupados ? "Lendo os PDFs…" : `Conferir ${prontos > 1 ? prontos + " cotações" : "cotação"}`))));
}

function linhaArquivo(a) {
  const rot = { fila: "Na fila", lendo: "Lendo o PDF", extraindo: "Lendo com IA", pronto: "Pronto", salvo: "Já lido", erro: "Não lido", colar: "Ler no Claude", parcial: "Leitura parcial" }[a.estado];
  const det = ["erro", "colar", "parcial"].includes(a.estado) ? a.msg
    : a.nomes?.length ? [a.nomes.join(", "), a.origem, a.ocultos && a.origem !== "leitura automática" ? `ocultados: ${a.ocultos}` : ""].filter(Boolean).join(" · ")
    : a.tamanho ? `${(a.tamanho / 1024).toFixed(0)} KB` : "";
  return el("div", { class: "arq", "data-arq": a.id },
    el("div", {}, el("div", { class: "nome" }, a.nome), el("div", { class: "det" + (a.estado === "erro" ? " erro" : "") }, det)),
    el("span", { class: "estado" + (["fila", "lendo", "extraindo"].includes(a.estado) ? " ocupado" : ""), style: a.estado === "erro" ? "color:var(--bad)" : a.estado === "pronto" ? "color:var(--ok)" : ["colar", "parcial"].includes(a.estado) ? "color:var(--warn)" : "" }, rot),
    el("div", { class: "linha" },
      a.estado === "erro" && a.file ? el("button", { class: "discreto", onclick: () => { a.estado = "fila"; processar(); } }, "Tentar de novo") : null,
      ["pronto", "erro", "salvo", "colar", "parcial"].includes(a.estado) ? el("button", { class: "discreto perigo", onclick: () => removerArquivo(a) }, "Remover") : null),
    ["colar", "parcial"].includes(a.estado) ? painelColar(a) : null);
}

/** Leitura manual pelo claude.ai: copiar o pedido (texto já ocultado), colar a resposta. Sem custo de API. */
function painelColar(a) {
  const parcial = a.estado === "parcial";
  const erro = el("p", { class: "msg", role: "alert", style: "color:var(--bad);font-size:13px" });
  const resposta = el("textarea", { id: "colar_" + a.id, rows: 4, placeholder: "Cole aqui a resposta do Claude", oninput: (e) => { a.colado = e.target.value; } }, a.colado || "");
  const copiar = el("button", { type: "button", class: "primario", onclick: async () => {
    try { await navigator.clipboard.writeText(montarPrompt(a.textoMascarado)); copiar.textContent = "Pedido copiado"; }
    catch { toast("Não foi possível copiar automaticamente. Use o texto em “Ver o pedido”.", true); }
  } }, "Copiar pedido de leitura");
  return el("div", { class: "colar" },
    parcial ? el("div", { class: "linha" },
      el("button", { type: "button", id: "usarParcial_" + a.id, onclick: () => { concluirLeitura(a, a.auto, "leitura automática parcial"); etapaArquivos(); } }, "Usar o que foi lido e completar na conferência"),
      el("span", { class: "mut", style: "font-size:13px" }, "ou leia pelo Claude:")) : null,
    el("ol", {},
      el("li", {}, "Copie o pedido de leitura. Ele já vai com CPF, e-mail, telefone e nascimento ocultos. ", el("span", { class: "linha", style: "margin-top:6px" }, copiar,
        el("a", { class: "botao", href: "https://claude.ai/new", target: "_blank", rel: "noopener" }, "Abrir o Claude"))),
      el("li", {}, "Cole numa conversa nova no Claude e envie. ",
        el("span", { class: "mut", style: "font-size:13px" }, "Privacidade: nas configurações de privacidade da sua conta do Claude, desative o uso das suas conversas para melhorar os modelos. O pedido leva nome, placa e CEP do cliente.")),
      el("li", {}, "Copie a resposta inteira do Claude e cole abaixo.")),
    resposta, erro,
    el("div", { class: "linha" },
      el("button", { type: "button", class: "primario", onclick: () => {
        try { concluirLeitura(a, lerResposta(resposta.value), "lido no Claude"); etapaArquivos(); }
        catch (x) { erro.textContent = x.message; }
      } }, "Usar resposta"),
      el("details", {}, el("summary", { class: "mut", style: "cursor:pointer;font-size:13px" }, "Ver o pedido"),
        el("pre", { style: "white-space:pre-wrap;max-height:200px;overflow:auto;font-size:12px" }, montarPrompt(a.textoMascarado)))));
}

/** Registro da saúde dos leitores: só seguradora, leitor e nomes de campos; nenhum dado do cliente. */
function registrarLeitura(auto) {
  const reg = !auto ? { leitor: "nenhum", seguradora: "", resultado: "nao_reconhecido", campos_ok: 0, campos_total: 0, faltaram: [] }
    : { leitor: auto.leitor.id, seguradora: auto.dados?.seguradoras?.[0]?.seguradora || auto.leitor.nome, resultado: auto.parcial ? "parcial" : "completa",
      campos_ok: auto.cobertura.ok, campos_total: auto.cobertura.total, faltaram: [...auto.faltam, ...auto.recuperados.map((r) => "rótulo alternativo: " + r)] };
  api.registrarLeitura(reg).catch(() => {}); // o registro nunca atrapalha a leitura
}

function concluirLeitura(a, dados, origem) {
  incorporar(E.dados, { id: a.id, arquivo_nome: a.nome, extracao: dados });
  E.textos.set(a.id, a.textoMascarado); a.extracao = dados; a.nomes = dados.seguradoras.map((s) => s.seguradora);
  a.origem = origem; a.estado = "pronto"; a.colado = ""; E.sujo = true;
}

function removerArquivo(a) {
  E.arquivos = E.arquivos.filter((x) => x !== a);
  if (a.estado === "pronto" || a.estado === "salvo") { removerFonte(E.dados, a.id); E.sujo = true; }
  etapaArquivos();
}

function adicionar(files) {
  const pdfs = files.filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
  if (pdfs.length < files.length) toast("Só arquivos PDF são aceitos.", true);
  if (E.modo === "segfy" && (pdfs.length > 1 || E.arquivos.length)) { toast("No modo Segfy envie um único PDF.", true); pdfs.splice(1); if (E.arquivos.length) return; }
  for (const f of pdfs) {
    if (E.arquivos.some((a) => a.nome === f.name && a.tamanho === f.size)) { toast(`${f.name} já está na lista.`); continue; }
    E.arquivos.push({ id: uid(), file: f, nome: f.name, tamanho: f.size, estado: "fila" });
  }
  etapaArquivos(); processar();
}

let processando = 0;
function processar() {
  const fila = E.arquivos.filter((a) => a.estado === "fila");
  while (processando < 2 && fila.length) { const a = fila.shift(); processando++; lerArquivo(a).finally(() => { processando--; processar(); }); }
  if (E.etapa === 1) etapaArquivos();
}

async function lerArquivo(a) {
  const meu = E;
  const atualizar = () => { if (E === meu && E.etapa === 1) { const n = $(`[data-arq="${a.id}"]`); if (n) n.replaceWith(linhaArquivo(a)); } };
  try {
    a.estado = "lendo"; atualizar();
    if (!window.pdfjsLib) throw new Error("O leitor de PDF não carregou. Recarregue a página.");
    const doc = await lerPdf(await a.file.arrayBuffer());
    if (doc.texto.replace(/---.*---/g, "").trim().length < 200) throw new Error("Este PDF não tem texto legível (parece escaneado). Peça o PDF original à seguradora.");
    const m = mask(doc.texto); a.ocultos = resumoOcultos(m.n); a.textoMascarado = m.text;
    // 1º: leitor automático da seguradora (no navegador, sem custo). 2º: reserva configurada.
    const auto = lerPorRegras(doc);
    registrarLeitura(auto);
    if (E !== meu || !E.arquivos.includes(a)) return;
    const temDados = !!auto?.dados?.seguradoras?.length;
    if (temDados && !auto.parcial) concluirLeitura(a, auto.dados, "leitura automática");
    else if (CONFIG.LEITURA_RESERVA === "api") {
      a.estado = "extraindo"; atualizar();
      const r = await api.extrair(m.text, a.nome);
      if (r.dados.tipo_documento === "OUTRO" || !r.dados.seguradoras?.length) throw new Error(r.dados.alertas?.[0] || "Não parece uma cotação de seguro auto.");
      if (E !== meu || !E.arquivos.includes(a)) return;
      concluirLeitura(a, r.dados, "lido com IA");
    } else if (temDados) {
      // Leitura parcial: o layout pode ter mudado. O consultor escolhe entre completar à mão ou ler pelo Claude.
      a.estado = "parcial"; a.auto = auto.dados;
      a.msg = `O leitor ${auto.leitor.nome} não encontrou: ${auto.faltam.map(rotuloCampo).join(", ")}. O layout desta seguradora pode ter mudado.`;
    } else {
      a.estado = "colar";
      a.msg = auto ? `O leitor ${auto.leitor.nome} não conseguiu ler este arquivo. Leia pelo Claude:` : "Esta seguradora ainda não tem leitor automático. Leia pelo Claude:";
    }
  } catch (x) { a.estado = "erro"; a.msg = x.message || "Falha na leitura."; }
  if (E === meu && E.etapa === 1) etapaArquivos();
}

// ---------- Etapa 2: conferência ----------
let pend = [];
function etapaConferencia() {
  const d = E.dados;
  if (!d.seguradoras.length) { E.etapa = 1; return etapaArquivos(); }
  const avisos = avisosComparacao(d);
  trocar(pagina(cabecalhoCotacao(),
    el("div", { class: "conf" },
      el("div", { class: "principal" },
        painelCliente(d),
        painelMesa(d),
        el("section", { class: "painel" },
          el("div", { class: "painel-cab" }, el("h2", {}, "Recomendação"), el("span", { class: "mut", style: "font-size:13px" }, "Marque “Recomendar” na seguradora escolhida.")),
          el("div", { class: "campo" }, el("label", { for: "nota" }, "Por que recomendamos (aparece no documento)"),
            el("textarea", { id: "nota", rows: 3, maxlength: 400, "data-bind": "nota", placeholder: "Ex.: melhor equilíbrio entre preço e coberturas, com carro reserva de 15 dias e assistência sem limite de km." }, d.nota || ""))),
        avisos.length ? el("section", { class: "painel" }, el("h2", {}, "Atenção na comparação"), el("ul", { class: "avisos" }, ...avisos.map((a) => el("li", {}, a)))) : null,
        textosEnviados()),
      el("aside", { class: "lateral" },
        el("section", { class: "painel" }, el("h2", {}, "Preço total"), el("div", { class: "regua", id: "regua" })),
        el("section", { class: "painel" },
          el("div", { class: "painel-cab" }, el("h2", {}, "Pendências"), el("div", { class: "linha", id: "contagem" })),
          el("ul", { class: "pend", id: "pend" }),
          el("label", { class: "confere", id: "linhaAck", style: "margin-top:12px" }, el("input", { type: "checkbox", id: "ack", onchange: (e) => { E.ack = e.target.checked; atualizar(); } }), el("span", {}, "Conferi os pontos sinalizados com os PDFs das seguradoras.")),
          el("div", { class: "linha", style: "margin-top:14px" },
            el("button", { class: "primario", id: "gerar", onclick: () => { E.etapa = 3; desenharEtapa(); } }, "Gerar documento"),
            el("button", { class: "discreto", onclick: () => { E.etapa = 1; desenharEtapa(); } }, "Adicionar PDFs")))))));
  $("#ack").checked = E.ack;
  atualizar();
}

function campoComum(k, rotulo) {
  return el("div", { class: "campo", "data-onde": "comum", "data-campo": k },
    el("label", { for: "c_" + k }, rotulo),
    k === "cobertura_menor_25"
      ? el("select", { id: "c_" + k, "data-bind": "comum." + k }, ...["", "SIM", "NÃO"].map((v) => el("option", { value: v, selected: E.dados.comum[k] === v }, v || "Não informado")))
      : el("input", { id: "c_" + k, "data-bind": "comum." + k, value: E.dados.comum[k] || "", inputmode: /vigencia|data_|validade|vencimento/.test(k) ? "numeric" : null, placeholder: /vigencia|data_|validade|vencimento/.test(k) ? "dd/mm/aaaa" : null }),
    el("div", { class: "msg" }));
}

function painelCliente(d) {
  const tipo = el("div", { class: "campo", "data-onde": "comum", "data-campo": "tipo" },
    el("span", { class: "rotulo" }, "Tipo de seguro"),
    el("div", { class: "radios" }, ...[["NOVO", "Seguro novo"], ["RENOVACAO", "Renovação"]].map(([v, t]) =>
      el("label", {}, el("input", { type: "radio", name: "tipo", value: v, checked: d.comum.tipo === v, "data-bind": "comum.tipo" }), t))),
    el("div", { class: "msg" }));
  return el("section", { class: "painel" },
    el("div", { class: "painel-cab" }, el("h2", {}, "Cliente e veículo"), el("span", { class: "mut", style: "font-size:13px" }, `${d.fontes.length} PDF${d.fontes.length > 1 ? "s" : ""} lido${d.fontes.length > 1 ? "s" : ""}`)),
    el("div", { class: "grade" }, ...CAMPOS_COMUNS.map(([k, r]) => campoComum(k, r)), tipo));
}

function painelMesa(d) {
  const segs = d.seguradoras;
  const cmp = compararCoberturas(d);
  const iguais = new Set(cmp.iguais.map((i) => i.k));
  const linhas = [["premio_total", "Preço total"], ...COBERTURAS];
  const cel = (s, k) => {
    const o = opcaoAtual(s);
    return el("td", { "data-onde": s.id, "data-campo": k, class: s.id === d.recomendada ? "rec" : "" },
      el("input", { "data-bind": `seg:${s.id}:${k}`, value: o[k] ?? "", "aria-label": `${s.nome}: ${k.replace(/_/g, " ")}` }), el("div", { class: "msg" }));
  };
  const servicos = (s) => {
    const o = opcaoAtual(s);
    return el("td", { "data-onde": s.id, "data-campo": "servicos", class: s.id === d.recomendada ? "rec" : "" },
      el("div", { class: "serv" }, ...SERVICOS.map(([k, r]) => el("label", {},
        el("input", { type: "checkbox", checked: o[k] === true, "data-bind": `serv:${s.id}:${k}` }), r,
        el("small", {}, o[k] === true ? "" : o[k] === false ? "não contratado" : "não mencionado")))),
      el("div", { class: "msg" }));
  };
  const planos = (s) => {
    const o = opcaoAtual(s);
    return el("td", { "data-onde": s.id, "data-campo": "pagamentos", class: s.id === d.recomendada ? "rec" : "" },
      o.pagamentos?.length ? el("div", { class: "planos" }, ...o.pagamentos.map((p, i) => el("label", {},
        el("input", { type: "checkbox", checked: p.sel, "data-bind": `plano:${s.id}:${i}` }),
        el("span", {}, `${p.forma} · ${(+p.parcelas || 1) === 1 ? "à vista" : p.parcelas + "x"} ${p.valor_parcela || ""}`, p.juros ? el("span", { class: "j" }, " com juros") : null))))
        : el("span", { class: "mut", style: "font-size:13px" }, "Sem tabela de pagamento no PDF."),
      el("div", { class: "msg" }));
  };
  const fonteNome = (s) => d.fontes.find((f) => f.id === s.fonte_id)?.arquivo_nome || "";
  return el("section", { class: "painel" },
    el("div", { class: "painel-cab" }, el("h2", {}, "Seguradoras lado a lado"),
      el("span", { class: "mut", style: "font-size:13px" }, "Edite qualquer valor. Linhas marcadas como iguais vão para o quadro “Iguais em todas”.")),
    el("div", { class: "mesa-env" }, el("table", { class: "mesa", id: "mesa" },
      el("thead", {}, el("tr", {}, el("th", { class: "rot", scope: "col" }, "Cobertura"), ...segs.map((s) => el("th", { scope: "col", class: (s.incluir ? "" : "fora ") + (s.id === d.recomendada ? "rec" : "") },
        el("div", { class: "cab-seg" },
          el("span", { class: "nomeseg" }, s.nome),
          el("span", { class: "origem" }, fonteNome(s)),
          s.opcoes.length > 1 ? el("select", { "data-bind": `opcao:${s.id}`, "aria-label": `Opção da ${s.nome}` }, ...s.opcoes.map((o, i) => el("option", { value: i, selected: s.opcao === i }, `${o.nome || "Opção " + (i + 1)}${o.premio_total ? " · " + o.premio_total : ""}`))) : null,
          el("label", {}, el("input", { type: "checkbox", checked: s.incluir, "data-bind": `incluir:${s.id}` }), "No documento"),
          el("label", {}, el("input", { type: "radio", name: "rec", checked: d.recomendada === s.id, "data-bind": `rec:${s.id}` }), "Recomendar")))))),
      el("tbody", {},
        ...linhas.map(([k, r]) => el("tr", { class: k === "premio_total" ? "preco" : "" },
          el("th", { class: "rot", scope: "row" }, r, iguais.has(k) ? el("span", { class: "igual" }, "igual em todas") : null),
          ...segs.map((s) => cel(s, k)))),
        el("tr", {}, el("th", { class: "rot", scope: "row" }, "Serviços", iguais.has("servicos") ? el("span", { class: "igual" }, "igual em todas") : null), ...segs.map(servicos)),
        el("tr", {}, el("th", { class: "rot", scope: "row" }, "Formas de pagamento"), ...segs.map(planos))))));
}

function textosEnviados() {
  if (!E.textos.size) return null;
  return el("details", { class: "painel" },
    el("summary", { style: "cursor:pointer;font-weight:600" }, "Ver o texto enviado à IA (com dados pessoais ocultos)"),
    ...E.dados.fontes.map((f) => el("div", { style: "margin-top:12px" }, el("h3", {}, f.arquivo_nome),
      el("pre", { style: "white-space:pre-wrap;word-break:break-word;max-height:260px;overflow:auto;font-size:12px;background:var(--surface-2);padding:10px;border-radius:6px" }, E.textos.get(f.id) || "Texto não disponível."))));
}

// Edição: um único ouvinte para toda a tela de conferência.
tela.addEventListener("input", (e) => editar(e.target, false));
tela.addEventListener("change", (e) => editar(e.target, true));
function editar(alvo, mudou) {
  const b = alvo.dataset?.bind; if (!b || !E || E.etapa !== 2) return;
  const d = E.dados;
  if (b === "nota") d.nota = alvo.value;
  else if (b.startsWith("comum.")) { if (alvo.type === "radio" && !alvo.checked) return; d.comum[b.slice(6)] = alvo.value; }
  else {
    const [tipo, sid, campo] = b.split(":"); const s = d.seguradoras.find((x) => x.id === sid); if (!s) return;
    const o = opcaoAtual(s);
    if (tipo === "seg") o[campo] = alvo.value;
    else if (tipo === "serv") { if (!mudou) return; o[campo] = alvo.checked; }
    else if (tipo === "plano") { if (!mudou) return; o.pagamentos[+campo].sel = alvo.checked; }
    else if (tipo === "incluir") { if (!mudou) return; s.incluir = alvo.checked; return marcarSujo(true); }
    else if (tipo === "rec") { if (!mudou) return; d.recomendada = sid; if (!s.incluir) s.incluir = true; return marcarSujo(true); }
    else if (tipo === "opcao") { if (!mudou) return; s.opcao = +alvo.value; return marcarSujo(true); }
  }
  marcarSujo(false);
}
function marcarSujo(redesenhar) {
  E.sujo = true;
  if (redesenhar) { const y = window.scrollY; etapaConferencia(); window.scrollTo(0, y); } else atualizar();
}

/** Recalcula pendências e atualiza só as marcações, sem redesenhar os campos (mantém o foco). */
function atualizar() {
  pend = validar(E.dados, E.textos);
  $$("[data-onde][data-campo]").forEach((n) => {
    const p = pend.find((x) => x.onde === n.dataset.onde && x.campo === n.dataset.campo);
    n.classList.remove("ausente", "divergente"); if (p) n.classList.add(p.tipo);
    const s = p && E.dados.seguradoras.find((x) => x.id === p.onde);
    const m = n.querySelector(".msg"); if (m) m.textContent = !p ? "" : s && p.msg.startsWith(s.nome + ": ") ? p.msg.slice(s.nome.length + 2) : p.msg;
  });
  // Régua de preços em escala
  const segs = ordenadas(E.dados), precos = segs.map(preco).filter((v) => !isNaN(v));
  const max = Math.max(...precos, 1), menor = Math.min(...precos);
  repor($("#regua"), ...(segs.length ? segs.map((s) => {
    const p = preco(s), rec = s.id === E.dados.recomendada;
    return el("div", { class: "item" + (rec ? " rec" : "") + (p === menor ? " menor" : "") },
      el("span", { class: "nome" }, s.nome), el("span", { class: "valor num" }, isNaN(p) ? "—" : brl(p)),
      el("div", { class: "trilho" }, el("div", { class: "barra-p", style: `width:${isNaN(p) ? 0 : Math.max(4, p / max * 100)}%` })),
      el("span", { class: "selo" }, [rec ? "Recomendada" : "", p === menor ? "Menor preço" : "", melhorParcelamento(opcaoAtual(s))].filter(Boolean).join(" · ")));
  }) : [el("p", { class: "mut" }, "Nenhuma seguradora no documento.")]));
  const aus = pend.filter((p) => p.tipo === "ausente").length, div = pend.filter((p) => p.tipo === "divergente").length;
  repor($("#contagem"), 
    div ? el("span", { class: "chip divergente" }, `${div} ${div > 1 ? "divergências" : "divergência"}`) : null,
    aus ? el("span", { class: "chip ausente" }, `${aus} ${aus > 1 ? "ausentes" : "ausente"}`) : null,
    !pend.length ? el("span", { class: "chip ok" }, "Tudo conferido") : null);
  repor($("#pend"), ...pend.map((p) => el("li", { class: p.tipo }, el("button", { type: "button", onclick: () => focar(p) }, el("span", { class: "ponto" }), el("span", {}, p.msg)))));
  const precisa = pend.length > 0;
  if ($("#linhaAck")) $("#linhaAck").hidden = !precisa;
  if ($("#gerar")) $("#gerar").disabled = !incluidas(E.dados).length || (precisa && !E.ack);
}

function focar(p) {
  const alvo = $(`[data-onde="${p.onde}"][data-campo="${p.campo}"]`);
  if (!alvo) return;
  alvo.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  alvo.classList.remove("foco"); void alvo.offsetWidth; alvo.classList.add("foco");
  alvo.querySelector("input,select,textarea")?.focus({ preventScroll: true });
}

// ---------- Etapa 3: documento ----------
function rodapeCtx(identificacao) {
  const quem = E.dono?.nome ? E.dono : eu;
  return { consultor: [quem.nome, fmtTel(quem.telefone)].filter(Boolean).join(" · "), whatsapp: cfg.whatsapp_supera || "", identificacao, base: "assets/" };
}

async function desenharPaginas(blob, alvo) {
  const pdf = await pdfjsLib.getDocument({ data: await blob.arrayBuffer() }).promise;
  const telas = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1.6 });
    const c = el("canvas", { width: vp.width, height: vp.height, "aria-label": `Página ${i} do documento` });
    await pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
    telas.push(c);
  }
  repor(alvo, ...telas);
}

async function etapaDocumento() {
  const paginas = el("div", { class: "paginas", id: "paginas" }, el("p", { class: "mut" }, "Montando o documento…"));
  const passos = el("ul", { class: "passos", id: "passos" });
  const salvar = el("button", { class: "primario", id: "salvar", onclick: salvarEBaixar }, E.id ? "Salvar nova versão e baixar" : "Salvar e baixar PDF");
  const qtd = incluidas(E.dados).length;
  trocar(pagina(cabecalhoCotacao(),
    el("div", { class: "doc" },
      el("div", { class: "paginas-env" }, paginas),
      el("aside", { class: "lateral" },
        el("section", { class: "painel", style: "display:flex;flex-direction:column;gap:14px" },
          el("h2", {}, "Documento"),
          el("p", { class: "mut" }, qtd > 1 ? `Comparativo de ${qtd} seguradoras, seguido de uma página no padrão Supera para cada uma.` : "Uma página no padrão Supera."),
          el("p", { class: "mut", style: "font-size:13px" }, "Ao salvar, o sistema registra uma nova versão, baixa o PDF e guarda uma cópia no Drive da Supera junto com os PDFs originais."),
          el("div", { class: "linha" }, salvar, el("button", { class: "discreto", onclick: () => { E.etapa = 2; desenharEtapa(); } }, "Voltar à conferência")),
          passos)))));
  try {
    E.doc = await gerarDocumento(E.dados, rodapeCtx("Prévia"));
    await desenharPaginas(E.doc, paginas);
  } catch (x) { console.error(x); repor(paginas, el("p", { style: "color:var(--bad)" }, "Não foi possível montar o documento: " + x.message)); salvar.disabled = true; }
}

async function salvarEBaixar() {
  const botao = $("#salvar"), passos = $("#passos");
  const passo = (t) => { const li = el("li", {}, el("span", { class: "estado ocupado" }), t); passos.append(li); return { ok: (x = "") => repor(li, el("span", { class: "ok" }, "✓"), t + x), falha: (m) => repor(li, el("span", { class: "falha" }, "!"), m) }; };
  botao.disabled = true; repor(passos, );
  try {
    const d = E.dados, res = resumo(d);
    let p = passo("Registrando a cotação");
    if (!E.id) {
      const c = await api.criarCotacao({ fonte: d.fonte, cliente: res.cliente, placa: res.placa, veiculo: res.veiculo });
      E.id = c.id; E.codigo = c.codigo; hashAtual = "#/cotacao/" + c.id; history.replaceState(null, "", hashAtual);
    }
    // PDFs lidos nesta sessão: grava o texto ocultado e troca o id provisório pelo id do banco.
    for (const a of E.arquivos.filter((x) => x.estado === "pronto" && !x.salvo)) {
      const novoId = await api.salvarFonte(E.id, { arquivo_nome: a.nome, texto: E.textos.get(a.id), extracao: a.extracao });
      for (const f of d.fontes) if (f.id === a.id) f.id = novoId;
      for (const s of d.seguradoras) if (s.fonte_id === a.id) s.fonte_id = novoId;
      E.textos.set(novoId, E.textos.get(a.id)); E.textos.delete(a.id);
      a.id = novoId; a.salvo = true; a.estado = "salvo";
    }
    const numero = await api.salvarVersao(E.id, d, res);
    p.ok(` (${E.codigo}, versão ${numero})`);

    p = passo("Gerando o PDF final");
    const blob = await gerarDocumento(d, rodapeCtx(`${E.codigo} · versão ${numero} · emitido em ${fmtDate(hoje())}`));
    const nome = nomeArquivo(d, E.codigo, numero);
    baixar(blob, nome); p.ok(" e baixado");
    E.sujo = false;

    if (await api.driveStatus()) {
      p = passo("Enviando ao Drive da Supera");
      try {
        const r = await api.driveEnviar({ cotacao_id: E.id, versao: numero, tipo: "documento", nome_arquivo: nome, base64: await blobParaBase64(blob) });
        for (const a of E.arquivos.filter((x) => x.file && !x.noDrive)) {
          await api.driveEnviar({ cotacao_id: E.id, tipo: "original", fonte_id: a.id, nome_arquivo: a.nome, base64: await blobParaBase64(a.file) });
          a.noDrive = true;
        }
        E.pastaUrl = r.pasta_url || E.pastaUrl;
        p.ok("");
        if (E.pastaUrl) passos.append(el("li", {}, el("a", { href: E.pastaUrl, target: "_blank", rel: "noopener" }, "Abrir a pasta da cotação no Drive")));
      } catch (x) { p.falha(x.message); }
    } else passos.append(el("li", { class: "mut" }, "O Drive ainda não está configurado; o PDF ficou salvo no sistema e no seu computador."));

    const r = await api.abrirCotacao(E.id); E.versoes = r.versoes;
    toast(`Versão ${numero} salva`);
    salvarRotulo();
  } catch (x) { console.error(x); toast(x.message || "Não foi possível salvar.", true); passos.append(el("li", { style: "color:var(--bad)" }, x.message)); }
  botao.disabled = false;
}
function salvarRotulo() { const b = $("#salvar"); if (b) b.textContent = "Salvar nova versão e baixar"; }

// ---------- Equipe (gestor) ----------
async function telaEquipe() {
  const lista = el("div"), uso = el("div", { class: "medidor" }), saude = el("div", { class: "saude" });
  const carregarSaude = async () => {
    const regs = await api.leituras(30).catch(() => []);
    const nomes = Object.fromEntries(LEITORES.map((l) => [l.id, l.nome]));
    const por = new Map();
    for (const r of regs.filter((r) => r.leitor !== "nenhum")) { if (!por.has(r.leitor)) por.set(r.leitor, []); por.get(r.leitor).push(r); }
    const naoRec = regs.filter((r) => r.resultado === "nao_reconhecido").length;
    const linhas = [...por].map(([id, rs]) => {
      const parciais = rs.filter((r) => r.resultado === "parcial").length;
      const ultimas = rs.slice(0, 5), quebrou = ultimas.filter((r) => r.resultado === "parcial").length >= 3;
      const cont = new Map(); for (const r of rs) for (const f of r.faltaram || []) cont.set(f, (cont.get(f) || 0) + 1);
      const maisFalta = [...cont].sort((a, b) => b[1] - a[1])[0];
      return el("tr", {},
        el("td", {}, el("div", { class: "cliente" }, nomes[id] || id), quebrou ? el("span", { class: "chip divergente" }, "Layout pode ter mudado") : null),
        el("td", { "data-r": "Leituras", class: "num" }, String(rs.length)),
        el("td", { "data-r": "Completas", class: "num" }, `${Math.round((rs.length - parciais) / rs.length * 100)}%`),
        el("td", { "data-r": "Mais falta", class: "mut" }, maisFalta ? `${rotuloCampo(maisFalta[0])} (${maisFalta[1]}x)` : "—"));
    });
    repor(saude,
      linhas.length ? el("div", { class: "tabela-env" }, el("table", { class: "lista" },
        el("thead", {}, el("tr", {}, el("th", {}, "Leitor"), el("th", {}, "Leituras"), el("th", {}, "Completas"), el("th", {}, "Campo que mais falta"))),
        el("tbody", {}, ...linhas))) : el("p", { class: "mut" }, "Nenhuma leitura automática nos últimos 30 dias."),
      naoRec ? el("p", { style: "font-size:14px;margin-top:10px" }, `${naoRec} PDF${naoRec > 1 ? "s" : ""} de layout não reconhecido no período. Se forem da mesma seguradora, vale criar um leitor para ela.`) : null,
      el("p", { class: "mut", style: "font-size:13px;margin-top:10px" }, "Quando aparecer “Layout pode ter mudado”, envie um PDF recente dessa seguradora para ajustar o leitor."));
  };
  const carregar = async () => {
    const { usuarios } = await api.usuarios("listar").catch((x) => { toast(x.message, true); return { usuarios: [] }; });
    repor(lista, el("div", { class: "tabela-env" }, el("table", { class: "lista" },
      el("thead", {}, el("tr", {}, el("th", {}, "Pessoa"), el("th", {}, "Papel"), el("th", {}, "Situação"), el("th", {}, "Último acesso"), el("th", {}, ""))),
      el("tbody", {}, ...usuarios.map((u) => el("tr", { style: "cursor:default" },
        el("td", {}, el("div", { class: "cliente" }, u.nome || "—"), el("div", { class: "mut", style: "font-size:13px" }, u.email), u.telefone ? el("div", { class: "mut num", style: "font-size:13px" }, fmtTel(u.telefone)) : null),
        el("td", { "data-r": "Papel" }, el("select", { "aria-label": `Papel de ${u.nome}`, disabled: u.id === eu.id, onchange: (e) => mudar(u, { papel: e.target.value }) },
          el("option", { value: "consultor", selected: u.papel === "consultor" }, "Consultor"), el("option", { value: "gestor", selected: u.papel === "gestor" }, "Gestor"))),
        el("td", { "data-r": "Situação" }, u.ativo ? el("span", { class: "chip ok" }, u.trocar_senha ? "Ativo, aguardando 1º acesso" : "Ativo") : el("span", { class: "chip" }, "Desativado")),
        el("td", { "data-r": "Último acesso", class: "num" }, u.ultimo_acesso ? dataHora(u.ultimo_acesso) : "—"),
        el("td", {}, el("div", { class: "linha" },
          el("button", { class: "discreto", onclick: () => redefinir(u) }, "Redefinir senha"),
          u.id !== eu.id ? el("button", { class: "discreto" + (u.ativo ? " perigo" : ""), onclick: () => mudar(u, { ativo: !u.ativo }) }, u.ativo ? "Desativar" : "Reativar") : null))))))));
    const registros = await api.usoIa(30).catch(() => []);
    const por = new Map();
    for (const r of registros) { const x = por.get(r.usuario_id) || { n: 0, e: 0, s: 0 }; x.n++; x.e += r.tokens_entrada; x.s += r.tokens_saida; por.set(r.usuario_id, x); }
    const custo = (x) => (x.e * CONFIG.CUSTO_USD_MTOK.entrada + x.s * CONFIG.CUSTO_USD_MTOK.saida) / 1e6;
    const maxN = Math.max(1, ...[...por.values()].map((x) => x.n));
    const total = [...por.values()].reduce((a, x) => a + custo(x), 0);
    repor(uso, 
      por.size ? null : el("p", { class: "mut" }, "Nenhuma leitura nos últimos 30 dias."),
      ...[...por].map(([id, x]) => el("div", { class: "item" },
        el("span", {}, usuarios.find((u) => u.id === id)?.nome || "—"), el("span", { class: "num" }, `${x.n} leituras · US$ ${custo(x).toFixed(2)}`),
        el("div", { class: "trilho" }, el("div", { class: "barra-p", style: `width:${x.n / maxN * 100}%` })))),
      por.size ? el("p", { class: "mut", style: "font-size:13px" }, `Estimativa total: US$ ${total.toFixed(2)} em 30 dias.`) : null);
  };
  const mudar = async (u, campos) => { try { await api.usuarios("atualizar", { id: u.id, ...campos }); toast("Alteração salva"); carregar(); } catch (x) { toast(x.message, true); carregar(); } };
  const mostrarSenha = (titulo, email, senha) => {
    repor(caixaSenha, el("h3", {}, titulo), el("p", { class: "mut" }, `Passe esta senha temporária para ${email}. Ela será trocada no primeiro acesso.`),
      el("div", { class: "senha-gerada" }, senha),
      el("button", { type: "button", onclick: async (e) => { try { await navigator.clipboard.writeText(senha); e.target.textContent = "Copiada"; } catch { toast("Selecione e copie a senha manualmente."); } } }, "Copiar senha"));
    caixaSenha.hidden = false;
  };
  const redefinir = async (u) => {
    if (!confirm(`Gerar uma nova senha temporária para ${u.nome || u.email}?`)) return;
    const senha = senhaTemporaria();
    try { await api.usuarios("redefinir_senha", { id: u.id, senha }); mostrarSenha("Senha redefinida", u.email, senha); carregar(); } catch (x) { toast(x.message, true); }
  };
  const caixaSenha = el("div", { class: "painel", hidden: true, style: "display:flex;flex-direction:column;gap:10px" });
  const f = { nome: el("input", { id: "n_nome", required: true }), email: el("input", { id: "n_email", type: "email", required: true }), tel: el("input", { id: "n_tel", inputmode: "tel" }),
    papel: el("select", { id: "n_papel" }, el("option", { value: "consultor" }, "Consultor"), el("option", { value: "gestor" }, "Gestor")) };
  const whats = el("input", { id: "whats", value: fmtTel(cfg.whatsapp_supera || ""), inputmode: "tel" });
  trocar(pagina(
    el("div", { class: "topo" }, el("div", {}, el("h1", {}, "Equipe"), el("p", { class: "sub" }, "Quem acessa o sistema, com que papel, e como está a leitura dos PDFs."))),
    el("div", { class: "dois" },
      el("div", { style: "display:flex;flex-direction:column;gap:22px;min-width:0" }, lista,
        el("section", { class: "painel" }, el("h2", {}, "Leitura automática nos últimos 30 dias"), saude),
        CONFIG.LEITURA_RESERVA === "api" ? el("section", { class: "painel" }, el("h2", {}, "Leituras pela API nos últimos 30 dias"), uso) : null),
      el("div", { style: "display:flex;flex-direction:column;gap:22px;min-width:0" },
        el("form", { class: "painel", style: "display:flex;flex-direction:column;gap:12px", onsubmit: async (e) => {
          e.preventDefault();
          const senha = senhaTemporaria();
          try {
            await api.usuarios("criar", { nome: f.nome.value.trim().toUpperCase(), email: f.email.value.trim(), telefone: fmtTel(f.tel.value), papel: f.papel.value, senha });
            mostrarSenha("Pessoa adicionada", f.email.value.trim(), senha); e.target.reset(); carregar();
          } catch (x) { toast(x.message, true); }
        } },
          el("h2", {}, "Adicionar pessoa"),
          el("div", { class: "campo" }, el("label", { for: "n_nome" }, "Nome"), f.nome),
          el("div", { class: "campo" }, el("label", { for: "n_email" }, "E-mail"), f.email),
          el("div", { class: "campo" }, el("label", { for: "n_tel" }, "Telefone"), f.tel),
          el("div", { class: "campo" }, el("label", { for: "n_papel" }, "Papel"), f.papel),
          el("p", { class: "mut", style: "font-size:13px" }, "O sistema gera uma senha temporária para você repassar. Gestor vê e edita todas as cotações e gerencia a equipe."),
          el("div", {}, el("button", { class: "primario" }, "Adicionar"))),
        caixaSenha,
        el("form", { class: "painel", style: "display:flex;flex-direction:column;gap:12px", onsubmit: async (e) => {
          e.preventDefault();
          try { await api.salvarConfig("whatsapp_supera", whats.value.replace(/\D/g, "")); cfg = await api.config(); whats.value = fmtTel(cfg.whatsapp_supera); toast("WhatsApp salvo"); } catch (x) { toast(x.message, true); }
        } },
          el("h2", {}, "WhatsApp da Supera"),
          el("p", { class: "mut", style: "font-size:13px" }, "Número que aparece em “Fale com a Supera” no rodapé de todos os documentos."),
          el("div", { class: "campo" }, el("label", { for: "whats" }, "Número com DDD"), whats),
          el("div", {}, el("button", { class: "primario" }, "Salvar número")))))));
  await Promise.all([carregar(), carregarSaude()]);
}

rotear();
