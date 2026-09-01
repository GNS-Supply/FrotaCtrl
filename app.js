// ============================================================
// app.js — utilitários e constantes compartilhadas (v2)
// ============================================================

// ---------- Perfis ----------
const PERFIL_LABELS = {
  solicitante: "Solicitante",
  gestao_frota: "Gestão de Frota",
  fornecedor: "Fornecedor",
  manutencao: "Manutenção Magius",
  aprovador: "Aprovador",
  administrador: "Administrador"
};
const PERFIL_HOME = {
  solicitante: "solicitante.html",
  gestao_frota: "gestao-frota.html",
  fornecedor: "fornecedor.html",
  manutencao: "manutencao.html",
  aprovador: "aprovador.html",
  administrador: "administrador.html"
};

// ---------- Status do chamado ----------
const STATUS_LABELS = {
  registrado: "Registrado",
  em_triagem: "Em triagem",
  fornecedor_acionado: "Fornecedor acionado",
  atendimento_programado: "Atendimento programado",
  em_avaliacao_tecnica: "Em avaliação técnica",
  diagnostico: "Diagnóstico emitido",
  aguardando_documentacao_mau_uso: "Aguardando documentação (mau uso)",
  aguardando_validacao: "Aguardando validação (Manutenção Magius)",
  mau_uso_contestado: "Mau uso contestado",
  aguardando_aprovacao: "Aguardando aprovação",
  reprovado: "Reprovado",
  aguardando_autorizacao: "Aguardando autorização",
  em_manutencao: "Em manutenção",
  em_teste: "Em teste",
  liberado: "Liberado / aguardando faturamento",
  concluido: "Concluído",
  cancelado: "Cancelado"
};
const STATUS_COLORS = {
  registrado: "muted",
  em_triagem: "amber",
  fornecedor_acionado: "blue",
  atendimento_programado: "blue",
  em_avaliacao_tecnica: "blue",
  diagnostico: "amber",
  aguardando_documentacao_mau_uso: "amber",
  aguardando_validacao: "amber",
  mau_uso_contestado: "red",
  aguardando_aprovacao: "amber",
  reprovado: "red",
  aguardando_autorizacao: "amber",
  em_manutencao: "blue",
  em_teste: "blue",
  liberado: "green",
  concluido: "green",
  cancelado: "red"
};
// Status em que o equipamento é considerado indisponível/parado
const STATUS_ATIVOS = Object.keys(STATUS_LABELS).filter((s) => !["concluido", "cancelado"].includes(s));

// ---------- Classificação da ocorrência ----------
const CATEGORIAS = [
  "Rodas / Pneus", "Freios", "Cabos / Conectores", "Vazamento", "Motor / Transmissão",
  "Garfos", "Direção", "Carregador", "Impacto / Colisão", "GLP",
  "Torre / Elevação", "Bateria", "Sensor / Elétrica", "Estrutural", "Outro"
];
const CRITICIDADE_LABELS = {
  P1: "P1 · Crítico (parado / segurança)",
  P2: "P2 · Restrito (opera com limitação)",
  P3: "P3 · Programável (sem impacto imediato)"
};
const TURNO_LABELS = { manha: "Manhã", tarde: "Tarde", noite: "Noite" };

// ---------- Equipamento ----------
const STATUS_OPERACIONAL_LABELS = {
  operacional: "Operacional",
  operacional_restricao: "Operacional com restrição",
  parado: "Parado",
  em_manutencao: "Em manutenção",
  indisponivel: "Indisponível",
  desativado: "Desativado"
};
const STATUS_OPERACIONAL_COLORS = {
  operacional: "green",
  operacional_restricao: "amber",
  parado: "red",
  em_manutencao: "blue",
  indisponivel: "red",
  desativado: "muted"
};

const TIPO_MANUTENCAO_LABELS = {
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  mau_uso: "Mau uso",
  desgaste: "Desgaste padrão"
};

const PARECER_LABELS = {
  confirmado: "Mau uso confirmado",
  nao_confirmado: "Mau uso não confirmado",
  inconclusivo: "Inconclusivo"
};

// ---------- Autenticação ----------
function requireAuth(perfilEsperado) {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      const snap = await db.collection("usuarios").doc(user.uid).get();
      if (!snap.exists) {
        await auth.signOut();
        window.location.href = "index.html";
        return;
      }
      const dados = snap.data();
      if (perfilEsperado && dados.tipo !== perfilEsperado) {
        window.location.href = PERFIL_HOME[dados.tipo] || "index.html";
        return;
      }
      resolve({ uid: user.uid, ...dados });
    });
  });
}

function logout() {
  auth.signOut().then(() => (window.location.href = "index.html"));
}

// ---------- Formatação ----------
function formatarData(timestamp) {
  if (!timestamp) return "—";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function msParaDuracao(ms) {
  if (ms == null || ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  const hRest = h % 24;
  const minRest = min % 60;
  if (d > 0) return `${d}d ${hRest}h`;
  if (h > 0) return `${h}h ${minRest}min`;
  return `${minRest}min`;
}
function tsToMs(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate().getTime() : ts;
}
function formatarMoeda(valor) {
  if (valor == null) return "—";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function badgeHtml(status, labels = STATUS_LABELS, colors = STATUS_COLORS) {
  const cor = colors[status] || "muted";
  const label = labels[status] || status;
  return `<span class="badge badge--${cor}">${label}</span>`;
}
function iniciais(nome) {
  if (!nome) return "?";
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
}
function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function optionsHtml(map, selecionado) {
  return Object.entries(map)
    .map(([v, label]) => `<option value="${v}" ${v === selecionado ? "selected" : ""}>${label}</option>`)
    .join("");
}

// ---------- Numeração sequencial de chamados (CH-2026-00001) ----------
async function proximoNumeroChamado() {
  const ano = new Date().getFullYear();
  const counterRef = db.collection("contadores").doc(`chamados-${ano}`);
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const atual = doc.exists ? doc.data().valor : 0;
    const proximo = atual + 1;
    tx.set(counterRef, { valor: proximo }, { merge: true });
    return `CH-${ano}-${String(proximo).padStart(5, "0")}`;
  });
}

// ---------- Transição de status (padroniza histórico/auditoria) ----------
async function transicionarChamado(chamadoId, novoStatus, obs, autor, perfil, extraFields = {}) {
  const entry = {
    status: novoStatus,
    timestamp: Date.now(),
    obs: obs || STATUS_LABELS[novoStatus] || novoStatus,
    autor: autor || "—",
    perfil: PERFIL_LABELS[perfil] || perfil || "—"
  };
  await db.collection("chamados").doc(chamadoId).update({
    status: novoStatus,
    ...extraFields,
    historico: firebase.firestore.FieldValue.arrayUnion(entry)
  });
}

// ---------- Parâmetros de recorrência (configuráveis pelo Administrador) ----------
async function obterParametrosRecorrencia() {
  const snap = await db.collection("configuracoes").doc("parametros").get();
  if (snap.exists) return snap.data();
  return { atencaoQtd: 2, atencaoDias: 90, altaQtd: 3, altaDias: 90 };
}

function classificarRecorrencia(chamadosDoEquipamento, params) {
  const agora = Date.now();
  const janela = params.altaDias || 90;
  const recentes = chamadosDoEquipamento.filter((c) => {
    const ms = tsToMs(c.registradoEm || c.historico?.[0]?.timestamp);
    return ms && agora - ms <= janela * 24 * 60 * 60 * 1000;
  });
  if (recentes.length >= (params.altaQtd || 3)) return "alta";
  if (recentes.length >= (params.atencaoQtd || 2)) return "atencao";
  return "normal";
}
const RECORRENCIA_LABELS = { normal: "Normal", atencao: "Atenção", alta: "Alta recorrência" };
const RECORRENCIA_COLORS = { normal: "muted", atencao: "amber", alta: "red" };
