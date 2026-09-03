// ============================================================
// gestao-frota.js
// ============================================================

let usuarioAtual = null;
let chamadosCache = [];
let equipamentosCache = [];
let plantasCache = [];
let setoresCache = [];
let fornecedoresCache = [];
let parametrosRecorrencia = { atencaoQtd: 2, atencaoDias: 90, altaQtd: 3, altaDias: 90 };

(async function init() {
  usuarioAtual = await requireAuth("gestao_frota");
  document.getElementById("user-avatar").textContent = iniciais(usuarioAtual.nome);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";

  parametrosRecorrencia = await obterParametrosRecorrencia();

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  popularSelectsEstaticos();
  await carregarFornecedores();
  escutarPlantasSetores();
  escutarEquipamentos();
  escutarChamados();
  configurarNav();
  configurarOverlays();
})();

function popularSelectsEstaticos() {
  document.getElementById("eq-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, "P2");
  document.getElementById("eq-status").innerHTML = optionsHtml(STATUS_OPERACIONAL_LABELS, "operacional");
  aplicarMascaraMoeda(document.getElementById("eq-contrato"));
  aplicarMascaraFracionado(document.getElementById("eq-horimetro"));
}

async function carregarFornecedores() {
  const snap = await db.collection("usuarios").where("tipo", "==", "fornecedor").get();
  fornecedoresCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("ac-fornecedor").innerHTML =
    fornecedoresCache.length > 0
      ? fornecedoresCache.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}${f.empresa ? " — " + escapeHtml(f.empresa) : ""}</option>`).join("")
      : `<option value="">Nenhum fornecedor cadastrado</option>`;
}

function configurarNav() {
  document.querySelectorAll(".navitem").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["fila", "equipamentos", "chamados", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}

function configurarOverlays() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("btn-novo-equip").addEventListener("click", () => abrirFormEquip(null));
  document.getElementById("form-acionar").addEventListener("submit", salvarAcionamento);
  document.getElementById("form-equip").addEventListener("submit", salvarEquipamento);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

// ---------- Plantas / Setores (leitura — cadastro fica no painel do Administrador) ----------
function escutarPlantasSetores() {
  db.collection("plantas").orderBy("nome").onSnapshot((snap) => {
    plantasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("eq-planta");
    sel.innerHTML = plantasCache.length
      ? plantasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("")
      : `<option value="">Cadastre em Administrador</option>`;
    atualizarSetoresSelect();
  });
  db.collection("setores").orderBy("nome").onSnapshot((snap) => {
    setoresCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarSetoresSelect();
  });
  document.getElementById("eq-planta").addEventListener("change", atualizarSetoresSelect);
}
function atualizarSetoresSelect() {
  const plantaId = document.getElementById("eq-planta").value;
  const doPlanta = setoresCache.filter((s) => s.plantaId === plantaId);
  document.getElementById("eq-setor").innerHTML = doPlanta.length
    ? doPlanta.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join("")
    : `<option value="">Sem setores nesta planta</option>`;
}

// ---------- Chamados ----------
function escutarChamados() {
  db.collection("chamados").onSnapshot((snap) => {
    chamadosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    chamadosCache.sort((a, b) => (tsToMs(b.registradoEm) || 0) - (tsToMs(a.registradoEm) || 0));
    renderFila();
    renderTodosChamados();
    renderStats();
    renderEquipamentos();
  });
}

const STATUS_FILA_GESTAO = ["registrado", "em_triagem", "mau_uso_contestado", "aguardando_autorizacao"];

function renderStats() {
  const fila = chamadosCache.filter((c) => STATUS_FILA_GESTAO.includes(c.status)).length;
  const emAndamento = chamadosCache.filter((c) => STATUS_ATIVOS.includes(c.status)).length;
  const parados = equipamentosCache.filter((e) => ["parado", "indisponivel"].includes(e.statusOperacional)).length;
  const concluidosMes = chamadosCache.filter((c) => {
    const ms = tsToMs(c.concluidoEm);
    if (!ms) return false;
    const d = new Date(ms), a = new Date();
    return d.getMonth() === a.getMonth() && d.getFullYear() === a.getFullYear();
  }).length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${fila}</div><div class="stat-card__label">Pendentes comigo</div></div>
    <div class="stat-card"><div class="stat-card__value">${emAndamento}</div><div class="stat-card__label">Chamados ativos</div></div>
    <div class="stat-card"><div class="stat-card__value">${parados}</div><div class="stat-card__label">Equipamentos parados</div></div>
    <div class="stat-card"><div class="stat-card__value">${concluidosMes}</div><div class="stat-card__label">Concluídos no mês</div></div>
  `;
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  const fila = chamadosCache.filter((c) => STATUS_FILA_GESTAO.includes(c.status));
  if (fila.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty__icon">✅</div><div class="empty__title">Nenhuma pendência</div></div>`;
    return;
  }
  el.innerHTML = fila.map((c) => {
    let acoes = "";
    if (c.status === "registrado") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="iniciarTriagem('${c.id}')">Iniciar triagem</button>`;
    } else if (c.status === "em_triagem") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="abrirAcionar('${c.id}')">Acionar fornecedor</button>`;
    } else if (c.status === "mau_uso_contestado") {
      acoes = `<button class="btn btn--secondary btn--sm" onclick="reabrirAvaliacao('${c.id}')">Reabrir avaliação</button>
               <button class="btn btn--primary btn--sm" onclick="tratarComoContratual('${c.id}')">Aceitar contestação</button>`;
    } else if (c.status === "aguardando_autorizacao") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="autorizarExecucao('${c.id}')">Autorizar execução</button>`;
    }
    return `
    <div class="ticket-card">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>
        ${badgeHtml(c.status)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 80))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")}</span><span class="chip chip--${c.criticidade}">${c.criticidade || ""}</span></div>
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver detalhes</a>${acoes}</div>
    </div>`;
  }).join("");
}

function renderTodosChamados() {
  const el = document.getElementById("lista-todos-chamados");
  if (chamadosCache.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__text">Nenhum chamado ainda.</div></div>`; return; }
  el.innerHTML = chamadosCache.map((c) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div class="ticket-card__meta"><span>${formatarData(c.registradoEm)}</span><span>${escapeHtml(c.categoria || "")}</span></div>
      ${STATUS_ATIVOS.includes(c.status) ? `<div style="margin-top:8px;">${responsavelAtualHtml(c.status)}</div>` : ""}
    </a>`).join("");
}

async function iniciarTriagem(id) {
  try {
    await transicionarChamado(id, "em_triagem", "Triagem iniciada pela Gestão de Frota", usuarioAtual.nome, "gestao_frota");
  } catch (err) {
    alert("Erro ao iniciar triagem: " + err.message);
  }
}
function abrirAcionar(id) {
  document.getElementById("ac-chamado-id").value = id;
  abrirFechar("overlay-acionar", true);
}
async function salvarAcionamento(e) {
  e.preventDefault();
  const id = document.getElementById("ac-chamado-id").value;
  const fornecedorId = document.getElementById("ac-fornecedor").value;
  const fornecedor = fornecedoresCache.find((f) => f.id === fornecedorId);
  if (!fornecedor) { alert("Selecione um fornecedor."); return; }
  try {
    await transicionarChamado(id, "fornecedor_acionado", `Fornecedor ${fornecedor.nome} acionado`, usuarioAtual.nome, "gestao_frota", {
      fornecedorId,
      fornecedorNome: fornecedor.nome
    });
    abrirFechar("overlay-acionar", false);
  } catch (err) {
    alert("Erro ao acionar fornecedor: " + err.message);
  }
}
async function tratarComoContratual(id) {
  try {
    const c = chamadosCache.find((x) => x.id === id);
    await transicionarChamado(id, "aguardando_autorizacao", "Contestação aceita — tratado como manutenção contratual", usuarioAtual.nome, "gestao_frota", {
      fluxo: "contratual",
      "financeiro.custoEvitado": c?.financeiro?.valorApresentado || 0
    });
  } catch (err) {
    alert("Erro ao processar contestação: " + err.message);
  }
}
async function reabrirAvaliacao(id) {
  try {
    await transicionarChamado(id, "aguardando_validacao", "Avaliação reaberta para nova análise da Manutenção Magius", usuarioAtual.nome, "gestao_frota");
  } catch (err) {
    alert("Erro ao reabrir avaliação: " + err.message);
  }
}
async function autorizarExecucao(id) {
  try {
    await transicionarChamado(id, "em_manutencao", "Execução autorizada pela Gestão de Frota", usuarioAtual.nome, "gestao_frota", {
      autorizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    alert("Erro ao autorizar execução: " + err.message);
  }
}

// ---------- Equipamentos ----------
function escutarEquipamentos() {
  db.collection("equipamentos").orderBy("numeroFrota").onSnapshot((snap) => {
    equipamentosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEquipamentos();
  });
}

function renderEquipamentos() {
  const el = document.getElementById("lista-equipamentos");
  if (equipamentosCache.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty__icon">🛠️</div><div class="empty__title">Nenhum equipamento cadastrado</div></div>`;
    return;
  }
  el.innerHTML = equipamentosCache.map((eq) => {
    const doEquip = chamadosCache.filter((c) => c.equipamentoId === eq.id);
    const nivel = classificarRecorrencia(doEquip, parametrosRecorrencia);
    return `
    <div class="machine-plate">
      <div class="machine-plate__head">
        <div>
          <div class="machine-plate__id">${escapeHtml(eq.numeroFrota)} · ${escapeHtml(eq.plantaNome || "—")}/${escapeHtml(eq.setorNome || "—")}</div>
          <div class="machine-plate__model">${escapeHtml(eq.tipoModelo)}</div>
        </div>
        <div class="hourmeter"><div class="hourmeter__value">${(eq.horimetroAtual ?? 0).toLocaleString("pt-BR")}h</div><div class="hourmeter__label">Horímetro</div></div>
      </div>
      <div class="pill-group" style="margin-top:8px;">
        <span class="badge badge--${STATUS_OPERACIONAL_COLORS[eq.statusOperacional]}">${STATUS_OPERACIONAL_LABELS[eq.statusOperacional]}</span>
        ${eq.criticidade ? `<span class="chip chip--${eq.criticidade}">${eq.criticidade}</span>` : ""}
        <span class="badge badge--${RECORRENCIA_COLORS[nivel]}">${RECORRENCIA_LABELS[nivel]}</span>
      </div>
      <div class="machine-plate__footer">
        <span style="font-size:12px; color:var(--text-dim);">${doEquip.length} chamado(s) no total</span>
        <button class="btn btn--secondary btn--sm" onclick="abrirFormEquip('${eq.id}')">Editar</button>
      </div>
    </div>`;
  }).join("");
}

function abrirFormEquip(id) {
  const form = document.getElementById("form-equip");
  form.reset();
  document.getElementById("eq-id").value = id || "";
  document.getElementById("equip-titulo").textContent = id ? "Editar equipamento" : "Novo equipamento";
  if (id) {
    const eq = equipamentosCache.find((e) => e.id === id);
    document.getElementById("eq-numero").value = eq.numeroFrota || "";
    document.getElementById("eq-modelo").value = eq.tipoModelo || "";
    document.getElementById("eq-fabricante").value = eq.fabricante || "";
    document.getElementById("eq-fornecedor-nome").value = eq.fornecedorNome || "";
    document.getElementById("eq-ano").value = eq.ano || "";
    document.getElementById("eq-inicio").value = eq.inicioLocacao || "";
    definirValorMoeda(document.getElementById("eq-contrato"), eq.contratoValor || 0);
    document.getElementById("eq-capacidade").value = eq.capacidade || "";
    document.getElementById("eq-energia").value = eq.energiaCombustivel || "";
    document.getElementById("eq-criticidade").value = eq.criticidade || "P2";
    document.getElementById("eq-backup").value = eq.backupDisponivel ? "sim" : "nao";
    document.getElementById("eq-status").value = eq.statusOperacional || "operacional";
    definirValorFracionado(document.getElementById("eq-horimetro"), eq.horimetroAtual || 0);
    if (eq.plantaId) { document.getElementById("eq-planta").value = eq.plantaId; atualizarSetoresSelect(); }
    if (eq.setorId) setTimeout(() => (document.getElementById("eq-setor").value = eq.setorId), 50);
  }
  abrirFechar("overlay-equip", true);
}

async function salvarEquipamento(e) {
  e.preventDefault();
  const id = document.getElementById("eq-id").value;
  const plantaId = document.getElementById("eq-planta").value;
  const setorId = document.getElementById("eq-setor").value;
  const planta = plantasCache.find((p) => p.id === plantaId);
  const setor = setoresCache.find((s) => s.id === setorId);
  const dados = {
    numeroFrota: document.getElementById("eq-numero").value.trim(),
    tipoModelo: document.getElementById("eq-modelo").value.trim(),
    fabricante: document.getElementById("eq-fabricante").value.trim(),
    fornecedorNome: document.getElementById("eq-fornecedor-nome").value.trim(),
    plantaId, plantaNome: planta ? planta.nome : "",
    setorId, setorNome: setor ? setor.nome : "",
    ano: parseInt(document.getElementById("eq-ano").value) || null,
    inicioLocacao: document.getElementById("eq-inicio").value || null,
    contratoValor: valorMoedaParaNumero(document.getElementById("eq-contrato")) || null,
    capacidade: document.getElementById("eq-capacidade").value.trim(),
    energiaCombustivel: document.getElementById("eq-energia").value.trim(),
    criticidade: document.getElementById("eq-criticidade").value,
    backupDisponivel: document.getElementById("eq-backup").value === "sim",
    statusOperacional: document.getElementById("eq-status").value,
    horimetroAtual: valorFracionadoParaNumero(document.getElementById("eq-horimetro"))
  };
  try {
    if (id) {
      await db.collection("equipamentos").doc(id).update(dados);
    } else {
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("equipamentos").add(dados);
    }
    abrirFechar("overlay-equip", false);
  } catch (err) {
    alert("Erro ao salvar equipamento: " + err.message);
  }
}
