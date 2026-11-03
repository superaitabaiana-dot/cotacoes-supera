// Configuração pública do app (a chave publicável do Supabase pode ficar no navegador; as regras de acesso protegem os dados).
// Para testar sem servidor, abra com ?demo=1: login, IA e Drive são simulados com dados fictícios.
export const CONFIG = {
  SUPABASE_URL: "https://ysqrttttlodrwjkoojot.supabase.co",
  SUPABASE_CHAVE: "sb_publishable_8XV6x-QHkXnbFW_ai2mVVg_RgOIoOat",
  DEMO: new URLSearchParams(location.search).has("demo"),
  // Reserva para PDFs sem leitor automático. Decisão da Supera (03/11/2026): operar sem API, custo zero.
  // "colar": o consultor cola o pedido no claude.ai com a própria conta.
  // "api": função extrair com a API da Claude (paga; exige o segredo ANTHROPIC_API_KEY). Para ativar, troque aqui.
  // No modo demonstração a IA é simulada; ?leitura=colar força o caminho de colar nos testes.
  LEITURA_RESERVA: new URLSearchParams(location.search).has("demo") ? (new URLSearchParams(location.search).get("leitura") || "api") : "colar",
  // Custo de referência por milhão de tokens (Claude Opus 5.5), só para a estimativa na tela da equipe.
  CUSTO_USD_MTOK: { entrada: 4, saida: 20 },
};
