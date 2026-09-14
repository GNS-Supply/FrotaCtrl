// ============================================================
// dashboard.js — indicadores em página única, 4 blocos, com
// gráficos reais (Chart.js via CDN — continua sendo estático,
// sem build, hospedado junto com o resto no GitHub Pages).
// ============================================================

let usuarioAtual = null;
let chamados = [];
let equipamentos = [];

// Paleta usada nos gráficos (espelha as variáveis do style.css —
// Chart.js precisa de valores literais, não consegue ler var(--x))
const COR = {
  accent: "#E8A33D", accentTint: "#FDF1DE",
  blue: "#2C6E8E", blueTint: "#EAF2FB",
  green: "#2F9E64", greenTint: "#E4F5EC",
  red: "#D64545", redTint: "#FBE9E9",
  muted: "#7A8790", mutedTint: "#F0F1F2",
  texto: "#5B6670", grade: "#E4E8EA"
};

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size = 11.5;
Chart.defaults.color = COR.texto;
Chart.defaults.borderColor = COR.grade;
Chart.defaults.plugins.legend.labels.boxWidth = 12;
Chart.defaults.plugins.legend.labels.padding = 12;

(async function init() {
  usuarioAtual = await requireAuth();
  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  const [chamadosSnap, equipSnap] = await Promise.all([db.collection("chamados").get(), db.collection("equipamentos").get()]);
  chamados = chamadosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  equipamentos = equipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderOperacional();
  renderMauUso();
  renderFinanceiro();
  renderRecorrencia();
})();

function voltar() { window.location.href = PERFIL_HOME[usuarioAtual?.tipo] || "index.html"; }

// ---------- Utilitários ----------
function kpiGrid(itens) {
  return itens.map((k) => `<div class="stat-card"><div class="stat-card__value">${k.valor}</div><div class="stat-card__label">${k.label}</div></div>`).join("");
}

// Agrupa uma lista de chamados nos últimos N meses (rótulo "jan/26" etc.)
function ultimosMeses(n) {
  const meses = [];
  const hoje = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) });
  }
  return meses;
}
function chaveMes(ms) {
  if (!ms) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}`;
}
function contarPorMes(lista, campoData, meses) {
  const mapa = {};
  lista.forEach((c) => {
    const ms = tsToMs(c[campoData]);
    const k = chaveMes(ms);
    if (k) mapa[k] = (mapa[k] || 0) + 1;
  });
  return meses.map((m) => mapa[m.chave] || 0);
}
function graficoVazio(canvasId, mensagem) {
  const el = document.getElementById(canvasId);
  const wrap = el.parentElement;
  wrap.innerHTML = `<div class="empty" style="padding:30px 10px;"><div class="empty__text">${mensagem}</div></div>`;
}

// ============================================================
// BLOCO 1 — OPERACIONAL
// ============================================================
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

  document.getElementById("kpi-operacional").innerHTML = kpiGrid([
    { valor: abertos, label: "Chamados abertos" },
    { valor: parados, label: "Equipamentos parados" },
    { valor: restricao, label: "Com restrição" },
    { valor: mediaParada != null ? msParaDuracao(mediaParada) : "—", label: "Tempo médio parado" },
    { valor: `${dentroSla}/${acionamentos.length || 0}`, label: "SLA acionamento ≤24h" },
    { valor: equipamentos.length, label: "Equipamentos na frota" }
  ]);

  // Tendência: registrados x concluídos por mês
  const meses = ultimosMeses(6);
  const registradosPorMes = contarPorMes(chamados, "registradoEm", meses);
  const concluidosPorMes = contarPorMes(chamados, "concluidoEm", meses);
  new Chart(document.getElementById("chart-op-tendencia"), {
    type: "line",
    data: {
      labels: meses.map((m) => m.label),
      datasets: [
        { label: "Registrados", data: registradosPorMes, borderColor: COR.accent, backgroundColor: COR.accentTint, tension: 0.3, fill: true },
        { label: "Concluídos", data: concluidosPorMes, borderColor: COR.green, backgroundColor: COR.greenTint, tension: 0.3, fill: true }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // Distribuição por macro-etapa
  const porEtapa = MACRO_ETAPAS.map((_, i) => chamados.filter((c) => (STATUS_PARA_ETAPA[c.status] ?? 0) === i && c.status !== "concluido").length);
  porEtapa[5] = chamados.filter((c) => c.status === "concluido").length;
  new Chart(document.getElementById("chart-op-etapa"), {
    type: "doughnut",
    data: { labels: MACRO_ETAPAS, datasets: [{ data: porEtapa, backgroundColor: [COR.muted, COR.accent, "#c98a2e", COR.blue, "#5a8fa8", COR.green] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  // Por planta
  const porPlanta = {};
  chamados.forEach((c) => { const p = c.plantaNome || "—"; porPlanta[p] = (porPlanta[p] || 0) + 1; });
  const entradasPlanta = Object.entries(porPlanta).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entradasPlanta.length === 0) { graficoVazio("chart-op-planta", "Sem chamados registrados ainda."); }
  else {
    new Chart(document.getElementById("chart-op-planta"), {
      type: "bar",
      data: { labels: entradasPlanta.map((e) => e[0]), datasets: [{ label: "Chamados", data: entradasPlanta.map((e) => e[1]), backgroundColor: COR.accent, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }
}

// ============================================================
// BLOCO 2 — MAU USO
// ============================================================
function renderMauUso() {
  const doMauUso = chamados.filter((c) => c.fluxo === "mau_uso" || c.parecerMauUso);
  const apontados = doMauUso.length;
  const confirmados = doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado").length;
  const contestados = doMauUso.filter((c) => c.parecerMauUso?.resultado === "nao_confirmado").length;
  const inconclusivos = doMauUso.filter((c) => c.parecerMauUso?.resultado === "inconclusivo").length;
  const taxaConfirmacao = apontados ? Math.round((confirmados / apontados) * 100) : 0;

  document.getElementById("kpi-mauuso").innerHTML = kpiGrid([
    { valor: apontados, label: "Apontados" },
    { valor: confirmados, label: "Confirmados" },
    { valor: contestados, label: "Contestados" },
    { valor: inconclusivos, label: "Inconclusivos" },
    { valor: `${taxaConfirmacao}%`, label: "Taxa de confirmação" }
  ]);

  if (apontados === 0) {
    graficoVazio("chart-mu-resultado", "Nenhum caso de mau uso apontado ainda.");
    graficoVazio("chart-mu-ranking", "Sem dados suficientes.");
  } else {
    const semParecer = doMauUso.filter((c) => !c.parecerMauUso).length;
    new Chart(document.getElementById("chart-mu-resultado"), {
      type: "doughnut",
      data: {
        labels: ["Confirmado", "Não confirmado", "Inconclusivo", "Aguardando parecer"],
        datasets: [{ data: [confirmados, contestados, inconclusivos, semParecer], backgroundColor: [COR.red, COR.green, COR.muted, COR.accent] }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
    });

    const porEquip = {};
    doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado").forEach((c) => { porEquip[c.numeroFrota] = (porEquip[c.numeroFrota] || 0) + 1; });
    const ranking = Object.entries(porEquip).sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (ranking.length === 0) graficoVazio("chart-mu-ranking", "Nenhum mau uso confirmado ainda.");
    else new Chart(document.getElementById("chart-mu-ranking"), {
      type: "bar",
      data: { labels: ranking.map((e) => e[0]), datasets: [{ label: "Mau uso confirmado", data: ranking.map((e) => e[1]), backgroundColor: COR.red, borderRadius: 4 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  const meses = ultimosMeses(6);
  const apontadosPorMes = contarPorMes(doMauUso, "registradoEm", meses);
  const confirmadosPorMes = meses.map((m) => doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado" && chaveMes(c.parecerMauUso.timestamp) === m.chave).length);
  new Chart(document.getElementById("chart-mu-evolucao"), {
    type: "bar",
    data: {
      labels: meses.map((m) => m.label),
      datasets: [
        { label: "Apontados", data: apontadosPorMes, backgroundColor: COR.accentTint, borderColor: COR.accent, borderWidth: 1.5, borderRadius: 4 },
        { label: "Confirmados", data: confirmadosPorMes, backgroundColor: COR.red, borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

// ============================================================
// BLOCO 3 — FINANCEIRO
// ============================================================
function renderFinanceiro() {
  const soma = (campo) => chamados.reduce((s, c) => s + (c.financeiro?.[campo] || 0), 0);
  const apresentado = soma("valorApresentado");
  const aprovado = soma("valorAprovado");
  const final = soma("valorFinal");
  const evitado = soma("custoEvitado");
  const comprometido = chamados.filter((c) => !["concluido", "cancelado"].includes(c.status) && c.financeiro?.valorAprovado).reduce((s, c) => s + c.financeiro.valorAprovado, 0);

  document.getElementById("kpi-financeiro").innerHTML = kpiGrid([
    { valor: formatarMoeda(apresentado), label: "Apresentado" },
    { valor: formatarMoeda(aprovado), label: "Aprovado (ciência)" },
    { valor: formatarMoeda(final), label: "Valor final" },
    { valor: formatarMoeda(evitado), label: "Custo evitado" },
    { valor: formatarMoeda(comprometido), label: "Projeção (comprometido)" }
  ]);

  new Chart(document.getElementById("chart-fin-funil"), {
    type: "bar",
    data: {
      labels: ["Apresentado", "Aprovado", "Valor final"],
      datasets: [{ data: [apresentado, aprovado, final], backgroundColor: [COR.mutedTint, COR.accentTint, COR.green], borderColor: [COR.muted, COR.accent, COR.green], borderWidth: 1.5, borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  });

  const meses = ultimosMeses(6);
  const faturadoPorMesReal = meses.map((m) => chamados.filter((c) => chaveMes(tsToMs(c.financeiro?.dataFaturamento)) === m.chave).reduce((s, c) => s + (c.financeiro?.valorFinal || 0), 0));
  new Chart(document.getElementById("chart-fin-mensal"), {
    type: "line",
    data: { labels: meses.map((m) => m.label), datasets: [{ label: "Faturado", data: faturadoPorMesReal, borderColor: COR.blue, backgroundColor: COR.blueTint, fill: true, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  });

  const porPlanta = {};
  chamados.forEach((c) => { const v = c.financeiro?.valorFinal || 0; if (v > 0) porPlanta[c.plantaNome || "—"] = (porPlanta[c.plantaNome || "—"] || 0) + v; });
  const entradas = Object.entries(porPlanta).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entradas.length === 0) graficoVazio("chart-fin-planta", "Nenhum faturamento registrado ainda.");
  else new Chart(document.getElementById("chart-fin-planta"), {
    type: "bar",
    data: { labels: entradas.map((e) => e[0]), datasets: [{ label: "Faturado", data: entradas.map((e) => e[1]), backgroundColor: COR.blue, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  });
}

// ============================================================
// BLOCO 4 — RECORRÊNCIA
// ============================================================
async function renderRecorrencia() {
  const params = await obterParametrosRecorrencia();
  const porEquip = {};
  chamados.forEach((c) => { if (c.equipamentoId) (porEquip[c.equipamentoId] = porEquip[c.equipamentoId] || []).push(c); });

  const niveis = { normal: 0, atencao: 0, alta: 0 };
  Object.values(porEquip).forEach((lista) => { niveis[classificarRecorrencia(lista, params)]++; });
  const semChamado = equipamentos.length - Object.keys(porEquip).length;

  const ranking = Object.entries(porEquip).map(([, lista]) => ({ label: lista[0].numeroFrota, valor: lista.length, nivel: classificarRecorrencia(lista, params) })).sort((a, b) => b.valor - a.valor).slice(0, 8);
  const maisRecorrente = ranking[0];

  document.getElementById("kpi-recorrencia").innerHTML = kpiGrid([
    { valor: niveis.alta, label: "Equipamentos em alta recorrência" },
    { valor: niveis.atencao, label: "Em atenção" },
    { valor: niveis.normal + semChamado, label: "Normais" },
    { valor: maisRecorrente ? maisRecorrente.label : "—", label: "Equipamento mais recorrente" }
  ]);

  new Chart(document.getElementById("chart-rec-nivel"), {
    type: "doughnut",
    data: { labels: ["Normal", "Atenção", "Alta recorrência"], datasets: [{ data: [niveis.normal + semChamado, niveis.atencao, niveis.alta], backgroundColor: [COR.muted, COR.accent, COR.red] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  if (ranking.length === 0) graficoVazio("chart-rec-ranking", "Sem dados suficientes.");
  else new Chart(document.getElementById("chart-rec-ranking"), {
    type: "bar",
    data: {
      labels: ranking.map((r) => r.label),
      datasets: [{ label: "Chamados", data: ranking.map((r) => r.valor), backgroundColor: ranking.map((r) => (r.nivel === "alta" ? COR.red : r.nivel === "atencao" ? COR.accent : COR.muted)), borderRadius: 4 }]
    },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  const porCategoria = {};
  chamados.forEach((c) => { const cat = c.categoria || "Outro"; porCategoria[cat] = (porCategoria[cat] || 0) + 1; });
  const entradasCat = Object.entries(porCategoria).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entradasCat.length === 0) graficoVazio("chart-rec-categoria", "Sem chamados registrados ainda.");
  else new Chart(document.getElementById("chart-rec-categoria"), {
    type: "bar",
    data: { labels: entradasCat.map((e) => e[0]), datasets: [{ label: "Chamados", data: entradasCat.map((e) => e[1]), backgroundColor: COR.green, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}
