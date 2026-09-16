// ============================================================
// aprovador.js — só dá ciência do mau uso confirmado, sem poder recusar
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
    document.getElementById("stats-grid").innerHTML = `<div class="stat-card" style="grid-column:1/-1;"><div class="stat-card__value">${filaCache.length}</div><div class="stat-card__label">Aguardando ciência</div></div>`;
  });
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  if (filaCache.length === 0) { el.innerHTML = `<div class="empty">${icone("checkCirculo", 34)}<div class="empty__title">Nada pendente</div></div>`; return; }
  el.innerHTML = filaCache.map((c) => `
    <div class="ticket-card">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div class="callout">
        <strong>Parecer da Manutenção Magius:</strong> Mau uso confirmado<br/>
        ${escapeHtml(c.parecerMauUso?.justificativa || "")}
      </div>
      <div class="kv-row"><span class="kv-row__k">Valor apresentado pelo fornecedor</span><span>${formatarMoeda(c.financeiro?.valorApresentado)}</span></div>
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver chamado completo</a><button class="btn btn--primary btn--sm" onclick="abrirDecisao('${c.id}')">Dar ciência</button></div>
    </div>`).join("");
}

function abrirDecisao(id) {
  document.getElementById("form-decisao").reset();
  document.getElementById("dc-id").value = id;
  abrirFechar("overlay-decisao", true);
}

// O aprovador só registra ciência do mau uso já confirmado pela
// Manutenção Magius — não existe opção de recusar aqui (isso já foi
// decidido na validação técnica).
async function salvarDecisao(e) {
  e.preventDefault();
  const id = document.getElementById("dc-id").value;
  const comentario = document.getElementById("dc-comentario").value.trim();
  const chamado = filaCache.find((c) => c.id === id);
  const registro = { decisao: "ciente", comentario, autor: usuarioAtual.nome, timestamp: Date.now() };
  try {
    await transicionarChamado(id, "aguardando_autorizacao", comentario || "Ciência registrada pelo aprovador", usuarioAtual.nome, "aprovador", {
      aprovacao: registro,
      "financeiro.valorAprovado": chamado?.financeiro?.valorApresentado || 0
    }, { tipo: "ciencia", comentario });
    e.target.reset();
    abrirFechar("overlay-decisao", false);
    mostrarToast("Ciência registrada.");
  } catch (err) {
    alert("Erro ao registrar ciência: " + err.message);
  }
}
