// ============================================================
// fornecedor.js
// ============================================================

let usuarioAtual = null;
let ativosCache = [];
let historicoCache = [];
let filtroAtualFornecedor = "todos";

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
  aplicarMascaraMoeda(document.getElementById("lb-valor-final"));
  adicionarAtalhoMaster(usuarioAtual);
  montarFiltroStatus("filtro-status-fornecedor", (chave) => { filtroAtualFornecedor = chave; renderFila(); }, ["todos", "atendimento", "validacao", "autorizacao", "execucao", "encerramento"]);
})();

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
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
  document.getElementById("form-nf").addEventListener("submit", salvarNf);
  document.getElementById("dg-mauuso").addEventListener("change", atualizarCamposDiagnostico);
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

// Ações do fornecedor por status (bate com o fluxograma)
const ACOES_POR_STATUS = {
  fornecedor_acionado: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirProgramar('${c.id}')">Programar atendimento</button>`,
  atendimento_programado: (c) => `<button class="btn btn--primary btn--sm" onclick="iniciarAvaliacao('${c.id}')">Iniciar avaliação técnica</button>`,
  em_avaliacao_tecnica: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirDiagnostico('${c.id}', false)">Registrar diagnóstico</button>`,
  diagnostico_contestado: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirDiagnostico('${c.id}', true)">Novo diagnóstico</button>`,
  em_teste: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirLiberar('${c.id}')">Liberar máquina</button>`,
  aguardando_nf: (c) => `<button class="btn btn--primary btn--sm" onclick="abrirNf('${c.id}')">Anexar NF de cobrança</button>`
};

function cardDataAgendada(c) {
  if (!c.dataAtendimentoPrevista) return "";
  const d = new Date(c.dataAtendimentoPrevista);
  return `<div style="margin:8px 0;"><span class="destaque-data">${icone("calendario", 14)} Atendimento: ${d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>`;
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  const lista = aplicarFiltroStatus(ativosCache, filtroAtualFornecedor);
  if (lista.length === 0) {
    el.innerHTML = ativosCache.length === 0
      ? `<div class="empty">${icone("chave", 34)}<div class="empty__title">Nada ativo no momento</div></div>`
      : `<div class="empty"><div class="empty__text">Nenhum chamado nesse filtro.</div></div>`;
    return;
  }
  el.innerHTML = lista.map((c) => {
    const acaoFn = ACOES_POR_STATUS[c.status];
    const acao = acaoFn ? acaoFn(c) : "";
    return `
    <div class="ticket-card">
      <div class="ticket-card__top"><div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>${badgeHtml(c.status)}</div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 80))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")}</span><span class="chip chip--${c.criticidade}">${c.criticidade || ""}</span></div>
      ${cardDataAgendada(c)}
      <div style="margin:8px 0;">${responsavelAtualHtml(c.status)}</div>
      ${stepperHtml(c.status)}
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
      <div class="ticket-card__meta"><span>${c.fluxo === "mau_uso" ? "Mau uso confirmado" : "Contratual"}</span><span>${formatarMoeda(c.financeiro?.valorFinal || c.financeiro?.valorFaturado)}</span></div>
    </a>`).join("");
}

// ---------- Programar atendimento ----------
function abrirProgramar(id) { document.getElementById("pg-id").value = id; abrirFechar("overlay-programar", true); }
async function salvarProgramacao(e) {
  e.preventDefault();
  const id = document.getElementById("pg-id").value;
  const data = document.getElementById("pg-data").value;
  try {
    await transicionarChamado(id, "atendimento_programado", `Atendimento programado para ${new Date(data).toLocaleString("pt-BR")}`, usuarioAtual.nome, "fornecedor",
      { dataAtendimentoPrevista: data },
      { tipo: "programacao", dataAtendimentoPrevista: data }
    );
    e.target.reset();
    abrirFechar("overlay-programar", false);
    mostrarToast("Atendimento programado.");
  } catch (err) {
    alert("Erro ao programar atendimento: " + err.message);
  }
}

async function iniciarAvaliacao(id) {
  try {
    await transicionarChamado(id, "em_avaliacao_tecnica", "Avaliação técnica iniciada — começa a contar o tempo de manutenção", usuarioAtual.nome, "fornecedor");
    mostrarToast("Avaliação técnica iniciada.");
  } catch (err) {
    alert("Erro ao iniciar avaliação: " + err.message);
  }
}

// ---------- Diagnóstico ----------
// Regra do fluxo: se for mau uso, valor e ao menos 1 anexo são obrigatórios.
// Se não for, o campo de valor fica INATIVO e anexos são opcionais.
function atualizarCamposDiagnostico() {
  const mauUso = document.getElementById("dg-mauuso").value === "sim";
  const campoValor = document.getElementById("dg-valor");
  campoValor.disabled = !mauUso;
  if (!mauUso) campoValor.value = "";
  document.getElementById("dg-aviso-obrigatorio").style.display = mauUso ? "block" : "none";
}

function abrirDiagnostico(id, contestado) {
  const form = document.getElementById("form-diagnostico");
  form.reset();
  document.getElementById("dg-id").value = id;
  document.getElementById("dg-titulo").textContent = contestado ? "Novo diagnóstico" : "Registrar diagnóstico";
  document.getElementById("dg-callout-contestado").style.display = contestado ? "block" : "none";
  atualizarCamposDiagnostico();
  abrirFechar("overlay-diagnostico", true);
}

async function salvarDiagnostico(e) {
  e.preventDefault();
  const id = document.getElementById("dg-id").value;
  const texto = document.getElementById("dg-texto").value.trim();
  const mauUso = document.getElementById("dg-mauuso").value === "sim";
  const valor = mauUso ? valorMoedaParaNumero(document.getElementById("dg-valor")) : 0;
  const arquivos = document.getElementById("dg-anexos").files;

  if (mauUso && (!valor || valor <= 0)) { alert("Informe o valor apresentado — é obrigatório em caso de mau uso."); return; }
  if (mauUso && arquivos.length === 0) { alert("Anexe ao menos uma evidência (foto, vídeo, relatório ou orçamento) — é obrigatório em caso de mau uso."); return; }

  const btn = document.getElementById("btn-diagnostico");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  let urls = [];
  if (arquivos.length > 0) {
    try {
      for (const file of arquivos) {
        const ref = storage.ref(`chamados/${id}/diagnostico/${Date.now()}-${file.name}`);
        await ref.put(file);
        urls.push(await ref.getDownloadURL());
      }
    } catch (err) {
      console.warn("Não foi possível anexar arquivos do diagnóstico:", err);
      alert("O diagnóstico será enviado, mas não foi possível anexar os arquivos.");
    }
  }

  try {
    const chamadoAtual = ativosCache.find((c) => c.id === id);
    const proximoStatus = mauUso ? "aguardando_validacao" : "aguardando_autorizacao";
    const extra = {
      fluxo: mauUso ? "mau_uso" : "contratual",
      diagnostico: { texto, indicaMauUso: mauUso, timestamp: Date.now() },
      "financeiro.valorApresentado": valor
    };
    // Guarda o primeiro valor apresentado — serve de base pro cálculo de
    // custo evitado depois, se o fornecedor acabar desistindo do mau uso.
    if (mauUso && !chamadoAtual?.financeiro?.valorApresentadoOriginal) {
      extra["financeiro.valorApresentadoOriginal"] = valor;
    }
    // Se o fornecedor estava contestando e agora reconheceu que não é mau
    // uso, o valor original inteiro (que seria cobrado) vira custo evitado.
    if (!mauUso && chamadoAtual?.status === "diagnostico_contestado" && chamadoAtual?.financeiro?.valorApresentadoOriginal) {
      extra["financeiro.custoEvitado"] = chamadoAtual.financeiro.valorApresentadoOriginal;
    }
    if (urls.length > 0) extra.fotosDiagnostico = firebase.firestore.FieldValue.arrayUnion(...urls);

    const dadosEtapa = { tipo: "diagnostico", texto, indicaMauUso: mauUso, valor: mauUso ? valor : null, anexos: urls };
    await transicionarChamado(
      id, proximoStatus,
      mauUso ? "Diagnóstico enviado — indicado como possível mau uso" : "Diagnóstico enviado — manutenção contratual normal",
      usuarioAtual.nome, "fornecedor", extra, dadosEtapa
    );
    e.target.reset();
    abrirFechar("overlay-diagnostico", false);
    mostrarToast("Diagnóstico enviado.");
  } catch (err) {
    alert("Erro ao enviar diagnóstico: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar diagnóstico";
  }
}

// ---------- Liberação ----------
function abrirLiberar(id) {
  const c = ativosCache.find((x) => x.id === id);
  document.getElementById("form-liberar").reset();
  document.getElementById("lb-id").value = id;
  document.getElementById("lb-bloco-mauuso").style.display = c?.fluxo === "mau_uso" ? "block" : "none";
  abrirFechar("overlay-liberar", true);
}
async function salvarLiberacao(e) {
  e.preventDefault();
  const id = document.getElementById("lb-id").value;
  const c = ativosCache.find((x) => x.id === id);
  const servico = document.getElementById("lb-servico").value.trim();
  const statusFinal = document.getElementById("lb-status-final").value;
  const ehMauUso = c?.fluxo === "mau_uso";
  const valorFinal = ehMauUso ? valorMoedaParaNumero(document.getElementById("lb-valor-final")) : null;
  const arquivoOrcamento = ehMauUso ? document.getElementById("lb-orcamento").files[0] : null;

  if (ehMauUso && (!valorFinal || valorFinal <= 0)) { alert("Informe o valor final do orçamento."); return; }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    let orcamentoUrl = null;
    if (arquivoOrcamento) {
      try {
        const ref = storage.ref(`chamados/${id}/orcamento-final/${Date.now()}-${arquivoOrcamento.name}`);
        await ref.put(arquivoOrcamento);
        orcamentoUrl = await ref.getDownloadURL();
      } catch (err) {
        console.warn("Não foi possível anexar o orçamento final:", err);
        alert("A liberação será registrada, mas não foi possível anexar o orçamento.");
      }
    }

    const extra = { servicoExecutado: servico, liberadoEm: firebase.firestore.FieldValue.serverTimestamp() };
    const dadosEtapa = { tipo: "liberacao", servico, statusFinal, valorFinal, orcamentoUrl };
    if (ehMauUso) {
      extra["financeiro.valorFinal"] = valorFinal;
      if (orcamentoUrl) extra["financeiro.orcamentoFinalUrl"] = orcamentoUrl;
      // Próximo passo: mau uso confirmado precisa de ordem de compra + NF
      await transicionarChamado(id, "liberado", "Máquina liberada — aguardando ordem de compra", usuarioAtual.nome, "fornecedor", extra, dadosEtapa);
    } else {
      // Fluxo contratual: liberar já encerra o chamado, sem papelada extra
      extra.concluidoEm = firebase.firestore.FieldValue.serverTimestamp();
      await transicionarChamado(id, "concluido", "Máquina liberada — chamado contratual concluído", usuarioAtual.nome, "fornecedor", extra, dadosEtapa);
    }

    if (c?.equipamentoId) {
      try {
        await db.collection("equipamentos").doc(c.equipamentoId).update({ statusOperacional: statusFinal });
      } catch (err) {
        console.warn("Não foi possível atualizar o status do equipamento:", err);
      }
    }
    e.target.reset();
    abrirFechar("overlay-liberar", false);
    mostrarToast("Máquina liberada.");
  } catch (err) {
    alert("Erro ao liberar a máquina: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- NF de cobrança ----------
function abrirNf(id) { document.getElementById("form-nf").reset(); document.getElementById("nf-id").value = id; abrirFechar("overlay-nf", true); }
async function salvarNf(e) {
  e.preventDefault();
  const id = document.getElementById("nf-id").value;
  const arquivo = document.getElementById("nf-arquivo").files[0];
  const btn = document.getElementById("btn-nf");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  let notaFiscalUrl = null;
  try {
    const ref = storage.ref(`chamados/${id}/nota-fiscal/${Date.now()}-${arquivo.name}`);
    await ref.put(arquivo);
    notaFiscalUrl = await ref.getDownloadURL();
  } catch (err) {
    console.warn("Não foi possível anexar a NF:", err);
    alert("Não foi possível anexar a nota fiscal agora. Tente novamente.");
    btn.disabled = false;
    btn.textContent = "Enviar NF e concluir chamado";
    return;
  }

  try {
    await transicionarChamado(id, "concluido", "NF de cobrança anexada — chamado concluído", usuarioAtual.nome, "fornecedor", {
      "financeiro.notaFiscalUrl": notaFiscalUrl,
      "financeiro.dataFaturamento": firebase.firestore.FieldValue.serverTimestamp(),
      concluidoEm: firebase.firestore.FieldValue.serverTimestamp()
    }, { tipo: "nf", notaFiscalUrl });
    e.target.reset();
    abrirFechar("overlay-nf", false);
    mostrarToast("Chamado concluído.");
  } catch (err) {
    alert("Erro ao concluir: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar NF e concluir chamado";
  }
}
