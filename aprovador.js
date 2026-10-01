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

const STATUS_CONTESTACAO = ["contestacao_gestao", "contestacao_fornecedor"];
let contestacoesCache = [];

function escutarChamados() {
  db.collection("chamados").where("status", "in", ["aguardando_aprovacao", ...STATUS_CONTESTACAO]).onSnapshot((snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const antigoPrimeiro = (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0);
    // Destacados pela Gestão de Frota sempre no topo
    filaCache = todos.filter((c) => c.status === "aguardando_aprovacao").sort(comDestaque(antigoPrimeiro));
    contestacoesCache = todos.filter((c) => STATUS_CONTESTACAO.includes(c.status)).sort(comDestaque(antigoPrimeiro));
    renderFila();
    renderContestacoes();
    document.getElementById("stats-grid").innerHTML = `
      <div class="stat-card"><div class="stat-card__value">${filaCache.length}</div><div class="stat-card__label">Aguardando ciência</div></div>
      <div class="stat-card"><div class="stat-card__value">${contestacoesCache.length}</div><div class="stat-card__label">Em contestação</div></div>`;
  });
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  if (filaCache.length === 0) { el.innerHTML = `<div class="empty">${icone("checkCirculo", 34)}<div class="empty__title">Nada pendente</div></div>`; return; }
  el.innerHTML = filaCache.map((c) => `
    <div class="ticket-card ${classeDestaque(c)}">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)} ${seloDestaque(c)}</div>${badgeHtml(c.status)}</div>
      <div class="callout">
        <strong>Parecer da Manutenção Magius:</strong> Mau uso confirmado<br/>
        ${escapeHtml(c.parecerMauUso?.justificativa || "")}
      </div>
      <div class="kv-row"><span class="kv-row__k">Valor apresentado pelo fornecedor</span><span>${formatarMoeda(c.financeiro?.valorApresentado)}</span></div>
      <div class="small-btn-row">
        <a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver chamado completo</a>
        <a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}&acao=contestar">Contestar</a>
        <button class="btn btn--primary btn--sm" onclick="abrirDecisao('${c.id}')">Dar ciência</button>
      </div>
    </div>`).join("");
}

function renderContestacoes() {
  const el = document.getElementById("lista-contestacoes");
  if (!el) return;
  if (contestacoesCache.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__text">Nenhuma contestação em andamento.</div></div>`; return; }
  el.innerHTML = contestacoesCache.map((c) => `
    <a class="ticket-card ${classeDestaque(c)}" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)} ${seloDestaque(c)}</div>${badgeHtml(c.status)}</div>
      <div style="font-size:13px; color:var(--text-dim);">${c.status === "contestacao_fornecedor" ? "A Gestão de Frota encaminhou sua contestação ao fornecedor." : "Sua contestação está sendo avaliada pela Gestão de Frota."}</div>
      <div style="margin-top:4px;">${responsavelAtualHtml(c.status)}</div>
    </a>`).join("");
}

function abrirDecisao(id) {
  document.getElementById("form-decisao").reset();
  document.getElementById("dc-id").value = id;
  abrirFechar("overlay-decisao", true);
}

// Ciência do mau uso já confirmado pela Manutenção Magius. Para pedir
// desconto ou contestar, o aprovador usa o botão "Contestar".
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
