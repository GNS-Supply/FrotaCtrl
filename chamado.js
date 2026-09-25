// ============================================================
// chamado.js — detalhe de um chamado (todos os perfis)
// Mostra os dados completos, em blocos separados por etapa (com
// quem fez o quê), E as ações da etapa atual — sem precisar voltar
// pra lista pra agir sobre o chamado.
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
  aplicarMascaraMoeda(document.getElementById("lb-valor-final"));
  document.getElementById("dg-mauuso").addEventListener("change", atualizarCamposDiagnostico);

  const toastPendente = sessionStorage.getItem("toastPendente");
  if (toastPendente) {
    sessionStorage.removeItem("toastPendente");
    mostrarToast(toastPendente);
  }

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
  document.getElementById("form-ordem-compra").addEventListener("submit", salvarOrdemCompra);
  document.getElementById("form-programar").addEventListener("submit", salvarProgramacao);
  document.getElementById("form-diagnostico").addEventListener("submit", salvarDiagnostico);
  document.getElementById("form-parecer").addEventListener("submit", salvarParecer);
  document.getElementById("form-decisao").addEventListener("submit", salvarDecisao);
  document.getElementById("form-liberar").addEventListener("submit", salvarLiberacao);
  document.getElementById("form-nf").addEventListener("submit", salvarNf);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function render(c) {
  const souManutencao = usuarioAtual.tipo === "manutencao";

  // ---------- Cabeçalho: identificação em blocos claros ----------
  const dataAtend = c.dataAtendimentoPrevista ? new Date(c.dataAtendimentoPrevista) : null;
  document.getElementById("cabecalho").innerHTML = `
    <div class="ch-header">
      <div class="ch-header__topo">
        <div class="ch-header__id">
          <div class="ch-header__numero">${escapeHtml(c.numero || "")}</div>
          <div class="ch-header__equip">${escapeHtml(c.numeroFrota || "")} · ${escapeHtml(c.tipoModeloEquip || "—")}</div>
        </div>
        <div class="ch-header__status">
          ${badgeHtml(c.status)}
          ${responsavelAtualHtml(c.status)}
        </div>
      </div>
      <div class="ch-header__grid">
        <div class="ch-header__campo"><span class="ch-header__rotulo">Criticidade</span><span class="ch-header__valor">${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : "—"}</span></div>
        <div class="ch-header__campo"><span class="ch-header__rotulo">Local</span><span class="ch-header__valor">${escapeHtml(c.plantaNome || "—")} / ${escapeHtml(c.setorNome || "—")}</span></div>
        <div class="ch-header__campo"><span class="ch-header__rotulo">Horímetro</span><span class="ch-header__valor ch-header__valor--mono">${(c.horimetro ?? 0).toLocaleString("pt-BR")} h</span></div>
        <div class="ch-header__campo"><span class="ch-header__rotulo">Aberto em</span><span class="ch-header__valor">${formatarData(c.registradoEm)}</span></div>
        <div class="ch-header__campo"><span class="ch-header__rotulo">Fornecedor</span><span class="ch-header__valor">${escapeHtml(c.fornecedorNome || "—")}</span></div>
        <div class="ch-header__campo"><span class="ch-header__rotulo">Atendimento</span><span class="ch-header__valor">${dataAtend ? dataAtend.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "a programar"}</span></div>
      </div>
    </div>
  `;

  // ---------- Linha do tempo clicável + tempos compactos ----------
  document.getElementById("stepper-detalhe").innerHTML = timelineHtml(c);

  const registradoMs = tsToMs(c.registradoEm);
  const acionadoMs = tsToMs(c.historico?.find((h) => h.status === "fornecedor_acionado")?.timestamp);
  const avaliacaoMs = tsToMs(c.historico?.find((h) => h.status === "em_avaliacao_tecnica")?.timestamp);
  const liberadoMs = tsToMs(c.liberadoEm);
  const tempoAteAcionamento = acionadoMs && registradoMs ? acionadoMs - registradoMs : null;
  const tempoManutencao = avaliacaoMs ? (liberadoMs || Date.now()) - avaliacaoMs : null;
  const tempoTotalParada = registradoMs ? (liberadoMs || Date.now()) - registradoMs : null;
  document.getElementById("tempos-grid").innerHTML = `
    <div class="tempo-item"><span class="tempo-item__valor">${msParaDuracao(tempoAteAcionamento)}</span><span class="tempo-item__label">até acionar</span></div>
    <div class="tempo-item"><span class="tempo-item__valor">${msParaDuracao(tempoManutencao)}</span><span class="tempo-item__label">manutenção</span></div>
    <div class="tempo-item tempo-item--destaque"><span class="tempo-item__valor">${msParaDuracao(tempoTotalParada)}</span><span class="tempo-item__label">parado ${liberadoMs ? "(total)" : "(até agora)"}</span></div>
  `;

  renderAcoes(c);

  document.getElementById("c-categoria").textContent = c.categoria || "—";
  document.getElementById("c-turno").textContent = TURNO_LABELS[c.turno] || "—";
  document.getElementById("c-fluxo").textContent = c.fluxo === "mau_uso" ? "Mau uso" : c.fluxo === "contratual" ? "Contratual normal" : "A definir";
  document.getElementById("c-solicitante").textContent = c.solicitanteNome || "—";
  document.getElementById("c-descricao").textContent = c.descricao || "—";
  if (c.impactoSeguranca) {
    document.getElementById("c-impacto-wrap").style.display = "block";
    document.getElementById("c-impacto").textContent = c.impactoSeguranca;
  }
  document.getElementById("fotos-grid").innerHTML = (c.fotos || []).map((u) => `<a href="${u}" target="_blank"><img src="${u}" /></a>`).join("");

  // Financeiro — nunca mostrado pra Manutenção Magius.
  if (!souManutencao && (c.financeiro?.valorApresentado || c.financeiro?.valorFinal)) {
    document.getElementById("bloco-financeiro").style.display = "block";
    const f = c.financeiro || {};
    document.getElementById("f-apresentado").textContent = formatarMoeda(f.valorApresentado);
    document.getElementById("f-aprovado").textContent = formatarMoeda(f.valorAprovado);
    document.getElementById("f-final").textContent = formatarMoeda(f.valorFinal);
    document.getElementById("f-evitado").textContent = formatarMoeda(f.custoEvitado);
    document.getElementById("f-oc").textContent = f.ordemCompraNumero || "—";
    if (f.orcamentoFinalUrl) { const l = document.getElementById("f-orcamento-link"); l.href = f.orcamentoFinalUrl; l.style.display = "inline-flex"; }
    if (f.notaFiscalUrl) { const l = document.getElementById("f-nf-link"); l.href = f.notaFiscalUrl; l.style.display = "inline-flex"; }
  } else {
    document.getElementById("bloco-financeiro").style.display = "none";
  }

  // ---------- Etapas (coluna única, cada uma completa) ----------
  const historico = (c.historico || []).slice().sort((a, b) => a.timestamp - b.timestamp);
  document.getElementById("etapas-lista").innerHTML = historico.map((h, i) => etapaCardHtml(h, i, souManutencao)).join("");
}

// Cartão completo de uma etapa: quem deu sequência, quando, o que
// registrou e todos os anexos/observações daquela etapa.
function etapaCardHtml(h, indice, souManutencao, destacada) {
  const macro = STATUS_PARA_ETAPA[h.status] ?? 0;
  return `
    <div class="etapa-card ${destacada ? "etapa-card--destacada" : ""}" id="etapa-${indice}">
      <div class="etapa-card__head">
        <span class="etapa-card__status">
          <span class="etapa-card__macro">${MACRO_ETAPAS[macro]}</span>
          ${STATUS_LABELS[h.status] || h.status}
        </span>
        <span class="etapa-card__meta">${formatarData(h.timestamp)}</span>
      </div>
      <div class="etapa-card__autor">
        <span class="etapa-card__avatar">${iniciais(h.autor)}</span>
        <span><strong>${escapeHtml(h.autor || "—")}</strong>${h.perfil ? ` · ${escapeHtml(h.perfil)}` : ""}</span>
      </div>
      ${h.obs ? `<div class="etapa-card__obs">${escapeHtml(h.obs)}</div>` : ""}
      ${renderDadosEtapa(h.dados, souManutencao)}
    </div>`;
}

// Linha do tempo vertical com as 9 etapas do processo. Mostra, num só
// lugar: em qual etapa o chamado está agora, quais já foram concluídas,
// quais ainda faltam, quais (3 e 4, mau uso) nem chegaram a acontecer
// neste chamado — e, se uma etapa se repetiu (fornecedor refazendo
// diagnóstico depois de um parecer de "não confirmado"), quantas vezes.
function timelineHtml(c) {
  const etapas = etapasStatusChamado(c);
  const indiceFoco = etapas.findIndex((e) => e.estado === "atual" || e.estado === "cancelada");

  let banner;
  if (c.status === "concluido") {
    banner = `<div class="timeline-banner timeline-banner--ok">${icone("checkCirculo", 20)}<div><strong>Chamado concluído</strong><span>Todas as etapas foram encerradas com sucesso.</span></div></div>`;
  } else if (c.status === "cancelado") {
    const e = etapas[indiceFoco];
    banner = `<div class="timeline-banner timeline-banner--erro">${icone("x", 20)}<div><strong>Chamado cancelado</strong><span>Parou na etapa ${indiceFoco + 1}/9 — ${e ? e.titulo : ""}.</span></div></div>`;
  } else {
    const e = etapas[indiceFoco];
    const perfil = PERFIL_LABELS[PROXIMO_RESPONSAVEL[c.status]] || "—";
    banner = `<div class="timeline-banner">${icone("relogio", 20)}<div><strong>Parado na etapa ${indiceFoco + 1}/9 — ${e ? e.titulo : ""}</strong><span>Precisa cobrar: <strong>${perfil}</strong></span></div></div>`;
  }

  return `${banner}<div class="timeline">${etapas.map((e) => timelineItemHtml(e)).join("")}</div>`;
}

const LABEL_ESTADO_ETAPA = { concluida: "Concluída", atual: "Em andamento", pendente: "Pendente", nao_aplicavel: "Não ocorreu", cancelada: "Parou aqui" };

function timelineItemHtml(e) {
  const clicavel = e.registros.length > 0;
  return `
    <button type="button" class="timeline-item timeline-item--${e.estado} ${clicavel ? "timeline-item--clicavel" : ""}" ${clicavel ? `onclick="mostrarEtapasMacro(${e.indice})"` : "disabled"} title="${clicavel ? "Ver detalhes desta etapa" : ""}">
      <div class="timeline-item__marcador">${e.estado === "concluida" ? icone("check", 13) : e.indice + 1}</div>
      <div class="timeline-item__corpo">
        <div class="timeline-item__topo">
          <span class="timeline-item__titulo">${e.titulo}</span>
          ${e.repeticoes > 1 ? `<span class="timeline-item__badge-rep">repetiu ${e.repeticoes}×</span>` : ""}
        </div>
        <span class="timeline-item__responsavel">${PERFIL_LABELS[e.responsavel] || ""}</span>
        ${e.estado === "nao_aplicavel" ? `<span class="timeline-item__nota">Não houve indício de mau uso — etapa pulada</span>` : ""}
      </div>
      <div class="timeline-item__status">${LABEL_ESTADO_ETAPA[e.estado] || ""}</div>
    </button>`;
}

// Mostra, num painel logo abaixo da linha do tempo, todas as etapas
// registradas dentro daquela macro-etapa.
function mostrarEtapasMacro(indiceMacro) {
  const souManutencao = usuarioAtual.tipo === "manutencao";
  const historico = (chamadoAtual.historico || []).slice().sort((a, b) => a.timestamp - b.timestamp);
  const doGrupo = historico.filter((h) => (STATUS_PARA_ETAPA[h.status] ?? 0) === indiceMacro);
  const wrap = document.getElementById("detalhe-etapa-selecionada");
  if (doGrupo.length === 0) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <div class="etapa-foco">
      <div class="etapa-foco__head">
        <span class="etapa-foco__titulo">${MACRO_ETAPAS[indiceMacro]} — ${doGrupo.length} registro(s)</span>
        <button class="close-x" onclick="document.getElementById('detalhe-etapa-selecionada').innerHTML=''">${icone("x", 14)}</button>
      </div>
      ${doGrupo.map((h, i) => etapaCardHtml(h, `foco-${i}`, souManutencao, true)).join("")}
    </div>`;
  wrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// Renderiza os dados específicos de cada tipo de etapa (o que foi
// preenchido ali, não só a frase de observação).
function renderDadosEtapa(dados, souManutencao) {
  if (!dados) return "";
  const linhas = [];
  if (dados.tipo === "triagem") {
    if (dados.criticidadeAnterior && dados.criticidadeAnterior !== dados.criticidadeNova) linhas.push(["Criticidade", `${dados.criticidadeAnterior} → ${dados.criticidadeNova}`]);
    if (dados.descricaoRevisada) linhas.push(["Descrição revisada", dados.descricaoRevisada]);
  } else if (dados.tipo === "acionamento") {
    linhas.push(["Fornecedor acionado", dados.fornecedorNome]);
  } else if (dados.tipo === "programacao") {
    linhas.push(["Data/hora prevista", new Date(dados.dataAtendimentoPrevista).toLocaleString("pt-BR")]);
  } else if (dados.tipo === "diagnostico") {
    linhas.push(["Mau uso?", dados.indicaMauUso ? "Sim" : "Não"]);
    if (dados.indicaMauUso && !souManutencao) linhas.push(["Valor apresentado", formatarMoeda(dados.valor)]);
    let extra = `<div class="destaque-texto" style="margin-top:8px;">${escapeHtml(dados.texto || "")}</div>`;
    if ((dados.anexos || []).length) extra += `<div class="photo-grid">${dados.anexos.map((u) => `<a href="${u}" target="_blank"><img src="${u}" /></a>`).join("")}</div>`;
    return linhaEtapaHtml(linhas) + extra;
  } else if (dados.tipo === "parecer") {
    linhas.push(["Modalidade", dados.modalidade === "presencial" ? "Presencial" : "Documental"]);
    linhas.push(["Resultado", PARECER_LABELS[dados.resultado] || dados.resultado]);
    return linhaEtapaHtml(linhas) + `<div class="destaque-texto" style="margin-top:8px;">${escapeHtml(dados.justificativa || "")}</div>`;
  } else if (dados.tipo === "ciencia") {
    if (dados.comentario) return `<div class="destaque-texto" style="margin-top:8px;">${escapeHtml(dados.comentario)}</div>`;
    return "";
  } else if (dados.tipo === "liberacao") {
    linhas.push(["Status final", STATUS_OPERACIONAL_LABELS[dados.statusFinal] || dados.statusFinal]);
    if (dados.valorFinal && !souManutencao) linhas.push(["Valor final", formatarMoeda(dados.valorFinal)]);
    let extra = `<div class="destaque-texto" style="margin-top:8px;">${escapeHtml(dados.servico || "")}</div>`;
    if (dados.orcamentoUrl && !souManutencao) extra += `<a href="${dados.orcamentoUrl}" target="_blank" class="btn btn--secondary btn--sm" style="margin-top:8px;">Ver orçamento anexado</a>`;
    return linhaEtapaHtml(linhas) + extra;
  } else if (dados.tipo === "ordem_compra") {
    if (dados.numeroOc) linhas.push(["Número da OC", dados.numeroOc]);
    let extra = "";
    if (dados.ordemCompraUrl) extra = `<a href="${dados.ordemCompraUrl}" target="_blank" class="btn btn--secondary btn--sm" style="margin-top:8px;">Ver ordem de compra</a>`;
    return linhaEtapaHtml(linhas) + extra;
  } else if (dados.tipo === "nf") {
    return `<a href="${dados.notaFiscalUrl}" target="_blank" class="btn btn--secondary btn--sm" style="margin-top:8px;">Ver nota fiscal</a>`;
  }
  return linhaEtapaHtml(linhas);
}
function linhaEtapaHtml(linhas) {
  if (!linhas.length) return "";
  return `<div class="etapa-card__dados">${linhas.map(([k, v]) => `<div class="etapa-card__linha"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span></div>`).join("")}</div>`;
}

// ============================================================
// Ações contextuais — o que aparece depende do perfil de quem
// está logado E do status atual do chamado.
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
    if (c.status === "aguardando_autorizacao") html += `<button class="btn btn--primary btn--sm" onclick="autorizarExecucaoDetalhe()">Autorizar execução</button>`;
    if (c.status === "aguardando_ordem_compra") html += `<button class="btn btn--primary btn--sm" onclick="abrirOrdemCompraDetalhe()">Anexar ordem de compra</button>`;
  }
  if (souFornecedorDoChamado) {
    if (c.status === "fornecedor_acionado") html += `<button class="btn btn--primary btn--sm" onclick="abrirProgramarDetalhe()">Programar atendimento</button>`;
    if (c.status === "atendimento_programado") html += `<button class="btn btn--primary btn--sm" onclick="iniciarAvaliacaoDetalhe()">Iniciar avaliação técnica</button>`;
    if (c.status === "em_avaliacao_tecnica") html += `<button class="btn btn--primary btn--sm" onclick="abrirDiagnosticoDetalhe(false)">Registrar diagnóstico</button>`;
    if (c.status === "diagnostico_contestado") html += `<button class="btn btn--primary btn--sm" onclick="abrirDiagnosticoDetalhe(true)">Novo diagnóstico</button>`;
    if (c.status === "em_teste") html += `<button class="btn btn--primary btn--sm" onclick="abrirLiberarDetalhe()">Liberar máquina</button>`;
    if (c.status === "aguardando_nf") html += `<button class="btn btn--primary btn--sm" onclick="abrirNfDetalhe()">Anexar NF de cobrança</button>`;
  }
  if (souManutencao && c.status === "aguardando_validacao") {
    html += `<button class="btn btn--primary btn--sm" onclick="abrirParecerDetalhe()">Emitir parecer</button>`;
  }
  if (souAprovador && c.status === "aguardando_aprovacao") {
    html += `<button class="btn btn--primary btn--sm" onclick="abrirDecisaoDetalhe()">Dar ciência</button>`;
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
    await transicionarChamado(chamadoId, "em_triagem", obs, usuarioAtual.nome, "gestao_frota", { criticidade: novaCriticidade, descricao: novaDescricao },
      { tipo: "triagem", criticidadeAnterior: chamadoAtual.criticidade, criticidadeNova: novaCriticidade, descricaoRevisada: novaDescricao });
    abrirFechar("overlay-triagem", false);
    mostrarToast("Triagem concluída.");
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
    await transicionarChamado(chamadoId, "fornecedor_acionado", `Fornecedor ${fornecedor.nome} acionado`, usuarioAtual.nome, "gestao_frota", { fornecedorId, fornecedorNome: fornecedor.nome }, { tipo: "acionamento", fornecedorNome: fornecedor.nome });
    abrirFechar("overlay-acionar", false);
    mostrarToast("Fornecedor acionado.");
  } catch (err) {
    alert("Erro ao acionar fornecedor: " + err.message);
  }
}

async function autorizarExecucaoDetalhe() {
  try {
    await transicionarChamado(chamadoId, "em_teste", "Execução autorizada pela Gestão de Frota — fornecedor pode iniciar", usuarioAtual.nome, "gestao_frota", { autorizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    mostrarToast("Execução autorizada.");
  } catch (err) {
    alert("Erro ao autorizar execução: " + err.message);
  }
}

// ---------- Ordem de compra ----------
function abrirOrdemCompraDetalhe() { document.getElementById("form-ordem-compra").reset(); abrirFechar("overlay-ordem-compra", true); }
async function salvarOrdemCompra(e) {
  e.preventDefault();
  const numeroOc = document.getElementById("oc-numero").value.trim();
  const arquivo = document.getElementById("oc-arquivo").files[0];
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  let ordemCompraUrl = null;
  if (arquivo) {
    try {
      ordemCompraUrl = await enviarArquivo(`chamados/${chamadoId}/ordem-compra/${Date.now()}-${arquivo.name}`, arquivo, (pct) => { btn.textContent = `Enviando… ${pct}%`; });
    } catch (err) {
      alert("Não foi possível anexar a ordem de compra: " + err.message + "\n\nNada foi alterado. Tente novamente.");
      btn.disabled = false;
      btn.textContent = "Confirmar";
      return;
    }
  }
  try {
    await transicionarChamado(chamadoId, "aguardando_nf", "Ordem de compra anexada pela Gestão de Frota", usuarioAtual.nome, "gestao_frota",
      { "financeiro.ordemCompraNumero": numeroOc, "financeiro.ordemCompraUrl": ordemCompraUrl },
      { tipo: "ordem_compra", numeroOc, ordemCompraUrl });
    e.target.reset();
    abrirFechar("overlay-ordem-compra", false);
    mostrarToast("Ordem de compra anexada.");
  } catch (err) {
    alert("Erro ao anexar ordem de compra: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Fornecedor: programar / avaliar ----------
function abrirProgramarDetalhe() { abrirFechar("overlay-programar", true); }
async function salvarProgramacao(e) {
  e.preventDefault();
  const data = document.getElementById("pg-data").value;
  try {
    await transicionarChamado(chamadoId, "atendimento_programado", `Atendimento programado para ${new Date(data).toLocaleString("pt-BR")}`, usuarioAtual.nome, "fornecedor", { dataAtendimentoPrevista: data }, { tipo: "programacao", dataAtendimentoPrevista: data });
    e.target.reset();
    abrirFechar("overlay-programar", false);
    mostrarToast("Atendimento programado.");
  } catch (err) {
    alert("Erro ao programar atendimento: " + err.message);
  }
}
async function iniciarAvaliacaoDetalhe() {
  try {
    await transicionarChamado(chamadoId, "em_avaliacao_tecnica", "Avaliação técnica iniciada — começa a contar o tempo de manutenção", usuarioAtual.nome, "fornecedor");
    mostrarToast("Avaliação técnica iniciada.");
  } catch (err) {
    alert("Erro ao iniciar avaliação: " + err.message);
  }
}

// ---------- Diagnóstico ----------
function atualizarCamposDiagnostico() {
  const mauUso = document.getElementById("dg-mauuso").value === "sim";
  const campoValor = document.getElementById("dg-valor");
  campoValor.disabled = !mauUso;
  if (!mauUso) campoValor.value = "";
  document.getElementById("dg-aviso-obrigatorio").style.display = mauUso ? "block" : "none";
}
function abrirDiagnosticoDetalhe(contestado) {
  const form = document.getElementById("form-diagnostico");
  form.reset();
  document.getElementById("dg-titulo").textContent = contestado ? "Novo diagnóstico" : "Registrar diagnóstico";
  document.getElementById("dg-callout-contestado").style.display = contestado ? "block" : "none";
  atualizarCamposDiagnostico();
  abrirFechar("overlay-diagnostico", true);
}
async function salvarDiagnostico(e) {
  e.preventDefault();
  const texto = document.getElementById("dg-texto-input").value.trim();
  const mauUso = document.getElementById("dg-mauuso").value === "sim";
  const valor = mauUso ? valorMoedaParaNumero(document.getElementById("dg-valor")) : 0;
  const arquivos = document.getElementById("dg-anexos").files;

  if (mauUso && (!valor || valor <= 0)) { alert("Informe o valor apresentado — é obrigatório em caso de mau uso."); return; }

  const btn = document.getElementById("btn-diagnostico");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  let urls = [];
  if (arquivos.length > 0) {
    try {
      urls = await enviarArquivos(`chamados/${chamadoId}/diagnostico`, arquivos, btn, "Enviar diagnóstico");
    } catch (err) {
      // Anexo agora é opcional mesmo em caso de mau uso: se o envio falhar,
      // apenas avisa e segue o diagnóstico sem a evidência.
      console.warn("Não foi possível anexar arquivos do diagnóstico:", err);
      alert("O diagnóstico será enviado, mas não foi possível anexar os arquivos: " + err.message);
    }
  }
  try {
    const proximoStatus = mauUso ? "aguardando_validacao" : "aguardando_autorizacao";
    const extra = {
      fluxo: mauUso ? "mau_uso" : "contratual",
      diagnostico: { texto, indicaMauUso: mauUso, timestamp: Date.now() },
      "financeiro.valorApresentado": valor
    };
    if (mauUso && !chamadoAtual?.financeiro?.valorApresentadoOriginal) extra["financeiro.valorApresentadoOriginal"] = valor;
    if (!mauUso && chamadoAtual?.status === "diagnostico_contestado" && chamadoAtual?.financeiro?.valorApresentadoOriginal) {
      extra["financeiro.custoEvitado"] = chamadoAtual.financeiro.valorApresentadoOriginal;
    }
    if (urls.length > 0) extra.fotosDiagnostico = firebase.firestore.FieldValue.arrayUnion(...urls);
    const dadosEtapa = { tipo: "diagnostico", texto, indicaMauUso: mauUso, valor: mauUso ? valor : null, anexos: urls };
    await transicionarChamado(chamadoId, proximoStatus, mauUso ? "Diagnóstico enviado — indicado como possível mau uso" : "Diagnóstico enviado — manutenção contratual normal", usuarioAtual.nome, "fornecedor", extra, dadosEtapa);
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

// ---------- Parecer (Manutenção Magius) ----------
function abrirParecerDetalhe() { document.getElementById("form-parecer").reset(); abrirFechar("overlay-parecer", true); }
async function salvarParecer(e) {
  e.preventDefault();
  const resultado = document.getElementById("pc-resultado").value;
  const modalidade = document.getElementById("pc-modalidade").value;
  const justificativa = document.getElementById("pc-justificativa").value.trim();
  const parecer = { resultado, modalidade, justificativa, autor: usuarioAtual.nome, timestamp: Date.now() };
  let proximoStatus, obs;
  if (resultado === "confirmado") {
    proximoStatus = "aguardando_aprovacao";
    obs = "Mau uso confirmado — encaminhado para ciência do aprovador";
  } else if (resultado === "nao_confirmado") {
    proximoStatus = "diagnostico_contestado";
    obs = "Mau uso não confirmado — devolvido ao fornecedor para novo diagnóstico";
  } else {
    proximoStatus = "diagnostico_contestado";
    obs = "Parecer inconclusivo — devolvido ao fornecedor para novo diagnóstico";
  }
  try {
    await transicionarChamado(chamadoId, proximoStatus, obs, usuarioAtual.nome, "manutencao", { parecerMauUso: parecer }, { tipo: "parecer", resultado, modalidade, justificativa });
    e.target.reset();
    abrirFechar("overlay-parecer", false);
    mostrarToast("Parecer registrado.");
  } catch (err) {
    alert("Erro ao emitir parecer: " + err.message);
  }
}

// ---------- Ciência (Aprovador) ----------
function abrirDecisaoDetalhe() { document.getElementById("form-decisao").reset(); abrirFechar("overlay-decisao", true); }
async function salvarDecisao(e) {
  e.preventDefault();
  const comentario = document.getElementById("dc-comentario").value.trim();
  const registro = { decisao: "ciente", comentario, autor: usuarioAtual.nome, timestamp: Date.now() };
  try {
    await transicionarChamado(chamadoId, "aguardando_autorizacao", comentario || "Ciência registrada pelo aprovador", usuarioAtual.nome, "aprovador",
      { aprovacao: registro, "financeiro.valorAprovado": chamadoAtual?.financeiro?.valorApresentado || 0 },
      { tipo: "ciencia", comentario });
    e.target.reset();
    abrirFechar("overlay-decisao", false);
    mostrarToast("Ciência registrada.");
  } catch (err) {
    alert("Erro ao registrar ciência: " + err.message);
  }
}

// ---------- Liberação ----------
function abrirLiberarDetalhe() {
  document.getElementById("form-liberar").reset();
  document.getElementById("lb-bloco-mauuso").style.display = chamadoAtual?.fluxo === "mau_uso" ? "block" : "none";
  abrirFechar("overlay-liberar", true);
}
async function salvarLiberacao(e) {
  e.preventDefault();
  const servico = document.getElementById("lb-servico").value.trim();
  const statusFinal = document.getElementById("lb-status-final").value;
  const ehMauUso = chamadoAtual?.fluxo === "mau_uso";
  const valorFinal = ehMauUso ? valorMoedaParaNumero(document.getElementById("lb-valor-final")) : null;
  const arquivoOrcamento = ehMauUso ? document.getElementById("lb-orcamento").files[0] : null;
  if (ehMauUso && (!valorFinal || valorFinal <= 0)) { alert("Informe o valor final do orçamento."); return; }

  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    let orcamentoUrl = null;
    if (arquivoOrcamento) {
      try {
        orcamentoUrl = await enviarArquivo(`chamados/${chamadoId}/orcamento-final/${Date.now()}-${arquivoOrcamento.name}`, arquivoOrcamento);
      } catch (err) {
        alert("Não foi possível anexar o orçamento: " + err.message + "\n\nA liberação não foi registrada. Tente novamente.");
        if (btn) btn.disabled = false;
        return;
      }
    }
    const extra = { servicoExecutado: servico, liberadoEm: firebase.firestore.FieldValue.serverTimestamp() };
    const dadosEtapa = { tipo: "liberacao", servico, statusFinal, valorFinal, orcamentoUrl };
    if (ehMauUso) {
      extra["financeiro.valorFinal"] = valorFinal;
      if (orcamentoUrl) extra["financeiro.orcamentoFinalUrl"] = orcamentoUrl;
      await transicionarChamado(chamadoId, "liberado", "Máquina liberada — aguardando ordem de compra", usuarioAtual.nome, "fornecedor", extra, dadosEtapa);
    } else {
      extra.concluidoEm = firebase.firestore.FieldValue.serverTimestamp();
      await transicionarChamado(chamadoId, "concluido", "Máquina liberada — chamado contratual concluído", usuarioAtual.nome, "fornecedor", extra, dadosEtapa);
    }
    if (chamadoAtual?.equipamentoId) {
      try {
        await db.collection("equipamentos").doc(chamadoAtual.equipamentoId).update({ statusOperacional: statusFinal });
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
function abrirNfDetalhe() { document.getElementById("form-nf").reset(); abrirFechar("overlay-nf", true); }
async function salvarNf(e) {
  e.preventDefault();
  const arquivo = document.getElementById("nf-arquivo").files[0];
  const btn = document.getElementById("btn-nf");
  btn.disabled = true;
  btn.textContent = "Enviando…";
  let notaFiscalUrl = null;
  try {
    notaFiscalUrl = await enviarArquivo(`chamados/${chamadoId}/nota-fiscal/${Date.now()}-${arquivo.name}`, arquivo, (pct) => { btn.textContent = `Enviando… ${pct}%`; });
  } catch (err) {
    alert("Não foi possível anexar a nota fiscal: " + err.message);
    btn.disabled = false;
    btn.textContent = "Enviar NF e concluir chamado";
    return;
  }
  try {
    await transicionarChamado(chamadoId, "concluido", "NF de cobrança anexada — chamado concluído", usuarioAtual.nome, "fornecedor", {
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
