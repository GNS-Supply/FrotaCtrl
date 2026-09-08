// ============================================================
// aprovador.js
// ============================================================

let usuarioAtual = null;
let filaCache = [];

(async function init() {
  usuarioAtual = await requireAuth("aprovador");
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
      ["fila", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}
function configurarOverlay() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("form-decisao").addEventListener("submit", salvarDecisao);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function escutarChamados() {
  db.collection("chamados").where("status", "==", "aguardando_aprovacao").onSnapshot((snap) => {
    filaCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    filaCache.sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0));
    renderFila();
    document.getElementById("stats-grid").innerHTML = `<div class="stat-card" style="grid-column:1/-1;"><div class="stat-card__value">${filaCache.length}</div><div class="stat-card__label">Aguardando sua decisão</div></div>`;
  });
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  if (filaCache.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__icon">✅</div><div class="empty__title">Nada pendente</div></div>`; return; }
  el.innerHTML = filaCache.map((c) => `
    <div class="ticket-card">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div class="callout">
        <strong>Parecer:</strong> ${PARECER_LABELS[c.parecerMauUso?.resultado] || "—"}<br/>
        ${escapeHtml(c.parecerMauUso?.justificativa || "")}
      </div>
      <div class="kv-row"><span class="kv-row__k">Valor apresentado</span><span>${formatarMoeda(c.financeiro?.valorApresentado)}</span></div>
      <div class="kv-row"><span class="kv-row__k">Valor validado</span><span>${formatarMoeda(c.financeiro?.valorValidado)}</span></div>
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver chamado completo</a><button class="btn btn--primary btn--sm" onclick="abrirDecisao('${c.id}')">Decidir</button></div>
    </div>`).join("");
}

function abrirDecisao(id) {
  document.getElementById("form-decisao").reset();
  document.getElementById("dc-id").value = id;
  abrirFechar("overlay-decisao", true);
}

async function salvarDecisao(e) {
  e.preventDefault();
  const id = document.getElementById("dc-id").value;
  const decisao = document.getElementById("dc-decisao").value;
  const comentario = document.getElementById("dc-comentario").value.trim();
  const chamado = filaCache.find((c) => c.id === id);

  const registro = { decisao, comentario, autor: usuarioAtual.nome, timestamp: Date.now() };
  let proximoStatus, obs, extra = { aprovacao: registro };

  if (decisao === "aprovado") {
    proximoStatus = "aguardando_autorizacao";
    obs = comentario || "Valor aprovado";
    extra["financeiro.valorAprovado"] = chamado?.financeiro?.valorValidado || 0;
  } else if (decisao === "reprovado") {
    proximoStatus = "reprovado";
    obs = comentario || "Reprovado pelo aprovador";
  } else {
    proximoStatus = "aguardando_documentacao_mau_uso";
    obs = comentario || "Esclarecimento solicitado pelo aprovador";
  }

  try {
    await transicionarChamado(id, proximoStatus, obs, usuarioAtual.nome, "aprovador", extra);
    e.target.reset();
    abrirFechar("overlay-decisao", false);
  } catch (err) {
    alert("Erro ao registrar decisão: " + err.message);
  }
}
