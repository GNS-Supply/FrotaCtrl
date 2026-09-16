// ============================================================
// manutencao.js — validação de mau uso (sem acesso a valores)
// ============================================================

let usuarioAtual = null;
let filaCache = [];
let pareceresCache = [];

(async function init() {
  usuarioAtual = await requireAuth("manutencao");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  escutarChamados();
  configurarNav();
  configurarOverlay();
  adicionarAtalhoMaster(usuarioAtual);
})();

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["fila", "pareceres", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}
function configurarOverlay() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("form-parecer").addEventListener("submit", salvarParecer);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function escutarChamados() {
  db.collection("chamados").where("fluxo", "==", "mau_uso").onSnapshot((snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    filaCache = todos.filter((c) => c.status === "aguardando_validacao");
    pareceresCache = todos.filter((c) => c.parecerMauUso);
    filaCache.sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0));
    pareceresCache.sort((a, b) => (a.parecerMauUso?.timestamp || 0) < (b.parecerMauUso?.timestamp || 0) ? 1 : -1);
    renderFila();
    renderPareceres();
    renderStats();
  });
}

function renderStats() {
  const confirmados = pareceresCache.filter((c) => c.parecerMauUso?.resultado === "confirmado").length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${filaCache.length}</div><div class="stat-card__label">Aguardando validação</div></div>
    <div class="stat-card"><div class="stat-card__value">${confirmados}</div><div class="stat-card__label">Confirmados no total</div></div>
  `;
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  if (filaCache.length === 0) { el.innerHTML = `<div class="empty">${icone("checkCirculo", 34)}<div class="empty__title">Nada para validar</div></div>`; return; }
  // Nota: nenhum valor financeiro é exibido aqui de propósito — a
  // Manutenção Magius avalia só a evidência técnica, não o custo.
  el.innerHTML = filaCache.map((c) => `
    <div class="ticket-card">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div style="font-size:13px; color:var(--text-dim);"><strong>Diagnóstico do fornecedor:</strong> ${escapeHtml(c.diagnostico?.texto || "—")}</div>
      ${(c.fotosDiagnostico || []).length ? `<div class="photo-grid">${c.fotosDiagnostico.map((u) => `<a href="${u}" target="_blank"><img src="${u}" /></a>`).join("")}</div>` : ""}
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver chamado completo</a><button class="btn btn--primary btn--sm" onclick="abrirParecer('${c.id}')">Emitir parecer</button></div>
    </div>`).join("");
}

function renderPareceres() {
  const el = document.getElementById("lista-pareceres");
  if (pareceresCache.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__text">Nenhum parecer emitido ainda.</div></div>`; return; }
  el.innerHTML = pareceresCache.map((c) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.parecerMauUso.resultado, PARECER_LABELS, { confirmado: "red", nao_confirmado: "green", inconclusivo: "muted" })}</div>
      <div class="ticket-card__meta"><span>${formatarData(c.parecerMauUso.timestamp)}</span></div>
    </a>`).join("");
}

function abrirParecer(id) {
  document.getElementById("form-parecer").reset();
  document.getElementById("pc-id").value = id;
  abrirFechar("overlay-parecer", true);
}

// Regra do fluxo: "confirmado" segue pro aprovador (só ciência). "Não
// confirmado" ou "inconclusivo" voltam pro FORNECEDOR dar um novo
// diagnóstico — não existe mais uma etapa onde a Gestão de Frota decide
// a contestação; o vaivém é só entre fornecedor e manutenção, até
// chegarem a um acordo.
async function salvarParecer(e) {
  e.preventDefault();
  const id = document.getElementById("pc-id").value;
  const resultado = document.getElementById("pc-resultado").value;
  const modalidade = document.getElementById("pc-modalidade").value;
  const justificativa = document.getElementById("pc-justificativa").value.trim();

  const parecer = { resultado, modalidade, justificativa, autor: usuarioAtual.nome, timestamp: Date.now() };
  let proximoStatus, obs;
  if (resultado === "confirmado") {
    proximoStatus = "aguardando_aprovacao";
    obs = "Mau uso confirmado — encaminhado para ciência do aprovador";
  } else if (resultado === "nao_confirmado") {
    proximoStatus = "diagnostico_contestado";
    obs = "Mau uso não confirmado — devolvido ao fornecedor para novo diagnóstico";
  } else {
    proximoStatus = "diagnostico_contestado";
    obs = "Parecer inconclusivo — devolvido ao fornecedor para novo diagnóstico";
  }

  try {
    await transicionarChamado(id, proximoStatus, obs, usuarioAtual.nome, "manutencao", { parecerMauUso: parecer }, { tipo: "parecer", resultado, modalidade, justificativa });
    e.target.reset();
    abrirFechar("overlay-parecer", false);
    mostrarToast("Parecer registrado.");
  } catch (err) {
    alert("Erro ao emitir parecer: " + err.message);
  }
}
