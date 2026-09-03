// ============================================================
// fornecedor.js
// ============================================================

let usuarioAtual = null;
let ativosCache = [];
let historicoCache = [];

(async function init() {
  usuarioAtual = await requireAuth("fornecedor");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-empresa").textContent = usuarioAtual.empresa || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  escutarChamados();
  configurarNav();
  configurarOverlays();
  aplicarMascaraMoeda(document.getElementById("dg-valor"));
  aplicarMascaraMoeda(document.getElementById("ft-valor"));
})();

function configurarNav() {
  document.querySelectorAll(".navitem").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["fila", "historico", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}

function configurarOverlays() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("form-programar").addEventListener("submit", salvarProgramacao);
  document.getElementById("form-diagnostico").addEventListener("submit", salvarDiagnostico);
  document.getElementById("form-liberar").addEventListener("submit", salvarLiberacao);
  document.getElementById("form-faturar").addEventListener("submit", salvarFaturamento);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function escutarChamados() {
  db.collection("chamados").where("fornecedorId", "==", usuarioAtual.uid).onSnapshot((snap) => {
    const todos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ativosCache = todos.filter((c) => STATUS_ATIVOS.includes(c.status));
    historicoCache = todos.filter((c) => c.status === "concluido");
    ativosCache.sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0));
    historicoCache.sort((a, b) => (tsToMs(b.concluidoEm) || 0) - (tsToMs(a.concluidoEm) || 0));
    renderFila();
    renderHistorico();
    renderStats();
  });
}

function renderStats() {
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${ativosCache.length}</div><div class="stat-card__label">Ativos</div></div>
    <div class="stat-card"><div class="stat-card__value">${historicoCache.length}</div><div class="stat-card__label">Concluídos</div></div>
  `;
}

const ACOES_POR_STATUS = {
  fornecedor_acionado: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirProgramar('${c.id}')">Programar atendimento</button>`,
  atendimento_programado: (c) => `<button class="btn btn--primary btn--sm" onclick="iniciarAvaliacao('${c.id}')">Iniciar avaliação técnica</button>`,
  em_avaliacao_tecnica: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirDiagnostico('${c.id}', false)">Registrar diagnóstico</button>`,
  aguardando_documentacao_mau_uso: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirDiagnostico('${c.id}', true)">Complementar documentação</button>`,
  em_manutencao: (c) => `<button class="btn btn--primary btn--sm" onclick="iniciarTeste('${c.id}')">Iniciar teste</button>`,
  em_teste: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirLiberar('${c.id}')">Liberar máquina</button>`,
  liberado: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirFaturar('${c.id}')">Faturar e concluir</button>`
};

function renderFila() {
  const el = document.getElementById("lista-fila");
  if (ativosCache.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty__icon">🔧</div><div class="empty__title">Nada ativo no momento</div></div>`;
    return;
  }
  el.innerHTML = ativosCache.map((c) => {
    const acaoFn = ACOES_POR_STATUS[c.status];
    const acao = acaoFn ? acaoFn(c) : "";
    return `
    <div class="ticket-card">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 80))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")}</span><span class="chip chip--${c.criticidade}">${c.criticidade || ""}</span></div>
      <div style="margin:8px 0;">${responsavelAtualHtml(c.status)}</div>
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver detalhes</a>${acao}</div>
    </div>`;
  }).join("");
}

function renderHistorico() {
  const el = document.getElementById("lista-historico");
  if (historicoCache.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__text">Nenhum chamado concluído ainda.</div></div>`; return; }
  el.innerHTML = historicoCache.map((c) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div class="ticket-card__meta"><span>${TIPO_MANUTENCAO_LABELS[c.tipoManutencao] || "—"}</span><span>${formatarMoeda(c.financeiro?.valorFaturado)}</span></div>
    </a>`).join("");
}

// ---------- Programar atendimento ----------
function abrirProgramar(id) { document.getElementById("pg-id").value = id; abrirFechar("overlay-programar", true); }
async function salvarProgramacao(e) {
  e.preventDefault();
  const id = document.getElementById("pg-id").value;
  const data = document.getElementById("pg-data").value;
  try {
    await transicionarChamado(id, "atendimento_programado", `Atendimento programado para ${new Date(data).toLocaleString("pt-BR")}`, usuarioAtual.nome, "fornecedor", {
      dataAtendimentoPrevista: data
    });
    e.target.reset();
    abrirFechar("overlay-programar", false);
  } catch (err) {
    alert("Erro ao programar atendimento: " + err.message);
  }
}

async function iniciarAvaliacao(id) {
  try {
    await transicionarChamado(id, "em_avaliacao_tecnica", "Avaliação técnica iniciada", usuarioAtual.nome, "fornecedor");
  } catch (err) {
    alert("Erro ao iniciar avaliação: " + err.message);
  }
}

// ---------- Diagnóstico / documentação de mau uso ----------
function abrirDiagnostico(id, complementando) {
  const form = document.getElementById("form-diagnostico");
  form.reset();
  document.getElementById("dg-id").value = id;
  document.getElementById("dg-mauuso").parentElement.style.display = complementando ? "none" : "block";
  document.getElementById("dg-mauuso").dataset.complementando = complementando ? "1" : "0";
  abrirFechar("overlay-diagnostico", true);
}

async function salvarDiagnostico(e) {
  e.preventDefault();
  const id = document.getElementById("dg-id").value;
  const complementando = document.getElementById("dg-mauuso").dataset.complementando === "1";
  const texto = document.getElementById("dg-texto").value.trim();
  const mauUso = complementando ? true : document.getElementById("dg-mauuso").value === "sim";
  const valor = valorMoedaParaNumero(document.getElementById("dg-valor"));
  const arquivos = document.getElementById("dg-anexos").files;
  const btn = document.getElementById("btn-diagnostico");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  try {
    let urls = [];
    if (arquivos.length > 0) {
      for (const file of arquivos) {
        const ref = storage.ref(`chamados/${id}/diagnostico/${Date.now()}-${file.name}`);
        await ref.put(file);
        urls.push(await ref.getDownloadURL());
      }
    }
    const proximoStatus = mauUso ? "aguardando_validacao" : "aguardando_autorizacao";
    const extra = {
      fluxo: mauUso ? "mau_uso" : "contratual",
      diagnostico: { texto, indicaMauUso: mauUso, timestamp: Date.now() },
      "financeiro.valorApresentado": valor
    };
    if (urls.length > 0) extra.fotosDiagnostico = firebase.firestore.FieldValue.arrayUnion(...urls);
    await transicionarChamado(
      id, proximoStatus,
      mauUso ? "Diagnóstico enviado — indicado como possível mau uso" : "Diagnóstico enviado — manutenção contratual normal",
      usuarioAtual.nome, "fornecedor", extra
    );
    e.target.reset();
    abrirFechar("overlay-diagnostico", false);
  } catch (err) {
    alert("Erro ao enviar diagnóstico: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar diagnóstico";
  }
}

async function iniciarTeste(id) {
  try {
    await transicionarChamado(id, "em_teste", "Máquina em teste após manutenção", usuarioAtual.nome, "fornecedor");
  } catch (err) {
    alert("Erro ao iniciar teste: " + err.message);
  }
}

// ---------- Liberação ----------
function abrirLiberar(id) { document.getElementById("lb-id").value = id; abrirFechar("overlay-liberar", true); }
async function salvarLiberacao(e) {
  e.preventDefault();
  const id = document.getElementById("lb-id").value;
  const servico = document.getElementById("lb-servico").value.trim();
  const statusFinal = document.getElementById("lb-status-final").value;
  const chamado = (await db.collection("chamados").doc(id).get()).data();
  await transicionarChamado(id, "liberado", "Máquina liberada e testada", usuarioAtual.nome, "fornecedor", {
    servicoExecutado: servico,
    liberadoEm: firebase.firestore.FieldValue.serverTimestamp()
  });
  if (chamado?.equipamentoId) {
    await db.collection("equipamentos").doc(chamado.equipamentoId).update({ statusOperacional: statusFinal });
  }
  e.target.reset();
  abrirFechar("overlay-liberar", false);
}

// ---------- Faturamento ----------
function abrirFaturar(id) { document.getElementById("ft-id").value = id; abrirFechar("overlay-faturar", true); }
async function salvarFaturamento(e) {
  e.preventDefault();
  const id = document.getElementById("ft-id").value;
  const tipo = document.getElementById("ft-tipo").value;
  const valor = valorMoedaParaNumero(document.getElementById("ft-valor"));
  const arquivo = document.getElementById("ft-nf").files[0];
  const btn = document.getElementById("btn-faturar");
  btn.disabled = true;
  btn.textContent = "Concluindo…";
  try {
    let notaFiscalUrl = null;
    if (arquivo) {
      const ref = storage.ref(`chamados/${id}/nota-fiscal/${Date.now()}-${arquivo.name}`);
      await ref.put(arquivo);
      notaFiscalUrl = await ref.getDownloadURL();
    }
    await transicionarChamado(id, "concluido", "Chamado faturado e concluído", usuarioAtual.nome, "fornecedor", {
      tipoManutencao: tipo,
      "financeiro.valorFaturado": valor,
      "financeiro.notaFiscalUrl": notaFiscalUrl,
      "financeiro.dataFaturamento": firebase.firestore.FieldValue.serverTimestamp(),
      concluidoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    e.target.reset();
    abrirFechar("overlay-faturar", false);
  } catch (err) {
    alert("Erro ao concluir: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Concluir chamado";
  }
}
