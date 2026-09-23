// ============================================================
// dashboard.js — indicadores em página única, 4 blocos, com
// gráficos reais (Chart.js via CDN — continua sendo estático,
// sem build, hospedado junto com o resto no GitHub Pages).
//
// Cada bloco (Operacional, Mau uso, Financeiro, Recorrência) tem seu
// próprio filtro independente de Planta / Setor / Período — os
// prefixos "operacional", "mauuso", "financeiro" e "recorrencia" são
// usados para achar os campos de cada filtro (filtro-planta-<prefixo>
// etc.) e para saber quais gráficos redesenhar quando ele muda.
// ============================================================

let usuarioAtual = null;

// Dados completos, como vieram do Firestore (nunca filtrados).
let chamadosOriginal = [];
let equipamentosOriginal = [];

const BLOCOS = ["operacional", "mauuso", "financeiro", "recorrencia", "setores"];

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
if (typeof ChartDataLabels !== "undefined") Chart.register(ChartDataLabels);

// ---------- Caixinha "Mostrar valores nos gráficos" (global) ----------
// Por padrão os valores só aparecem no hover (tooltip padrão do Chart.js).
// Quando a caixinha é marcada, todos os gráficos passam a exibir os
// valores fixos sobre as barras/fatias, sem precisar passar o mouse.
let mostrarValores = false;

// Instâncias de gráfico, agrupadas por bloco — permite destruir e
// redesenhar só os gráficos do bloco cujo filtro mudou.
const graficosPorBloco = { operacional: [], mauuso: [], financeiro: [], recorrencia: [], setores: [] };

function blocoDoCanvas(id) {
  if (id.startsWith("chart-op-")) return "operacional";
  if (id.startsWith("chart-mu-")) return "mauuso";
  if (id.startsWith("chart-fin-")) return "financeiro";
  if (id.startsWith("chart-rec-")) return "recorrencia";
  if (id.startsWith("chart-setores-")) return "setores";
  return "operacional";
}

function criarGrafico(canvasEl, config, opcoes = {}) {
  // Se esse canvas estava marcado como "vazio" (mensagem de "sem dados"),
  // volta a exibi-lo — importante ao reaplicar filtros, já que agora
  // pode haver dados onde antes não havia.
  const wrap = canvasEl.parentElement;
  const vazio = wrap.querySelector(".empty");
  if (vazio) vazio.style.display = "none";
  canvasEl.style.display = "";

  const moeda = !!opcoes.moeda;
  const ehDoughnut = config.type === "doughnut";
  config.options = config.options || {};
  config.options.plugins = config.options.plugins || {};
  config.options.plugins.datalabels = {
    display: mostrarValores,
    color: ehDoughnut ? "#fff" : COR.texto,
    anchor: ehDoughnut ? "center" : "end",
    align: ehDoughnut ? "center" : "end",
    offset: 4,
    font: { size: 10.5, weight: "600" },
    formatter: (valor) => {
      if (valor === 0 || valor == null) return "";
      return moeda ? formatarMoeda(valor) : valor;
    }
  };
  const grafico = new Chart(canvasEl, config);
  graficosPorBloco[blocoDoCanvas(canvasEl.id)].push(grafico);
  return grafico;
}

function alternarMostrarValores(marcado) {
  mostrarValores = marcado;
  BLOCOS.forEach((bloco) => {
    graficosPorBloco[bloco].forEach((g) => {
      if (g.options?.plugins?.datalabels) {
        g.options.plugins.datalabels.display = mostrarValores;
        g.update();
      }
    });
  });
}

(async function init() {
  usuarioAtual = await requireAuth();
  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  const [chamadosSnap, equipSnap] = await Promise.all([db.collection("chamados").get(), db.collection("equipamentos").get()]);
  chamadosOriginal = chamadosSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  equipamentosOriginal = equipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  popularFiltros();
  renderOperacional();
  renderMauUso();
  renderFinanceiro();
  renderRecorrencia();
  renderComparativoSetores();
})();

function voltar() { window.location.href = PERFIL_HOME[usuarioAtual?.tipo] || "index.html"; }

const RENDER_POR_BLOCO = {
  operacional: () => renderOperacional(),
  mauuso: () => renderMauUso(),
  financeiro: () => renderFinanceiro(),
  recorrencia: () => renderRecorrencia(),
  setores: () => renderComparativoSetores()
};

// ============================================================
// FILTROS — Planta, Setor e Período, independentes por bloco
// ============================================================
function popularFiltros() {
  const plantas = new Set();
  equipamentosOriginal.forEach((e) => e.plantaNome && plantas.add(e.plantaNome));
  chamadosOriginal.forEach((c) => c.plantaNome && plantas.add(c.plantaNome));
  const opcoesPlanta = `<option value="">Todas as plantas</option>` +
    [...plantas].sort().map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");

  BLOCOS.forEach((bloco) => {
    const sel = document.getElementById(`filtro-planta-${bloco}`);
    if (sel) sel.innerHTML = opcoesPlanta;
    atualizarSetoresFiltroBloco(bloco);
  });
}

function atualizarSetoresFiltroBloco(bloco) {
  const selPlanta = document.getElementById(`filtro-planta-${bloco}`);
  const selSetor = document.getElementById(`filtro-setor-${bloco}`);
  if (!selPlanta || !selSetor) return;
  const plantaSel = selPlanta.value;
  const atual = selSetor.value;
  const setores = new Set();
  equipamentosOriginal.forEach((e) => { if (!plantaSel || e.plantaNome === plantaSel) e.setorNome && setores.add(e.setorNome); });
  chamadosOriginal.forEach((c) => { if (!plantaSel || c.plantaNome === plantaSel) c.setorNome && setores.add(c.setorNome); });
  const ordenados = [...setores].sort();
  selSetor.innerHTML = `<option value="">Todos os setores</option>` +
    ordenados.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if (ordenados.includes(atual)) selSetor.value = atual;
}

function limparFiltroBloco(bloco) {
  document.getElementById(`filtro-planta-${bloco}`).value = "";
  atualizarSetoresFiltroBloco(bloco);
  const selSetor = document.getElementById(`filtro-setor-${bloco}`);
  if (selSetor) selSetor.value = "";
  document.getElementById(`filtro-data-inicio-${bloco}`).value = "";
  document.getElementById(`filtro-data-fim-${bloco}`).value = "";
  aplicarFiltroBloco(bloco);
}

function valoresFiltroBloco(bloco) {
  return {
    planta: document.getElementById(`filtro-planta-${bloco}`)?.value || "",
    setor: document.getElementById(`filtro-setor-${bloco}`)?.value || "",
    dataInicio: document.getElementById(`filtro-data-inicio-${bloco}`)?.value || "",
    dataFim: document.getElementById(`filtro-data-fim-${bloco}`)?.value || ""
  };
}

function chamadosFiltrados(bloco) {
  const { planta, setor, dataInicio, dataFim } = valoresFiltroBloco(bloco);
  const inicioMs = dataInicio ? new Date(dataInicio + "T00:00:00").getTime() : null;
  const fimMs = dataFim ? new Date(dataFim + "T23:59:59").getTime() : null;
  return chamadosOriginal.filter((c) => {
    if (planta && c.plantaNome !== planta) return false;
    if (setor && c.setorNome !== setor) return false;
    if (inicioMs || fimMs) {
      const ms = tsToMs(c.registradoEm);
      if (!ms) return false;
      if (inicioMs && ms < inicioMs) return false;
      if (fimMs && ms > fimMs) return false;
    }
    return true;
  });
}

function equipamentosFiltrados(bloco) {
  const { planta, setor } = valoresFiltroBloco(bloco);
  return equipamentosOriginal.filter((e) => {
    if (planta && e.plantaNome !== planta) return false;
    if (setor && e.setorNome !== setor) return false;
    return true;
  });
}

function aplicarFiltroBloco(bloco) {
  graficosPorBloco[bloco].forEach((g) => g.destroy());
  graficosPorBloco[bloco] = [];
  RENDER_POR_BLOCO[bloco]();
}

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

// Quando há um período (De/Até) selecionado no filtro do bloco, os
// gráficos "por mês" passam a cobrir exatamente os meses daquele
// período, em vez dos últimos 6 meses fixos.
function mesesParaGraficos(bloco) {
  const { dataInicio, dataFim } = valoresFiltroBloco(bloco);
  if (dataInicio && dataFim) {
    const ini = new Date(dataInicio + "T00:00:00");
    const fim = new Date(dataFim + "T00:00:00");
    if (ini <= fim) {
      const meses = [];
      let d = new Date(ini.getFullYear(), ini.getMonth(), 1);
      const fimMes = new Date(fim.getFullYear(), fim.getMonth(), 1);
      let guarda = 0;
      while (d <= fimMes && guarda < 36) {
        meses.push({ chave: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }) });
        d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        guarda++;
      }
      if (meses.length) return meses;
    }
  }
  return ultimosMeses(6);
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
  const canvas = document.getElementById(canvasId);
  const wrap = canvas.parentElement;
  canvas.style.display = "none";
  let vazio = wrap.querySelector(".empty");
  if (!vazio) {
    vazio = document.createElement("div");
    vazio.className = "empty";
    vazio.style.padding = "30px 10px";
    vazio.innerHTML = `<div class="empty__text"></div>`;
    wrap.appendChild(vazio);
  }
  vazio.querySelector(".empty__text").textContent = mensagem;
  vazio.style.display = "";
}

// ============================================================
// BLOCO 1 — OPERACIONAL
// ============================================================
function renderOperacional() {
  const chamados = chamadosFiltrados("operacional");
  const equipamentos = equipamentosFiltrados("operacional");

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

  // Tendência: registrados x concluídos por mês (barras — em um gráfico de
  // linha o valor menor ficava escondido atrás do maior nos meses em que
  // os dois ficavam próximos).
  const meses = mesesParaGraficos("operacional");
  const registradosPorMes = contarPorMes(chamados, "registradoEm", meses);
  const concluidosPorMes = contarPorMes(chamados, "concluidoEm", meses);
  const { dataInicio, dataFim } = valoresFiltroBloco("operacional");
  document.getElementById("titulo-op-tendencia").textContent = (dataInicio && dataFim)
    ? "Chamados registrados × concluídos (período selecionado)"
    : "Chamados registrados × concluídos (últimos 6 meses)";
  criarGrafico(document.getElementById("chart-op-tendencia"), {
    type: "bar",
    data: {
      labels: meses.map((m) => m.label),
      datasets: [
        { label: "Registrados", data: registradosPorMes, backgroundColor: COR.accent, borderRadius: 4 },
        { label: "Concluídos", data: concluidosPorMes, backgroundColor: COR.green, borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  // Distribuição por macro-etapa
  const porEtapa = MACRO_ETAPAS.map((_, i) => chamados.filter((c) => (STATUS_PARA_ETAPA[c.status] ?? 0) === i && c.status !== "concluido").length);
  porEtapa[5] = chamados.filter((c) => c.status === "concluido").length;
  criarGrafico(document.getElementById("chart-op-etapa"), {
    type: "doughnut",
    data: { labels: MACRO_ETAPAS, datasets: [{ data: porEtapa, backgroundColor: [COR.muted, COR.accent, "#c98a2e", COR.blue, "#5a8fa8", COR.green] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  // Por planta / setor — mostra onde os chamados estão concentrados
  const porPlantaSetor = {};
  chamados.forEach((c) => {
    const chave = `${c.plantaNome || "—"} / ${c.setorNome || "—"}`;
    porPlantaSetor[chave] = (porPlantaSetor[chave] || 0) + 1;
  });
  const entradasPlanta = Object.entries(porPlantaSetor).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entradasPlanta.length === 0) { graficoVazio("chart-op-planta", "Sem chamados registrados ainda."); }
  else {
    criarGrafico(document.getElementById("chart-op-planta"), {
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
  const chamados = chamadosFiltrados("mauuso");

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
    criarGrafico(document.getElementById("chart-mu-resultado"), {
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
    else criarGrafico(document.getElementById("chart-mu-ranking"), {
      type: "bar",
      data: { labels: ranking.map((e) => e[0]), datasets: [{ label: "Mau uso confirmado", data: ranking.map((e) => e[1]), backgroundColor: COR.red, borderRadius: 4 }] },
      options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
    });
  }

  const meses = mesesParaGraficos("mauuso");
  const apontadosPorMes = contarPorMes(doMauUso, "registradoEm", meses);
  const confirmadosPorMes = meses.map((m) => doMauUso.filter((c) => c.parecerMauUso?.resultado === "confirmado" && chaveMes(c.parecerMauUso.timestamp) === m.chave).length);
  criarGrafico(document.getElementById("chart-mu-evolucao"), {
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
  const chamados = chamadosFiltrados("financeiro");

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

  criarGrafico(document.getElementById("chart-fin-funil"), {
    type: "bar",
    data: {
      labels: ["Apresentado", "Aprovado", "Valor final"],
      datasets: [{ data: [apresentado, aprovado, final], backgroundColor: [COR.mutedTint, COR.accentTint, COR.green], borderColor: [COR.muted, COR.accent, COR.green], borderWidth: 1.5, borderRadius: 4 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  }, { moeda: true });

  const meses = mesesParaGraficos("financeiro");
  const faturadoPorMesReal = meses.map((m) => chamados.filter((c) => chaveMes(tsToMs(c.financeiro?.dataFaturamento)) === m.chave).reduce((s, c) => s + (c.financeiro?.valorFinal || 0), 0));
  const { dataInicio, dataFim } = valoresFiltroBloco("financeiro");
  document.getElementById("titulo-fin-mensal").textContent = (dataInicio && dataFim)
    ? "Faturamento por mês (período selecionado)"
    : "Faturamento por mês (últimos 6 meses)";
  criarGrafico(document.getElementById("chart-fin-mensal"), {
    type: "line",
    data: { labels: meses.map((m) => m.label), datasets: [{ label: "Faturado", data: faturadoPorMesReal, borderColor: COR.blue, backgroundColor: COR.blueTint, fill: true, tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  }, { moeda: true });

  const porPlanta = {};
  chamados.forEach((c) => {
    const v = c.financeiro?.valorFinal || 0;
    if (v > 0) { const chave = `${c.plantaNome || "—"} / ${c.setorNome || "—"}`; porPlanta[chave] = (porPlanta[chave] || 0) + v; }
  });
  const entradas = Object.entries(porPlanta).sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (entradas.length === 0) graficoVazio("chart-fin-planta", "Nenhum faturamento registrado ainda.");
  else criarGrafico(document.getElementById("chart-fin-planta"), {
    type: "bar",
    data: { labels: entradas.map((e) => e[0]), datasets: [{ label: "Faturado", data: entradas.map((e) => e[1]), backgroundColor: COR.blue, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  }, { moeda: true });
}

// ============================================================
// BLOCO 4 — RECORRÊNCIA
// ============================================================
async function renderRecorrencia() {
  const chamados = chamadosFiltrados("recorrencia");
  const equipamentos = equipamentosFiltrados("recorrencia");

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

  criarGrafico(document.getElementById("chart-rec-nivel"), {
    type: "doughnut",
    data: { labels: ["Normal", "Atenção", "Alta recorrência"], datasets: [{ data: [niveis.normal + semChamado, niveis.atencao, niveis.alta], backgroundColor: [COR.muted, COR.accent, COR.red] }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } } }
  });

  if (ranking.length === 0) graficoVazio("chart-rec-ranking", "Sem dados suficientes.");
  else criarGrafico(document.getElementById("chart-rec-ranking"), {
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
  else criarGrafico(document.getElementById("chart-rec-categoria"), {
    type: "bar",
    data: { labels: entradasCat.map((e) => e[0]), datasets: [{ label: "Chamados", data: entradasCat.map((e) => e[1]), backgroundColor: COR.green, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });
}

// ============================================================
// BLOCO 5 — COMPARATIVO DE SETORES
// Filtro só de Planta (+ Período) — sem filtro de Setor, já que o
// objetivo aqui é justamente comparar os setores entre si. Escolhendo
// uma planta, a comparação fica só entre os setores dela; sem escolher,
// mostra "planta / setor" para não misturar setores de plantas diferentes
// que tenham o mesmo nome.
// ============================================================
function renderComparativoSetores() {
  const chamados = chamadosFiltrados("setores");
  const { planta } = valoresFiltroBloco("setores");
  const chaveDoSetor = (c) => (planta ? (c.setorNome || "—") : `${c.plantaNome || "—"} / ${c.setorNome || "—"}`);

  document.getElementById("titulo-setores-chamados").textContent = planta
    ? `Chamados por setor — ${planta}`
    : "Chamados por setor (todas as plantas)";

  const porSetorChamados = {};
  chamados.forEach((c) => { const k = chaveDoSetor(c); porSetorChamados[k] = (porSetorChamados[k] || 0) + 1; });
  const rankingChamados = Object.entries(porSetorChamados).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const porSetorMauUso = {};
  chamados.filter((c) => c.parecerMauUso?.resultado === "confirmado").forEach((c) => { const k = chaveDoSetor(c); porSetorMauUso[k] = (porSetorMauUso[k] || 0) + 1; });
  const rankingMauUso = Object.entries(porSetorMauUso).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const porSetorFinanceiro = {};
  chamados.forEach((c) => {
    const v = c.financeiro?.valorFinal || 0;
    if (v > 0) { const k = chaveDoSetor(c); porSetorFinanceiro[k] = (porSetorFinanceiro[k] || 0) + v; }
  });
  const rankingFinanceiro = Object.entries(porSetorFinanceiro).sort((a, b) => b[1] - a[1]).slice(0, 12);

  const topChamados = rankingChamados[0];
  const topMauUso = rankingMauUso[0];
  const topFinanceiro = rankingFinanceiro[0];

  document.getElementById("kpi-setores").innerHTML = kpiGrid([
    { valor: topChamados ? topChamados[0] : "—", label: "Setor com mais chamados" },
    { valor: topMauUso ? topMauUso[0] : "—", label: "Setor com mais mau uso confirmado" },
    { valor: topFinanceiro ? formatarMoeda(topFinanceiro[1]) : "—", label: topFinanceiro ? `Maior custo: ${topFinanceiro[0]}` : "Maior custo por setor" }
  ]);

  if (rankingChamados.length === 0) graficoVazio("chart-setores-chamados", "Sem chamados registrados ainda.");
  else criarGrafico(document.getElementById("chart-setores-chamados"), {
    type: "bar",
    data: { labels: rankingChamados.map((e) => e[0]), datasets: [{ label: "Chamados", data: rankingChamados.map((e) => e[1]), backgroundColor: COR.accent, borderRadius: 4 }] },
    options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  if (rankingMauUso.length === 0) graficoVazio("chart-setores-mauuso", "Nenhum mau uso confirmado ainda.");
  else criarGrafico(document.getElementById("chart-setores-mauuso"), {
    type: "bar",
    data: { labels: rankingMauUso.map((e) => e[0]), datasets: [{ label: "Mau uso confirmado", data: rankingMauUso.map((e) => e[1]), backgroundColor: COR.red, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  });

  if (rankingFinanceiro.length === 0) graficoVazio("chart-setores-financeiro", "Nenhum faturamento registrado ainda.");
  else criarGrafico(document.getElementById("chart-setores-financeiro"), {
    type: "bar",
    data: { labels: rankingFinanceiro.map((e) => e[0]), datasets: [{ label: "Faturado", data: rankingFinanceiro.map((e) => e[1]), backgroundColor: COR.blue, borderRadius: 4 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } } } }
  }, { moeda: true });
}
