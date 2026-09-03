// ============================================================
// dashboard.js
// ============================================================

let usuarioAtual = null;
let chamados = [];
let equipamentos = [];

(async function init() {
  usuarioAtual = await requireAuth();
  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  const [chamadosSnap, equipSnap] = await Promise.all([db.collection("chamados").get(), db.collection("equipamentos").get()]);
  chamados = chamadosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  equipamentos = equipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  configurarTabs();
  renderOperacional();
  renderMauUso();
  renderFinanceiro();
  renderRecorrencia();
})();

function voltar() { window.location.href = PERFIL_HOME[usuarioAtual?.tipo] || "index.html"; }

function configurarTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      ["operacional", "mauuso", "financeiro", "recorrencia"].forEach((t) => (document.getElementById(`tab-${t}`).style.display = t === tab ? "block" : "none"));
    });
  });
}

function barras(titulo, dados, corClasse = "") {
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return `
    <div class="section-title"><span>${titulo}</span></div>
    ${dados.length === 0 ? '<div class="empty"><div class="empty__text">Sem dados suficientes.</div></div>' :
      dados.map((d) => `
      <div class="bar-row">
        <div class="bar-row__label"><span>${escapeHtml(d.label)}</span><strong>${d.display ?? d.valor}</strong></div>
        <div class="bar-track"><div class="bar-fill ${corClasse}" style="width:${Math.max((d.valor / max) * 100, 3)}%"></div></div>
      </div>`).join("")}
  `;
}

// ---------- Operacional ----------
function renderOperacional() {
  const abertos = chamados.filter((c) => STATUS_ATIVOS.includes(c.status)).length;
  const parados = equipamentos.filter((e) => ["parado", "indisponivel"].includes(e.statusOperacional)).length;
  const restricao = equipamentos.filter((e) => e.statusOperacional === "operacional_restricao").length;

  const concluidos = chamados.filter((c) => c.status === "concluido");
  const temposParada = concluidos.map((c) => (tsToMs(c.liberadoEm) || 0) - (tsToMs(c.registradoEm) || 0)).filter((v) => v > 0);
  const mediaParada = temposParada.length ? temposParada.reduce((a, b) => a + b, 0) / temposParada.length : null;

  const acionamentos = chamados
    .map((c) => {
      const acionadoMs = tsToMs(c.historico?.find((h) => h.status === "fornecedor_acionado")?.timestamp);
      const registradoMs = tsToMs(c.registradoEm);
      return acionadoMs && registradoMs ? acionadoMs - registradoMs : null;
    })
    .filter((v) => v != null);
  const dentroSla = acionamentos.filter((v) => v <= 24 * 60 * 60 * 1000).length;
  const foraSla = acionamentos.length - dentroSla;

  const porPlanta = {};
  chamados.forEach((c) => { const p = c.plantaNome || "—"; porPlanta[p] = (porPlanta[p] || 0) + 1; });
  const dadosPlanta = Object.entries(porPlanta).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  document.getElementById("tab-operacional").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card__value">${abertos}</div><div class="stat-card__label">Chamados abertos</div></div>
      <div class="stat-card"><div class="stat-card__value">${parados}</div><div class="stat-card__label">Equipamentos parados</div></div>
      <div class="stat-card"><div class="stat-card__value">${restricao}</div><div class="stat-card__label">Com restrição</div></div>
      <div class="stat-card"><div class="stat-card__value">${mediaParada != null ? msParaDuracao(mediaParada) : "—"}</div><div class="stat-card__label">Tempo médio parado</div></div>
      <div class="stat-card"><div class="stat-card__value">${dentroSla}</div><div class="stat-card__label">SLA acionamento ≤24h atendido</div></div>
      <div class="stat-card"><div class="stat-card__value">${foraSla}</div><div class="stat-card__label">SLA acionamento vencido</div></div>
    </div>
    ${barras("Chamados por planta", dadosPlanta)}
  `;
}

// ---------- Mau uso ----------
function renderMauUso() {
  const doMauUso = chamados.filter((c) => c.fluxo === "mau_uso" || c.parecerMauUso);
  const apontados = doMauUso.length;
  const confirmados = doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado").length;
  const contestados = doMauUso.filter((c) => c.parecerMauUso?.resultado === "nao_confirmado").length;
  const inconclusivos = doMauUso.filter((c) => c.parecerMauUso?.resultado === "inconclusivo").length;
  const taxaConfirmacao = apontados ? Math.round((confirmados / apontados) * 100) : 0;

  const porEquip = {};
  doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado").forEach((c) => {
    porEquip[c.numeroFrota] = (porEquip[c.numeroFrota] || 0) + 1;
  });
  const ranking = Object.entries(porEquip).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  document.getElementById("tab-mauuso").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card__value">${apontados}</div><div class="stat-card__label">Apontados</div></div>
      <div class="stat-card"><div class="stat-card__value">${confirmados}</div><div class="stat-card__label">Confirmados</div></div>
      <div class="stat-card"><div class="stat-card__value">${contestados}</div><div class="stat-card__label">Contestados</div></div>
      <div class="stat-card"><div class="stat-card__value">${inconclusivos}</div><div class="stat-card__label">Inconclusivos</div></div>
      <div class="stat-card" style="grid-column: 1 / -1;"><div class="stat-card__value">${taxaConfirmacao}%</div><div class="stat-card__label">Taxa de confirmação</div></div>
    </div>
    ${barras("Equipamentos com mais mau uso confirmado", ranking, "bar-fill--red")}
  `;
}

// ---------- Financeiro ----------
function renderFinanceiro() {
  const soma = (campo) => chamados.reduce((s, c) => s + (c.financeiro?.[campo] || 0), 0);
  const apresentado = soma("valorApresentado");
  const validado = soma("valorValidado");
  const aprovado = soma("valorAprovado");
  const faturado = soma("valorFaturado");
  const evitado = soma("custoEvitado");

  const comprometido = chamados
    .filter((c) => !["concluido", "cancelado"].includes(c.status) && c.financeiro?.valorAprovado)
    .reduce((s, c) => s + c.financeiro.valorAprovado, 0);

  const porPlanta = {};
  chamados.forEach((c) => {
    const v = c.financeiro?.valorFaturado || 0;
    if (v > 0) porPlanta[c.plantaNome || "—"] = (porPlanta[c.plantaNome || "—"] || 0) + v;
  });
  const dadosPlanta = Object.entries(porPlanta).map(([label, valor]) => ({ label, valor, display: formatarMoeda(valor) })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  document.getElementById("tab-financeiro").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(apresentado)}</div><div class="stat-card__label">Apresentado</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(validado)}</div><div class="stat-card__label">Validado</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(aprovado)}</div><div class="stat-card__label">Aprovado</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(faturado)}</div><div class="stat-card__label">Faturado</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(evitado)}</div><div class="stat-card__label">Custo evitado</div></div>
      <div class="stat-card"><div class="stat-card__value">${formatarMoeda(comprometido)}</div><div class="stat-card__label">Projeção (comprometido)</div></div>
    </div>
    ${barras("Faturado por planta", dadosPlanta, "bar-fill--blue")}
  `;
}

// ---------- Recorrência ----------
async function renderRecorrencia() {
  const params = await obterParametrosRecorrencia();
  const porEquip = {};
  chamados.forEach((c) => {
    if (!c.equipamentoId) return;
    (porEquip[c.equipamentoId] = porEquip[c.equipamentoId] || []).push(c);
  });

  const ranking = Object.entries(porEquip)
    .map(([equipId, lista]) => ({ label: lista[0].numeroFrota, valor: lista.length, nivel: classificarRecorrencia(lista, params) }))
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 8);

  const porCategoria = {};
  chamados.forEach((c) => { const cat = c.categoria || "Outro"; porCategoria[cat] = (porCategoria[cat] || 0) + 1; });
  const dadosCategoria = Object.entries(porCategoria).map(([label, valor]) => ({ label, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8);

  const max = Math.max(...ranking.map((d) => d.valor), 1);
  document.getElementById("tab-recorrencia").innerHTML = `
    <div class="section-title"><span>Ranking de equipamentos por ocorrência</span></div>
    ${ranking.length === 0 ? '<div class="empty"><div class="empty__text">Sem dados suficientes.</div></div>' :
      ranking.map((d) => `
      <div class="bar-row">
        <div class="bar-row__label"><span>${escapeHtml(d.label)} <span class="badge badge--${RECORRENCIA_COLORS[d.nivel]}" style="margin-left:6px;">${RECORRENCIA_LABELS[d.nivel]}</span></span><strong>${d.valor}</strong></div>
        <div class="bar-track"><div class="bar-fill" style="width:${Math.max((d.valor / max) * 100, 3)}%"></div></div>
      </div>`).join("")}
    ${barras("Pareto por categoria de avaria", dadosCategoria, "bar-fill--green")}
  `;
}
