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

// ---------- Status do chamado (segue o fluxograma definido pelo usuário) ----------
const STATUS_LABELS = {
  registrado: "Registrado",
  em_triagem: "Em triagem",
  fornecedor_acionado: "Fornecedor acionado",
  atendimento_programado: "Atendimento programado",
  em_avaliacao_tecnica: "Em avaliação técnica",
  diagnostico_contestado: "Diagnóstico contestado — aguardando fornecedor",
  aguardando_validacao: "Aguardando validação (Manutenção Magius)",
  aguardando_aprovacao: "Aguardando ciência do aprovador",
  aguardando_autorizacao: "Aguardando autorização (Gestão de Frota)",
  em_teste: "Em execução / teste",
  liberado: "Liberado — aguardando documentação",
  aguardando_ordem_compra: "Aguardando ordem de compra",
  aguardando_nf: "Aguardando nota fiscal",
  concluido: "Concluído",
  cancelado: "Cancelado"
};
const STATUS_COLORS = {
  registrado: "muted",
  em_triagem: "amber",
  fornecedor_acionado: "blue",
  atendimento_programado: "blue",
  em_avaliacao_tecnica: "blue",
  diagnostico_contestado: "red",
  aguardando_validacao: "amber",
  aguardando_aprovacao: "amber",
  aguardando_autorizacao: "amber",
  em_teste: "blue",
  liberado: "blue",
  aguardando_ordem_compra: "amber",
  aguardando_nf: "amber",
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
async function transicionarChamado(chamadoId, novoStatus, obs, autor, perfil, extraFields = {}, dadosEtapa = null) {
  const entry = {
    status: novoStatus,
    timestamp: Date.now(),
    obs: obs || STATUS_LABELS[novoStatus] || novoStatus,
    autor: autor || "—",
    perfil: PERFIL_LABELS[perfil] || perfil || "—"
  };
  if (dadosEtapa) entry.dados = dadosEtapa;
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
  diagnostico_contestado: "fornecedor",
  aguardando_validacao: "manutencao",
  aguardando_aprovacao: "aprovador",
  aguardando_autorizacao: "gestao_frota",
  em_teste: "fornecedor",
  liberado: "gestao_frota",
  aguardando_ordem_compra: "gestao_frota",
  aguardando_nf: "fornecedor",
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
const MACRO_ETAPAS = ["Registrado", "Atendimento", "Validação", "Autorização", "Execução", "Encerramento"];
const STATUS_PARA_ETAPA = {
  registrado: 0,
  em_triagem: 1, fornecedor_acionado: 1, atendimento_programado: 1, em_avaliacao_tecnica: 1, diagnostico_contestado: 1,
  aguardando_validacao: 2, aguardando_aprovacao: 2,
  aguardando_autorizacao: 3,
  em_teste: 4, liberado: 4,
  aguardando_ordem_compra: 5, aguardando_nf: 5, concluido: 5,
  cancelado: 0
};
const STATUS_ENCERRADO_SEM_SUCESSO = ["cancelado"];

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

// ---------- Toast de confirmação ----------
// Substitui alert() bloqueante por um aviso discreto que some sozinho —
// usado pra confirmar ações como "chamado criado com sucesso".
function mostrarToast(mensagem, tipo) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.className = "toast-container";
    document.body.appendChild(container);
  }
  const toast = document.createElement("div");
  toast.className = `toast toast--${tipo || "sucesso"}`;
  toast.textContent = mensagem;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--show"));
  setTimeout(() => {
    toast.classList.remove("toast--show");
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

// ---------- Filtro de status reutilizável (todas as telas de lista) ----------
// Agrupamento por macro-etapa, igual ao indicador de progresso — mantém
// a mesma linguagem visual em toda a plataforma.
const GRUPOS_FILTRO_STATUS = {
  todos: null,
  ativos: STATUS_ATIVOS,
  registrado: ["registrado"],
  atendimento: ["em_triagem", "fornecedor_acionado", "atendimento_programado", "em_avaliacao_tecnica", "diagnostico_contestado"],
  validacao: ["aguardando_validacao", "aguardando_aprovacao"],
  autorizacao: ["aguardando_autorizacao"],
  execucao: ["em_teste", "liberado"],
  encerramento: ["aguardando_ordem_compra", "aguardando_nf"],
  concluido: ["concluido"],
  cancelado: ["cancelado"]
};
const LABELS_FILTRO_STATUS = {
  todos: "Todos", ativos: "Em andamento", registrado: "Registrado", atendimento: "Atendimento",
  validacao: "Validação", autorizacao: "Autorização", execucao: "Execução",
  encerramento: "Encerramento", concluido: "Concluído", cancelado: "Cancelado"
};
// Monta a barra de filtro (pills) dentro do elemento de id `containerId`.
// `onMudar(chave)` é chamado toda vez que o usuário troca o filtro.
function montarFiltroStatus(containerId, onMudar, chaves) {
  const chavesUsadas = chaves || ["todos", "ativos", "registrado", "atendimento", "validacao", "autorizacao", "execucao", "encerramento", "concluido", "cancelado"];
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = chavesUsadas.map((k, i) => `<button class="pill ${i === 0 ? "active" : ""}" data-filtro="${k}">${LABELS_FILTRO_STATUS[k]}</button>`).join("");
  el.querySelectorAll(".pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".pill").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      onMudar(btn.dataset.filtro);
    });
  });
}
function aplicarFiltroStatus(lista, chaveFiltro) {
  const statusPermitidos = GRUPOS_FILTRO_STATUS[chaveFiltro];
  return statusPermitidos ? lista.filter((c) => statusPermitidos.includes(c.status)) : lista;
}

// ---------- Ícones (SVG, não emoji) ----------
// Traço fino consistente com os ícones do menu lateral. Uso:
// icone("calendario", 16) retorna o <svg> pronto pra inserir no HTML.
const ICONES_SVG = {
  calendario: '<path d="M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  checkCirculo: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.2 2.2L16 9.5"/>',
  clipboard: '<path d="M9 3h6a1 1 0 011 1v1H8V4a1 1 0 011-1z"/><rect x="5" y="5" width="14" height="16" rx="2"/><path d="M9 11h6M9 15h6"/>',
  chave: '<path d="M14.5 6.5a4 4 0 10-5.4 5.4L4 17v3h3l5.1-5.1a4 4 0 002.4-8.4z"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  caminhao: '<rect x="1" y="7" width="13" height="10" rx="1"/><path d="M14 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>',
  usuarios: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5"/><circle cx="17" cy="9" r="2.4"/><path d="M15 13.2c2 .4 3.3 1.9 3.3 4.3"/>',
  escudo: '<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4.5"/>',
  aprovacao: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
  grafico: '<path d="M4 20V10M11 20V4M18 20v-7"/><path d="M2 20h20"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/>',
  clip: '<path d="M8 12l6-6a3 3 0 114 4l-8 8a5 5 0 01-7-7l8-8"/>',
  alerta: '<path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17h.01"/>',
  mais: '<path d="M12 5v14M5 12h14"/>',
  seta: '<path d="M9 5l7 7-7 7"/>',
  predio: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1"/>',
  mapa: '<path d="M9 3v15M15 6v15"/><path d="M4 5l5-2 6 3 5-2v15l-5 2-6-3-5 2z"/>',
  ajustes: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h13M21 18h0"/><circle cx="15" cy="6" r="2.2"/><circle cx="7" cy="12" r="2.2"/><circle cx="17" cy="18" r="2.2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>'
};
function icone(nome, tamanho) {
  const t = tamanho || 18;
  return `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONES_SVG[nome] || ""}</svg>`;
}
