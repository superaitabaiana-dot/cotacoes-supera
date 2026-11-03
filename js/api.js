// Acesso a dados. Mesma interface para o Supabase real e para o modo demonstração.
import { CONFIG } from "./config.js";

export class ErroApi extends Error {
  constructor(codigo, mensagem) { super(mensagem); this.codigo = codigo; }
}

export async function criarApi() {
  if (CONFIG.DEMO) return (await import("./demo.js")).criarApiDemo();
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm");
  return apiSupabase(createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_CHAVE));
}

function apiSupabase(sb) {
  const ok = ({ data, error }, msg = "Não foi possível concluir. Tente de novo.") => {
    if (error) throw new ErroApi(error.code || "erro", error.message?.includes("JWT") ? "Sua sessão expirou. Entre novamente." : msg);
    return data;
  };
  async function funcao(nome, corpo) {
    const { data, error } = await sb.functions.invoke(nome, { body: corpo });
    if (!error) return data;
    let info = null; try { info = await error.context?.json(); } catch { /* sem corpo */ }
    throw new ErroApi(info?.erro || "falha", info?.mensagem || "O servidor não respondeu. Confira a conexão e tente de novo.");
  }

  return {
    demo: false,
    async sessao() { const { data } = await sb.auth.getSession(); return data.session?.user ?? null; },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      if (error) throw new ErroApi("login", error.message.includes("Invalid") ? "E-mail ou senha incorretos." : "Não foi possível entrar agora.");
    },
    async sair() { await sb.auth.signOut(); },
    async perfil() {
      const u = await this.sessao(); if (!u) return null;
      return ok(await sb.from("perfis").select("*").eq("id", u.id).single());
    },
    async trocarSenha(nova) {
      const { error } = await sb.auth.updateUser({ password: nova });
      if (error) throw new ErroApi("senha", error.message.includes("different") ? "A nova senha precisa ser diferente da atual." : "Não foi possível trocar a senha.");
      ok(await sb.rpc("marcar_senha_trocada"));
    },
    async atualizarPerfil(nome, telefone) { ok(await sb.rpc("atualizar_meu_perfil", { p_nome: nome, p_telefone: telefone })); },
    async config() {
      const linhas = ok(await sb.from("configuracoes").select("chave,valor"));
      return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    },
    async salvarConfig(chave, valor) { ok(await sb.from("configuracoes").upsert({ chave, valor, atualizado_em: new Date().toISOString() })); },

    async extrair(texto, arquivo_nome) { return funcao("extrair", { texto, arquivo_nome }); },

    async listarCotacoes({ busca = "", consultor = "" } = {}) {
      let q = sb.from("cotacoes_lista").select("*").order("atualizado_em", { ascending: false }).limit(200);
      if (consultor) q = q.eq("consultor_id", consultor);
      if (busca) { const b = busca.replace(/[%,()]/g, " ").trim(); q = q.or(`cliente.ilike.%${b}%,placa.ilike.%${b}%,codigo.ilike.%${b}%`); }
      return ok(await q);
    },
    async criarCotacao(campos) { return ok(await sb.from("cotacoes").insert(campos).select("id,codigo,consultor_id").single()); },
    async salvarFonte(cotacao_id, f) {
      return ok(await sb.from("cotacao_fontes").insert({ cotacao_id, arquivo_nome: f.arquivo_nome, texto_mascarado: f.texto, extracao: f.extracao }).select("id").single()).id;
    },
    async salvarVersao(cotacao_id, dados, resumo) { return ok(await sb.rpc("salvar_versao", { p_cotacao: cotacao_id, p_dados: dados, p_resumo: resumo })); },
    async abrirCotacao(id) {
      const cot = ok(await sb.from("cotacoes_lista").select("*").eq("id", id).single(), "Cotação não encontrada.");
      const versoes = ok(await sb.from("cotacao_versoes").select("numero,dados,criado_em,drive_arquivo_url").eq("cotacao_id", id).order("numero", { ascending: false }));
      const fontes = ok(await sb.from("cotacao_fontes").select("id,arquivo_nome,texto_mascarado").eq("cotacao_id", id));
      const dono = ok(await sb.from("perfis").select("nome,telefone").eq("id", cot.consultor_id).maybeSingle());
      return { cot, versoes, fontes, dono };
    },
    async driveStatus() { try { return (await funcao("drive", { acao: "status" })).configurado; } catch { return false; } },
    async driveEnviar(corpo) { return funcao("drive", { acao: "enviar", ...corpo }); },
    async usuarios(acao, corpo = {}) { return funcao("usuarios", { acao, ...corpo }); },
    async registrarLeitura(reg) { ok(await sb.from("leituras").insert(reg)); },
    async leituras(dias = 30) {
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      return ok(await sb.from("leituras").select("leitor,seguradora,resultado,campos_ok,campos_total,faltaram,criado_em").gte("criado_em", desde).order("criado_em", { ascending: false }).limit(5000));
    },
    async usoIa(dias = 30) {
      const desde = new Date(Date.now() - dias * 864e5).toISOString();
      return ok(await sb.from("uso_ia").select("usuario_id,tokens_entrada,tokens_saida,sucesso,criado_em").gte("criado_em", desde).limit(5000));
    },
  };
}
