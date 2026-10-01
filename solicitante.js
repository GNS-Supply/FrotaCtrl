// ============================================================
// solicitante.js
// ============================================================

let usuarioAtual = null;
let chamadosCache = [];

(async function init() {
  usuarioAtual = await requireAuth("solicitante");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-empresa").textContent = usuarioAtual.empresa || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  escutarChamados();
  configurarNav();
  document.getElementById("btn-fab-chamado").addEventListener("click", () => abrirNovoChamado(usuarioAtual));
  adicionarAtalhoMaster(usuarioAtual);
  montarFiltroStatus("filtro-status-solicitante", (chave) => { filtroAtualSolicitante = chave; renderChamados(); });
})();

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["meus", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
      document.getElementById("fab-wrap").style.display = view === "perfil" ? "none" : "block";
    });
  });
}

function escutarChamados() {
  db.collection("chamados").where("solicitanteId", "==", usuarioAtual.uid).onSnapshot((snap) => {
    chamadosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    chamadosCache.sort(comDestaque((a, b) => (tsToMs(b.registradoEm) || 0) - (tsToMs(a.registradoEm) || 0)));
    renderChamados();
    renderStats();
  });
}

let filtroAtualSolicitante = "todos";

function renderStats() {
  const abertos = chamadosCache.filter((c) => STATUS_ATIVOS.includes(c.status)).length;
  const concluidos = chamadosCache.filter((c) => c.status === "concluido").length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${abertos}</div><div class="stat-card__label">Em aberto</div></div>
    <div class="stat-card"><div class="stat-card__value">${concluidos}</div><div class="stat-card__label">Concluídos</div></div>
  `;
}

function renderChamados() {
  const el = document.getElementById("lista-chamados");
  const lista = aplicarFiltroStatus(chamadosCache, filtroAtualSolicitante);
  if (lista.length === 0) {
    el.innerHTML = chamadosCache.length === 0
      ? `<div class="empty">${icone("clipboard", 34)}<div class="empty__title">Nenhum chamado ainda</div><div class="empty__text">Toque no + para abrir seu primeiro chamado.</div></div>`
      : `<div class="empty"><div class="empty__text">Nenhum chamado nesse filtro.</div></div>`;
    return;
  }
  el.innerHTML = lista
    .map(
      (c) => `
    <a class="ticket-card ${classeDestaque(c)}" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero || "")} — ${escapeHtml(c.numeroFrota || "")} ${seloDestaque(c)}</div>
        ${badgeHtml(c.status)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 70))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.categoria || "")}</span><span>Aberto em ${formatarData(c.registradoEm)}</span></div>
      ${stepperHtml(c.status)}
      ${STATUS_ATIVOS.includes(c.status) ? `<div style="margin-top:4px;">${responsavelAtualHtml(c.status)}</div>` : ""}
    </a>`
    )
    .join("");
}
