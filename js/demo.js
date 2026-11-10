// Modo demonstração (?demo=1): tudo fica no navegador, a IA é simulada e todos os dados são fictícios.
import { ErroApi } from "./api.js";
import { addDays, fmtDate, hoje, uid } from "./util.js";

const CHAVE = "supera_demo_v1";
export const USUARIOS_DEMO = [
  { id: "u-gestor", nome: "GESTOR EXEMPLO", email: "gestor@exemplo.com", telefone: "79999990000", papel: "gestor", senha: "demo-gestor" },
  { id: "u-consultor", nome: "CONSULTOR EXEMPLO", email: "consultor@exemplo.com", telefone: "79988887777", papel: "consultor", senha: "demo-consultor" },
];

/** Datas fictícias relativas a hoje, para a demonstração nunca abrir com cotação vencida. */
export function datasDemo() {
  const h = hoje(), ini = addDays(h, 12), fim = new Date(ini.getFullYear() + 1, ini.getMonth(), ini.getDate());
  return { data_cotacao: fmtDate(h), validade_cotacao: fmtDate(addDays(h, 5)), vigencia_inicio: fmtDate(ini), vigencia_fim: fmtDate(fim), vencimento_anterior: fmtDate(ini) };
}

const pg = (forma, parcelas, valor_parcela, total, juros = false) => ({ forma, parcelas, valor_parcela, valor_entrada: "", total, juros });
export const SEGURADORAS_DEMO = {
  HDI: { seguradora: "HDI", numero_cotacao: "9001001", opcoes: [{
    nome: "Franquia reduzida", fipe: "100%", franquia: "R$ 3.450,00 (REDUZIDA)", danos_materiais: "R$ 200.000,00", danos_corporais: "R$ 200.000,00",
    danos_morais: "R$ 20.000,00", app: "R$ 10.000,00 POR PASSAGEIRO", guincho: "SEM LIMITE DE KM", carro_reserva: "15 DIAS", vidros: "COMPLETA",
    logo_marca: true, pequenos_reparos: true, roda_pneu: false, outras_coberturas: "", premio_total: "R$ 3.912,45",
    pagamentos: [pg("Cartão de crédito", 1, "R$ 3.912,45", "R$ 3.912,45"), pg("Cartão de crédito", 10, "R$ 391,25", "R$ 3.912,50"), pg("Débito em conta", 1, "R$ 3.912,45", "R$ 3.912,45"), pg("Débito em conta", 5, "R$ 782,49", "R$ 3.912,45")] }] },
  PORTO: { seguradora: "Porto Seguro", numero_cotacao: "9002002", opcoes: [{
    nome: "Franquia normal", fipe: "100%", franquia: "R$ 4.120,00 (NORMAL)", danos_materiais: "R$ 200.000,00", danos_corporais: "R$ 200.000,00",
    danos_morais: "R$ 20.000,00", app: "R$ 10.000,00 POR PASSAGEIRO", guincho: "ILIMITADO", carro_reserva: "15 DIAS BÁSICO", vidros: "COMPLETA",
    logo_marca: true, pequenos_reparos: true, roda_pneu: true, outras_coberturas: "DEFESA PENAL", premio_total: "R$ 4.188,90",
    pagamentos: [pg("Cartão Porto Seguro", 1, "R$ 4.188,90", "R$ 4.188,90"), pg("Cartão Porto Seguro", 12, "R$ 349,08", "R$ 4.188,96")] }] },
  AZUL: { seguradora: "Azul", numero_cotacao: "9003003", opcoes: [{
    nome: "Franquia normal", fipe: "100%", franquia: "R$ 4.120,00 (NORMAL)", danos_materiais: "R$ 150.000,00", danos_corporais: "R$ 150.000,00",
    danos_morais: "R$ 10.000,00", app: "NÃO CONTRATADO", guincho: "400 KM", carro_reserva: "7 DIAS BÁSICO", vidros: "SÓ VIDROS",
    logo_marca: null, pequenos_reparos: false, roda_pneu: false, outras_coberturas: "", premio_total: "R$ 3.640,12",
    pagamentos: [pg("Cartão de crédito", 1, "R$ 3.640,12", "R$ 3.640,12"), pg("Cartão de crédito", 10, "R$ 364,01", "R$ 3.640,10")] }] },
};

export function extracaoDemo(chaves, multicalculo = false) {
  return {
    tipo_documento: multicalculo ? "MULTICALCULO" : "SEGURADORA",
    segurado: "MARIA EXEMPLO DA SILVA", condutor: "MARIA EXEMPLO DA SILVA", estado_civil: "CASADA", cep: "49000-000", uso: "PARTICULAR",
    tipo: "RENOVACAO", seguradora_anterior: "EXEMPLO SEGUROS", bonus: "3", veiculo: "VW T-CROSS 200 TSI 1.0", placa: "ABC1D23", ano_modelo: "2024/2025",
    valor_referencia: "R$ 118.450,00", ...datasDemo(), validade_dias: null, cobertura_menor_25: "NÃO",
    seguradoras: chaves.map((c) => structuredClone(SEGURADORAS_DEMO[c])), alertas: [],
  };
}

function ler() { try { return JSON.parse(localStorage.getItem(CHAVE)) || null; } catch { return null; } }
function gravar(db) { try { localStorage.setItem(CHAVE, JSON.stringify(db)); } catch { /* armazenamento indisponível: segue em memória */ } }

export function criarApiDemo() {
  let db = ler() || { usuarios: USUARIOS_DEMO.map((u) => ({ ...u, ativo: true, trocar_senha: false, criado_em: new Date().toISOString() })), cotacoes: [], versoes: [], fontes: [], config: { whatsapp_supera: "7900000000" }, uso: [], seq: 0, sessao: null };
  const salvar = () => gravar(db);
  const eu = () => db.usuarios.find((u) => u.id === db.sessao);
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const visivel = (c) => eu()?.papel === "gestor" || c.consultor_id === db.sessao;
  const semSenha = ({ senha, ...u }) => u;

  const api = {
    demo: true,
    async sessao() { return eu() ? { id: db.sessao } : null; },
    async entrar(email, senha) {
      const u = db.usuarios.find((x) => x.email === email.trim().toLowerCase() && x.senha === senha && x.ativo);
      if (!u) throw new ErroApi("login", "E-mail ou senha incorretos.");
      db.sessao = u.id; salvar();
    },
    async sair() { db.sessao = null; salvar(); },
    async perfil() { return eu() ? semSenha(eu()) : null; },
    async trocarSenha(nova) { eu().senha = nova; eu().trocar_senha = false; salvar(); },
    async atualizarPerfil(nome, telefone) { Object.assign(eu(), { nome, telefone }); salvar(); },
    async config() { return { ...db.config }; },
    async salvarConfig(chave, valor) { db.config[chave] = valor; salvar(); },

    async extrair(texto, arquivo_nome) {
      await espera(700);
      const t = texto.toUpperCase();
      const multi = t.includes("SEGFY") || t.includes("MULTICÁLCULO") || t.includes("MULTICALCULO");
      const chaves = ["HDI", "PORTO", "AZUL"].filter((c) => t.includes(c === "PORTO" ? "PORTO SEGURO" : c === "AZUL" ? "AZUL SEGUROS" : "HDI SEGUROS"));
      if (!chaves.length) throw new ErroApi("recusado", "A IA não reconheceu uma cotação de seguro auto neste arquivo.");
      db.uso.push({ usuario_id: db.sessao, tokens_entrada: 9000, tokens_saida: 2500, sucesso: true, criado_em: new Date().toISOString(), arquivo_nome }); salvar();
      return { dados: extracaoDemo(multi ? chaves : chaves.slice(0, 1), multi), modelo: "demonstração", uso: { tokens_entrada: 9000, tokens_saida: 2500 } };
    },

    async listarCotacoes({ busca = "", consultor = "" } = {}) {
      const b = busca.toLowerCase();
      return db.cotacoes.filter(visivel).filter((c) => !consultor || c.consultor_id === consultor)
        .filter((c) => !b || [c.cliente, c.codigo].some((v) => String(v).toLowerCase().includes(b)) || String(c.placa).toLowerCase().includes(b.replace(/[^a-z0-9]/g, "")))
        .map((c) => {
          const v = db.versoes.find((x) => x.cotacao_id === c.id && x.numero === c.versao_atual);
          return { ...c, consultor_nome: db.usuarios.find((u) => u.id === c.consultor_id)?.nome, resumo: v?.resumo, drive_arquivo_url: v?.drive_arquivo_url };
        }).sort((a, b2) => b2.atualizado_em.localeCompare(a.atualizado_em));
    },
    async criarCotacao(campos) {
      db.seq++;
      const c = { id: uid(), codigo: `SUP-${new Date().getFullYear()}-${String(db.seq).padStart(5, "0")}`, consultor_id: db.sessao, versao_atual: 0, drive_pasta_url: null, criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(), cliente: "", placa: "", veiculo: "", fonte: "seguradoras", ...campos };
      db.cotacoes.push(c); salvar(); return { id: c.id, codigo: c.codigo, consultor_id: c.consultor_id };
    },
    async salvarFonte(cotacao_id, f) { const id = uid(); db.fontes.push({ id, cotacao_id, arquivo_nome: f.arquivo_nome, texto_mascarado: f.texto }); salvar(); return id; },
    async salvarVersao(cotacao_id, dados, resumo) {
      const c = db.cotacoes.find((x) => x.id === cotacao_id);
      c.versao_atual++; Object.assign(c, { cliente: resumo.cliente, placa: resumo.placa, veiculo: resumo.veiculo, atualizado_em: new Date().toISOString() });
      db.versoes.push({ cotacao_id, numero: c.versao_atual, dados, resumo, criado_em: new Date().toISOString(), drive_arquivo_url: null });
      salvar(); return c.versao_atual;
    },
    async versoes(id) { return db.versoes.filter((v) => v.cotacao_id === id).sort((a, b) => b.numero - a.numero).map(({ numero, criado_em, drive_arquivo_url }) => ({ numero, criado_em, drive_arquivo_url })); },
    async abrirCotacao(id) {
      const c = db.cotacoes.find((x) => x.id === id && visivel(x));
      if (!c) throw new ErroApi("sem_acesso", "Cotação não encontrada.");
      const dono = db.usuarios.find((u) => u.id === c.consultor_id);
      return {
        cot: { ...c, consultor_nome: dono?.nome },
        versoes: db.versoes.filter((v) => v.cotacao_id === id).sort((a, b) => b.numero - a.numero),
        fontes: db.fontes.filter((f) => f.cotacao_id === id),
        dono: dono ? { nome: dono.nome, telefone: dono.telefone } : null,
      };
    },
    async driveStatus() { return true; },
    async driveEnviar({ cotacao_id, versao, tipo }) {
      await espera(300);
      const c = db.cotacoes.find((x) => x.id === cotacao_id);
      c.drive_pasta_url = c.drive_pasta_url || "https://drive.google.com/drive/folders/demonstracao";
      const url = "https://drive.google.com/file/d/demonstracao-" + uid();
      if (tipo === "documento") { const v = db.versoes.find((x) => x.cotacao_id === cotacao_id && x.numero === versao); if (v) v.drive_arquivo_url = url; }
      salvar(); return { configurado: true, arquivo_url: url, pasta_url: c.drive_pasta_url };
    },
    async usuarios(acao, corpo = {}) {
      if (eu()?.papel !== "gestor") throw new ErroApi("so_gestor", "Só o gestor gerencia a equipe.");
      if (acao === "listar") return { usuarios: db.usuarios.map((u) => ({ ...semSenha(u), ultimo_acesso: u.id === db.sessao ? new Date().toISOString() : null })) };
      if (acao === "criar") {
        if (db.usuarios.some((u) => u.email === corpo.email)) throw new ErroApi("criar", "Já existe um usuário com este e-mail.");
        db.usuarios.push({ id: uid(), nome: corpo.nome, email: corpo.email.toLowerCase(), telefone: corpo.telefone || "", papel: corpo.papel, senha: corpo.senha, ativo: true, trocar_senha: true, criado_em: new Date().toISOString() });
        salvar(); return { ok: true };
      }
      const u = db.usuarios.find((x) => x.id === corpo.id);
      if (acao === "atualizar") {
        if (u.id === db.sessao && (corpo.ativo === false || corpo.papel === "consultor")) throw new ErroApi("proprio", "Você não pode desativar nem rebaixar o próprio acesso.");
        for (const k of ["nome", "telefone", "papel", "ativo"]) if (corpo[k] !== undefined) u[k] = corpo[k];
        salvar(); return { ok: true };
      }
      if (acao === "redefinir_senha") { u.senha = corpo.senha; u.trocar_senha = true; salvar(); return { ok: true }; }
      throw new ErroApi("acao", "Ação desconhecida.");
    },
    async usoIa() { return db.uso; },
    async registrarLeitura(reg) { (db.leituras ||= []).unshift({ ...reg, criado_em: new Date().toISOString() }); salvar(); },
    async leituras() { return db.leituras || []; },
  };
  // ?latencia=250 simula o atraso de cada ida ao servidor (Supabase em us-west-2 visto do Brasil: ~0,25 s), para medir telas.
  const atraso = Number(new URLSearchParams(location.search).get("latencia")) || 0;
  if (atraso) for (const [k, f] of Object.entries(api)) if (typeof f === "function") api[k] = async (...a) => { await espera(atraso); return f.apply(api, a); };
  return api;
}
