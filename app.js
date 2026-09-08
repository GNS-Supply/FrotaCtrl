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
      if (dados.bloqueado) {
        await auth.signOut();
        window.location.href = "index.html?bloqueado=1";
        return;
      }
      if (perfilEsperado && dados.tipo !== perfilEsperado && dados.tipo !== "administrador") {
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

// Preenche avatar + nome/perfil no topbar (nome/perfil só aparecem em telas
// largas — ver .topbar__meta no CSS). Evita ter que editar o HTML de cada
// uma das 6 páginas de perfil.
function popularTopbarMeta(usuario) {
  const avatar = document.getElementById("user-avatar");
  if (!avatar) return;
  avatar.textContent = iniciais(usuario.nome);
  if (avatar.parentElement.querySelector(".topbar__meta")) return;
  const meta = document.createElement("div");
  meta.className = "topbar__meta";
  meta.innerHTML = `<span class="topbar__meta-nome">${escapeHtml(usuario.nome)}</span><span class="topbar__meta-perfil">${PERFIL_LABELS[usuario.tipo] || ""}</span>`;
  avatar.parentElement.insertBefore(meta, avatar);
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

// ---------- Responsável atual (de quem é a vez de agir) ----------
const PROXIMO_RESPONSAVEL = {
  registrado: "gestao_frota",
  em_triagem: "gestao_frota",
  fornecedor_acionado: "fornecedor",
  atendimento_programado: "fornecedor",
  em_avaliacao_tecnica: "fornecedor",
  aguardando_documentacao_mau_uso: "fornecedor",
  aguardando_validacao: "manutencao",
  mau_uso_contestado: "gestao_frota",
  aguardando_aprovacao: "aprovador",
  aguardando_autorizacao: "gestao_frota",
  em_manutencao: "fornecedor",
  em_teste: "fornecedor",
  liberado: "fornecedor",
  reprovado: null,
  concluido: null,
  cancelado: null
};
function responsavelAtualHtml(status) {
  const perfil = PROXIMO_RESPONSAVEL[status];
  if (!perfil) return "";
  return `<span class="badge badge--muted">Aguardando: ${PERFIL_LABELS[perfil]}</span>`;
}

// ---------- Máscaras de campo ----------
// Telefone: (00) 00000-0000 (adapta para fixo de 10 dígitos também)
function aplicarMascaraTelefone(el) {
  if (!el) return;
  el.setAttribute("inputmode", "numeric");
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "").slice(0, 11);
    if (v.length > 10) v = v.replace(/(\d{2})(\d{5})(\d{0,4}).*/, "($1) $2-$3");
    else if (v.length > 5) v = v.replace(/(\d{2})(\d{4})(\d{0,4}).*/, "($1) $2-$3");
    else if (v.length > 2) v = v.replace(/(\d{2})(\d{0,5}).*/, "($1) $2");
    else if (v.length > 0) v = v.replace(/(\d{0,2}).*/, "($1");
    el.value = v;
  });
}

// Moeda: R$ 0.000,00 — digitação estilo calculadora (centavos da direita p/ esquerda)
function aplicarMascaraMoeda(el) {
  if (!el) return;
  el.setAttribute("inputmode", "numeric");
  el.setAttribute("placeholder", "R$ 0,00");
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "");
    if (!v) { el.value = ""; return; }
    v = (parseInt(v, 10) / 100).toFixed(2);
    const [intPart, decPart] = v.split(".");
    el.value = "R$ " + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decPart;
  });
}
function valorMoedaParaNumero(el) {
  if (!el || !el.value) return 0;
  const v = el.value.replace(/[^\d,]/g, "").replace(",", ".");
  return parseFloat(v) || 0;
}
function definirValorMoeda(el, numero) {
  if (!el) return;
  if (numero == null || isNaN(numero)) { el.value = ""; return; }
  const [intPart, decPart] = numero.toFixed(2).split(".");
  el.value = "R$ " + intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decPart;
}

// Número fracionado: 0.000,00 (ex: horímetro) — mesma digitação estilo calculadora, sem "R$"
function aplicarMascaraFracionado(el) {
  if (!el) return;
  el.setAttribute("inputmode", "numeric");
  el.addEventListener("input", () => {
    let v = el.value.replace(/\D/g, "");
    if (!v) { el.value = ""; return; }
    v = (parseInt(v, 10) / 100).toFixed(2);
    const [intPart, decPart] = v.split(".");
    el.value = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decPart;
  });
}
function valorFracionadoParaNumero(el) {
  if (!el || !el.value) return 0;
  const v = el.value.replace(/\./g, "").replace(",", ".");
  return parseFloat(v) || 0;
}
function definirValorFracionado(el, numero) {
  if (!el) return;
  if (numero == null || isNaN(numero)) { el.value = ""; return; }
  const [intPart, decPart] = numero.toFixed(2).split(".");
  el.value = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "," + decPart;
}

// ---------- Indicador de progresso (bolinhas) ----------
// Simplifica o fluxo completo (que tem ~17 status) em 6 macro-etapas
// visuais, do jeito que foi pedido: concluídas em verde, a atual em
// amarelo, as futuras em cinza — e se o chamado foi encerrado no meio
// do caminho (reprovado/cancelado), as etapas não completadas ficam
// vermelhas em vez de cinza.
const MACRO_ETAPAS = ["Registrado", "Atendimento", "Diagnóstico", "Aprovação", "Execução", "Concluído"];
const STATUS_PARA_ETAPA = {
  registrado: 0,
  em_triagem: 1, fornecedor_acionado: 1, atendimento_programado: 1, em_avaliacao_tecnica: 1,
  diagnostico: 2, aguardando_documentacao_mau_uso: 2, aguardando_validacao: 2, mau_uso_contestado: 2,
  aguardando_aprovacao: 3, aguardando_autorizacao: 3,
  em_manutencao: 4, em_teste: 4,
  liberado: 5, concluido: 5,
  reprovado: 3,
  cancelado: 0
};
const STATUS_ENCERRADO_SEM_SUCESSO = ["reprovado", "cancelado"];

function stepperHtml(status, comLabels) {
  const atual = STATUS_PARA_ETAPA[status] ?? 0;
  const concluido = status === "concluido";
  const encerradoSemSucesso = STATUS_ENCERRADO_SEM_SUCESSO.includes(status);
  return `<div class="stepper">${MACRO_ETAPAS.map((label, i) => {
    let cor;
    if (concluido) cor = "verde";
    else if (encerradoSemSucesso) cor = i < atual ? "verde" : "vermelho";
    else if (i < atual) cor = "verde";
    else if (i === atual) cor = "amarelo";
    else cor = "cinza";
    return `<div class="stepper__item">
      <div class="stepper__dot stepper__dot--${cor}"></div>
      ${comLabels ? `<div class="stepper__label">${label}</div>` : ""}
    </div>`;
  }).join("")}</div>`;
}

// ---------- Atalho para o Painel Master ----------
// Quem está logado como "administrador" (a conta master oculta) navega
// livremente para qualquer painel, mas fica sem volta pro hub. Isso
// injeta um item extra no menu lateral, visível só para essa conta.
function adicionarAtalhoMaster(usuario) {
  if (!usuario || usuario.tipo !== "administrador") return;
  const nav = document.querySelector(".bottomnav");
  if (!nav || nav.querySelector(".navitem--master")) return;
  const a = document.createElement("a");
  a.href = "administrador.html";
  a.className = "navitem navitem--master";
  a.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.4 5.5L20 8l-4.4 3.8L17 18l-5-3.2L7 18l1.4-6.2L4 8l5.6-.5L12 2z"/></svg> Painel Master`;
  nav.appendChild(a);
}

// ---------- Chamado ativo por equipamento ----------
// Impede abrir um novo chamado para uma máquina que já tem um em
// andamento (não concluído/cancelado).
async function equipamentoTemChamadoAtivo(equipamentoId) {
  const snap = await db.collection("chamados").where("equipamentoId", "==", equipamentoId).get();
  const ativos = snap.docs.map((d) => d.data()).filter((c) => STATUS_ATIVOS.includes(c.status));
  return ativos.length > 0 ? ativos[0] : null;
}
