// ============================================================
// chamado.js — detalhe de um chamado (todos os perfis)
// Mostra os dados completos E as ações da etapa atual, filtradas
// pelo perfil de quem está vendo — assim não é preciso voltar pra
// lista pra agir sobre o chamado.
// ============================================================

let usuarioAtual = null;
let chamadoId = null;
let chamadoAtual = null;
let fornecedoresCacheDetalhe = null;

(async function init() {
  usuarioAtual = await requireAuth();
  popularTopbarMeta(usuarioAtual);

  const params = new URLSearchParams(window.location.search);
  chamadoId = params.get("id");
  if (!chamadoId) { voltar(); return; }

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  configurarOverlays();
  aplicarMascaraMoeda(document.getElementById("dg-valor"));
  aplicarMascaraMoeda(document.getElementById("pc-valor"));
  aplicarMascaraMoeda(document.getElementById("ft-valor"));

  db.collection("chamados").doc(chamadoId).onSnapshot((doc) => {
    if (!doc.exists) return;
    chamadoAtual = { id: doc.id, ...doc.data() };
    render(chamadoAtual);
  });
})();

function voltar() {
  window.location.href = PERFIL_HOME[usuarioAtual?.tipo] || "index.html";
}

function configurarOverlays() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("form-triagem").addEventListener("submit", salvarTriagem);
  document.getElementById("form-acionar").addEventListener("submit", salvarAcionamento);
  document.getElementById("form-programar").addEventListener("submit", salvarProgramacao);
  document.getElementById("form-diagnostico").addEventListener("submit", salvarDiagnostico);
  document.getElementById("form-parecer").addEventListener("submit", salvarParecer);
  document.getElementById("form-decisao").addEventListener("submit", salvarDecisao);
  document.getElementById("form-liberar").addEventListener("submit", salvarLiberacao);
  document.getElementById("form-faturar").addEventListener("submit", salvarFaturamento);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function render(c) {
  document.getElementById("cabecalho").innerHTML = `
    <div class="machine-plate__head">
      <div>
        <div class="machine-plate__id">${escapeHtml(c.numero || "")} · ${escapeHtml(c.numeroFrota || "")}</div>
        <div class="machine-plate__model">${escapeHtml(c.tipoModeloEquip || "")}</div>
      </div>
      <div class="hourmeter"><div class="hourmeter__value">${(c.horimetro ?? 0).toLocaleString("pt-BR")}h</div><div class="hourmeter__label">Horímetro</div></div>
    </div>
    <div class="pill-group" style="margin-top:8px;">
      ${badgeHtml(c.status)}
      ${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : ""}
      ${responsavelAtualHtml(c.status)}
    </div>
    <div style="font-size:12px; color:var(--text-dim); margin-top:8px;">${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")} · Aberto em ${formatarData(c.registradoEm)} por ${escapeHtml(c.solicitanteNome || "—")}</div>
  `;

  document.getElementById("stepper-detalhe").innerHTML = stepperHtml(c.status, true);

  renderAcoes(c);

  // Tempos
  const registradoMs = tsToMs(c.registradoEm);
  const acionadoMs = tsToMs(c.historico?.find((h) => h.status === "fornecedor_acionado")?.timestamp);
  const liberadoMs = tsToMs(c.liberadoEm);
  const tempoAteAcionamento = acionadoMs && registradoMs ? acionadoMs - registradoMs : null;
  // O relógio de "parada" encerra quando a máquina volta a operar (liberada),
  // não quando a documentação/faturamento é concluída depois.
  const tempoTotalParada = registradoMs ? (liberadoMs || Date.now()) - registradoMs : null;

  document.getElementById("tempos-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${msParaDuracao(tempoAteAcionamento)}</div><div class="stat-card__label">Até acionar fornecedor</div></div>
    <div class="stat-card" style="grid-column: 1 / -1;"><div class="stat-card__value">${msParaDuracao(tempoTotalParada)}</div><div class="stat-card__label">Tempo parado (registro → ${liberadoMs ? "liberação" : "agora"})</div></div>
  `;

  document.getElementById("c-categoria").textContent = c.categoria || "—";
  document.getElementById("c-turno").textContent = TURNO_LABELS[c.turno] || "—";
  document.getElementById("c-fluxo").textContent = c.fluxo === "mau_uso" ? "Fluxo de mau uso" : c.fluxo === "contratual" ? "Fluxo contratual normal" : "Ainda não definido (aguardando diagnóstico)";
  document.getElementById("c-descricao").textContent = c.descricao || "—";
  if (c.impactoSeguranca) {
    document.getElementById("c-impacto-wrap").style.display = "block";
    document.getElementById("c-impacto").textContent = c.impactoSeguranca;
  }
  document.getElementById("fotos-grid").innerHTML = (c.fotos || []).map((u) => `<a href="${u}" target="_blank"><img src="${u}" /></a>`).join("");

  if (c.diagnostico) {
    document.getElementById("bloco-diagnostico").style.display = "block";
    document.getElementById("dg-texto").textContent = `${c.diagnostico.texto} ${c.diagnostico.indicaMauUso ? "(indicado como possível mau uso)" : "(manutenção contratual)"}`;
    document.getElementById("fotos-diagnostico").innerHTML = (c.fotosDiagnostico || []).map((u) => `<a href="${u}" target="_blank"><img src="${u}" /></a>`).join("");
  }

  if (c.parecerMauUso) {
    document.getElementById("bloco-parecer").style.display = "block";
    document.getElementById("parecer-callout").innerHTML = `
      <strong>${PARECER_LABELS[c.parecerMauUso.resultado]}</strong> (${c.parecerMauUso.modalidade === "presencial" ? "validação presencial" : "validação documental"})<br/>
      ${escapeHtml(c.parecerMauUso.justificativa)}<br/>
      <span style="font-size:11.5px;">${escapeHtml(c.parecerMauUso.autor)} · ${formatarData(c.parecerMauUso.timestamp)}</span>
    `;
  }

  if (c.aprovacao) {
    document.getElementById("bloco-aprovacao").style.display = "block";
    const label = { aprovado: "Aprovado", reprovado: "Reprovado", esclarecimento: "Esclarecimento solicitado" }[c.aprovacao.decisao];
    document.getElementById("aprovacao-callout").innerHTML = `
      <strong>${label}</strong>${c.aprovacao.comentario ? " — " + escapeHtml(c.aprovacao.comentario) : ""}<br/>
      <span style="font-size:11.5px;">${escapeHtml(c.aprovacao.autor)} · ${formatarData(c.aprovacao.timestamp)}</span>
    `;
  }

  const f = c.financeiro || {};
  document.getElementById("f-apresentado").textContent = formatarMoeda(f.valorApresentado);
  document.getElementById("f-validado").textContent = formatarMoeda(f.valorValidado);
  document.getElementById("f-aprovado").textContent = formatarMoeda(f.valorAprovado);
  document.getElementById("f-evitado").textContent = formatarMoeda(f.custoEvitado);
  document.getElementById("f-faturado").textContent = formatarMoeda(f.valorFaturado);
  document.getElementById("f-tipo").textContent = TIPO_MANUTENCAO_LABELS[c.tipoManutencao] || "—";
  if (f.notaFiscalUrl) {
    const link = document.getElementById("f-nf-link");
    link.href = f.notaFiscalUrl;
    link.style.display = "block";
  }

  const historico = (c.historico || []).slice().sort((a, b) => a.timestamp - b.timestamp);
  document.getElementById("timeline").innerHTML = historico.map((h) => `
    <div class="timeline-item">
      <div class="timeline-item__dot"></div>
      <div class="timeline-item__body">
        <div class="timeline-item__status">${STATUS_LABELS[h.status] || h.status}</div>
        <div class="timeline-item__time">${formatarData(h.timestamp)} ${h.autor ? "· " + escapeHtml(h.autor) : ""} ${h.perfil ? "(" + escapeHtml(h.perfil) + ")" : ""}</div>
        ${h.obs ? `<div class="timeline-item__obs">${escapeHtml(h.obs)}</div>` : ""}
      </div>
    </div>`).join("");
}

// ============================================================
// Ações contextuais — o que aparece depende do perfil de quem
// está logado E do status atual do chamado. Espelha a lógica das
// telas de cada perfil (gestao-frota.js, fornecedor.js, etc.).
// ============================================================
function renderAcoes(c) {
  const tipo = usuarioAtual.tipo;
  const master = tipo === "administrador";
  const bloco = document.getElementById("bloco-acoes");
  const botoes = document.getElementById("acoes-botoes");
  let html = "";

  const souGestao = tipo === "gestao_frota" || master;
  const souFornecedorDoChamado = (tipo === "fornecedor" && c.fornecedorId === usuarioAtual.uid) || master;
  const souManutencao = tipo === "manutencao" || master;
  const souAprovador = tipo === "aprovador" || master;

  if (souGestao) {
    if (c.status === "registrado") html += `<button class="btn btn--primary btn--sm" onclick="abrirTriagemDetalhe()">Iniciar triagem</button>`;
    if (c.status === "em_triagem") html += `<button class="btn btn--primary btn--sm" onclick="abrirAcionarDetalhe()">Acionar fornecedor</button>`;
    if (c.status === "mau_uso_contestado") {
      html += `<button class="btn btn--secondary btn--sm" onclick="reabrirAvaliacaoDetalhe()">Reabrir avaliação</button>`;
      html += `<button class="btn btn--primary btn--sm" onclick="tratarComoContratualDetalhe()">Aceitar contestação</button>`;
    }
    if (c.status === "aguardando_autorizacao") html += `<button class="btn btn--primary btn--sm" onclick="autorizarExecucaoDetalhe()">Autorizar execução</button>`;
  }
  if (souFornecedorDoChamado) {
    if (c.status === "fornecedor_acionado") html += `<button class="btn btn--primary btn--sm" onclick="abrirProgramarDetalhe()">Programar atendimento</button>`;
    if (c.status === "atendimento_programado") html += `<button class="btn btn--primary btn--sm" onclick="iniciarAvaliacaoDetalhe()">Iniciar avaliação técnica</button>`;
    if (c.status === "em_avaliacao_tecnica") html += `<button class="btn btn--primary btn--sm" onclick="abrirDiagnosticoDetalhe(false)">Registrar diagnóstico</button>`;
    if (c.status === "aguardando_documentacao_mau_uso") html += `<button class="btn btn--primary btn--sm" onclick="abrirDiagnosticoDetalhe(true)">Complementar documentação</button>`;
    if (c.status === "em_manutencao") html += `<button class="btn btn--primary btn--sm" onclick="iniciarTesteDetalhe()">Iniciar teste</button>`;
    if (c.status === "em_teste") html += `<button class="btn btn--primary btn--sm" onclick="abrirLiberarDetalhe()">Liberar máquina</button>`;
    if (c.status === "liberado") html += `<button class="btn btn--primary btn--sm" onclick="abrirFaturarDetalhe()">Faturar e concluir</button>`;
  }
  if (souManutencao && c.status === "aguardando_validacao") {
    html += `<button class="btn btn--primary btn--sm" onclick="abrirParecerDetalhe()">Emitir parecer</button>`;
  }
  if (souAprovador && c.status === "aguardando_aprovacao") {
    html += `<button class="btn btn--primary btn--sm" onclick="abrirDecisaoDetalhe()">Decidir</button>`;
  }

  if (html) {
    bloco.style.display = "block";
    botoes.innerHTML = html;
  } else {
    bloco.style.display = "none";
  }
}

// ---------- Triagem ----------
function abrirTriagemDetalhe() {
  document.getElementById("tr-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, chamadoAtual.criticidade || "P2");
  document.getElementById("tr-descricao").value = chamadoAtual.descricao || "";
  abrirFechar("overlay-triagem", true);
}
async function salvarTriagem(e) {
  e.preventDefault();
  const novaCriticidade = document.getElementById("tr-criticidade").value;
  const novaDescricao = document.getElementById("tr-descricao").value.trim();
  const mudouCriticidade = chamadoAtual.criticidade !== novaCriticidade;
  const mudouDescricao = (chamadoAtual.descricao || "") !== novaDescricao;
  let obs = "Triagem concluída pela Gestão de Frota";
  if (mudouCriticidade) obs += ` — criticidade ajustada de ${chamadoAtual.criticidade} para ${novaCriticidade}`;
  if (mudouDescricao) obs += " — descrição revisada";
  try {
    await transicionarChamado(chamadoId, "em_triagem", obs, usuarioAtual.nome, "gestao_frota", { criticidade: novaCriticidade, descricao: novaDescricao });
    abrirFechar("overlay-triagem", false);
  } catch (err) {
    alert("Erro ao concluir triagem: " + err.message);
  }
}

// ---------- Acionar fornecedor ----------
async function abrirAcionarDetalhe() {
  if (!fornecedoresCacheDetalhe) {
    const snap = await db.collection("usuarios").where("tipo", "==", "fornecedor").get();
    fornecedoresCacheDetalhe = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  document.getElementById("ac-fornecedor").innerHTML = fornecedoresCacheDetalhe.length
    ? fornecedoresCacheDetalhe.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}${f.empresa ? " — " + escapeHtml(f.empresa) : ""}</option>`).join("")
    : `<option value="">Nenhum fornecedor cadastrado</option>`;
  abrirFechar("overlay-acionar", true);
}
async function salvarAcionamento(e) {
  e.preventDefault();
  const fornecedorId = document.getElementById("ac-fornecedor").value;
  const fornecedor = fornecedoresCacheDetalhe.find((f) => f.id === fornecedorId);
  if (!fornecedor) { alert("Selecione um fornecedor."); return; }
  try {
    await transicionarChamado(chamadoId, "fornecedor_acionado", `Fornecedor ${fornecedor.nome} acionado`, usuarioAtual.nome, "gestao_frota", { fornecedorId, fornecedorNome: fornecedor.nome });
    abrirFechar("overlay-acionar", false);
  } catch (err) {
    alert("Erro ao acionar fornecedor: " + err.message);
  }
}

// ---------- Contestação de mau uso ----------
async function tratarComoContratualDetalhe() {
  try {
    await transicionarChamado(chamadoId, "aguardando_autorizacao", "Contestação aceita — tratado como manutenção contratual", usuarioAtual.nome, "gestao_frota", {
      fluxo: "contratual",
      "financeiro.custoEvitado": chamadoAtual?.financeiro?.valorApresentado || 0
    });
  } catch (err) {
    alert("Erro ao processar contestação: " + err.message);
  }
}
async function reabrirAvaliacaoDetalhe() {
  try {
    await transicionarChamado(chamadoId, "aguardando_validacao", "Avaliação reaberta para nova análise da Manutenção Magius", usuarioAtual.nome, "gestao_frota");
  } catch (err) {
    alert("Erro ao reabrir avaliação: " + err.message);
  }
}
async function autorizarExecucaoDetalhe() {
  try {
    await transicionarChamado(chamadoId, "em_manutencao", "Execução autorizada pela Gestão de Frota", usuarioAtual.nome, "gestao_frota", { autorizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
  } catch (err) {
    alert("Erro ao autorizar execução: " + err.message);
  }
}

// ---------- Fornecedor: programar / avaliar ----------
function abrirProgramarDetalhe() { abrirFechar("overlay-programar", true); }
async function salvarProgramacao(e) {
  e.preventDefault();
  const data = document.getElementById("pg-data").value;
  try {
    await transicionarChamado(chamadoId, "atendimento_programado", `Atendimento programado para ${new Date(data).toLocaleString("pt-BR")}`, usuarioAtual.nome, "fornecedor", { dataAtendimentoPrevista: data });
    e.target.reset();
    abrirFechar("overlay-programar", false);
  } catch (err) {
    alert("Erro ao programar atendimento: " + err.message);
  }
}
async function iniciarAvaliacaoDetalhe() {
  try {
    await transicionarChamado(chamadoId, "em_avaliacao_tecnica", "Avaliação técnica iniciada", usuarioAtual.nome, "fornecedor");
  } catch (err) {
    alert("Erro ao iniciar avaliação: " + err.message);
  }
}

// ---------- Diagnóstico ----------
function abrirDiagnosticoDetalhe(complementando) {
  const form = document.getElementById("form-diagnostico");
  form.reset();
  document.getElementById("dg-mauuso-wrap").style.display = complementando ? "none" : "block";
  document.getElementById("dg-mauuso").dataset.complementando = complementando ? "1" : "0";
  abrirFechar("overlay-diagnostico", true);
}
async function salvarDiagnostico(e) {
  e.preventDefault();
  const complementando = document.getElementById("dg-mauuso").dataset.complementando === "1";
  const texto = document.getElementById("dg-texto-input").value.trim();
  const mauUso = complementando ? true : document.getElementById("dg-mauuso").value === "sim";
  const valor = valorMoedaParaNumero(document.getElementById("dg-valor"));
  const arquivos = document.getElementById("dg-anexos").files;
  const btn = document.getElementById("btn-diagnostico");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  let urls = [];
  if (arquivos.length > 0) {
    try {
      for (const file of arquivos) {
        const ref = storage.ref(`chamados/${chamadoId}/diagnostico/${Date.now()}-${file.name}`);
        await ref.put(file);
        urls.push(await ref.getDownloadURL());
      }
    } catch (err) {
      console.warn("Não foi possível anexar arquivos do diagnóstico:", err);
      alert("O diagnóstico será enviado, mas não foi possível anexar os arquivos.");
    }
  }
  try {
    const proximoStatus = mauUso ? "aguardando_validacao" : "aguardando_autorizacao";
    const extra = {
      fluxo: mauUso ? "mau_uso" : "contratual",
      diagnostico: { texto, indicaMauUso: mauUso, timestamp: Date.now() },
      "financeiro.valorApresentado": valor
    };
    if (urls.length > 0) extra.fotosDiagnostico = firebase.firestore.FieldValue.arrayUnion(...urls);
    await transicionarChamado(chamadoId, proximoStatus, mauUso ? "Diagnóstico enviado — indicado como possível mau uso" : "Diagnóstico enviado — manutenção contratual normal", usuarioAtual.nome, "fornecedor", extra);
    e.target.reset();
    abrirFechar("overlay-diagnostico", false);
  } catch (err) {
    alert("Erro ao enviar diagnóstico: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar diagnóstico";
  }
}

async function iniciarTesteDetalhe() {
  try {
    await transicionarChamado(chamadoId, "em_teste", "Máquina em teste após manutenção", usuarioAtual.nome, "fornecedor");
  } catch (err) {
    alert("Erro ao iniciar teste: " + err.message);
  }
}

// ---------- Liberação ----------
function abrirLiberarDetalhe() { abrirFechar("overlay-liberar", true); }
async function salvarLiberacao(e) {
  e.preventDefault();
  const servico = document.getElementById("lb-servico").value.trim();
  const statusFinal = document.getElementById("lb-status-final").value;
  try {
    await transicionarChamado(chamadoId, "liberado", "Máquina liberada e testada", usuarioAtual.nome, "fornecedor", { servicoExecutado: servico, liberadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    if (chamadoAtual?.equipamentoId) {
      try {
        await db.collection("equipamentos").doc(chamadoAtual.equipamentoId).update({ statusOperacional: statusFinal });
      } catch (err) {
        console.warn("Não foi possível atualizar o status do equipamento:", err);
      }
    }
    e.target.reset();
    abrirFechar("overlay-liberar", false);
  } catch (err) {
    alert("Erro ao liberar a máquina: " + err.message);
  }
}

// ---------- Faturamento ----------
function abrirFaturarDetalhe() { abrirFechar("overlay-faturar", true); }
async function salvarFaturamento(e) {
  e.preventDefault();
  const tipo = document.getElementById("ft-tipo").value;
  const valor = valorMoedaParaNumero(document.getElementById("ft-valor"));
  const arquivo = document.getElementById("ft-nf").files[0];
  const btn = document.getElementById("btn-faturar");
  btn.disabled = true;
  btn.textContent = "Concluindo…";

  let notaFiscalUrl = null;
  if (arquivo) {
    try {
      const ref = storage.ref(`chamados/${chamadoId}/nota-fiscal/${Date.now()}-${arquivo.name}`);
      await ref.put(arquivo);
      notaFiscalUrl = await ref.getDownloadURL();
    } catch (err) {
      console.warn("Não foi possível anexar a nota fiscal:", err);
      alert("O chamado será concluído, mas não foi possível anexar a nota fiscal.");
    }
  }
  try {
    await transicionarChamado(chamadoId, "concluido", "Chamado faturado e concluído", usuarioAtual.nome, "fornecedor", {
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

// ---------- Parecer (Manutenção Magius) ----------
function abrirParecerDetalhe() { document.getElementById("form-parecer").reset(); abrirFechar("overlay-parecer", true); }
async function salvarParecer(e) {
  e.preventDefault();
  const resultado = document.getElementById("pc-resultado").value;
  const modalidade = document.getElementById("pc-modalidade").value;
  const justificativa = document.getElementById("pc-justificativa").value.trim();
  const valorValidado = valorMoedaParaNumero(document.getElementById("pc-valor"));
  const parecer = { resultado, modalidade, justificativa, autor: usuarioAtual.nome, timestamp: Date.now() };
  let proximoStatus, obs, extra = { parecerMauUso: parecer };
  if (resultado === "confirmado") {
    proximoStatus = "aguardando_aprovacao";
    obs = "Mau uso confirmado — encaminhado para aprovação";
    extra["financeiro.valorValidado"] = valorValidado;
  } else if (resultado === "nao_confirmado") {
    proximoStatus = "mau_uso_contestado";
    obs = "Mau uso não confirmado — contestado";
  } else {
    proximoStatus = "aguardando_documentacao_mau_uso";
    obs = "Parecer inconclusivo — solicitada complementação de documentação";
  }
  try {
    await transicionarChamado(chamadoId, proximoStatus, obs, usuarioAtual.nome, "manutencao", extra);
    e.target.reset();
    abrirFechar("overlay-parecer", false);
  } catch (err) {
    alert("Erro ao emitir parecer: " + err.message);
  }
}

// ---------- Decisão (Aprovador) ----------
function abrirDecisaoDetalhe() { document.getElementById("form-decisao").reset(); abrirFechar("overlay-decisao", true); }
async function salvarDecisao(e) {
  e.preventDefault();
  const decisao = document.getElementById("dc-decisao").value;
  const comentario = document.getElementById("dc-comentario").value.trim();
  const registro = { decisao, comentario, autor: usuarioAtual.nome, timestamp: Date.now() };
  let proximoStatus, obs, extra = { aprovacao: registro };
  if (decisao === "aprovado") {
    proximoStatus = "aguardando_autorizacao";
    obs = comentario || "Valor aprovado";
    extra["financeiro.valorAprovado"] = chamadoAtual?.financeiro?.valorValidado || 0;
  } else if (decisao === "reprovado") {
    proximoStatus = "reprovado";
    obs = comentario || "Reprovado pelo aprovador";
  } else {
    proximoStatus = "aguardando_documentacao_mau_uso";
    obs = comentario || "Esclarecimento solicitado pelo aprovador";
  }
  try {
    await transicionarChamado(chamadoId, proximoStatus, obs, usuarioAtual.nome, "aprovador", extra);
    e.target.reset();
    abrirFechar("overlay-decisao", false);
  } catch (err) {
    alert("Erro ao registrar decisão: " + err.message);
  }
}
