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
  aplicarMascaraMoeda(document.getElementById("lb-valor-final"));
  adicionarAtalhoMaster(usuarioAtual);
})();

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["fila", "perfil"].forEach((v) => { const el = document.getElementById(`view-${v}`); if (el) el.style.display = v === view ? "block" : "none"; });
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
  const suaVez = ativosCache.filter(minhaVez).length;
  const terceiros = ativosCache.length - suaVez;
  const atrasados = ativosCache.filter((c) => c.status === "atendimento_programado" && c.dataAtendimentoPrevista && new Date(c.dataAtendimentoPrevista).getTime() < Date.now()).length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card stat-card--acao"><div class="stat-card__value">${suaVez}</div><div class="stat-card__label">Sua vez de agir</div></div>
    <div class="stat-card"><div class="stat-card__value">${terceiros}</div><div class="stat-card__label">Aguardando terceiros</div></div>
    <div class="stat-card ${atrasados ? "stat-card--alerta" : ""}"><div class="stat-card__value">${atrasados}</div><div class="stat-card__label">Atendimentos atrasados</div></div>
    <div class="stat-card"><div class="stat-card__value">${ativosCache.length}</div><div class="stat-card__label">Ativos no total</div></div>
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
  const atrasado = d.getTime() < Date.now() && c.status === "atendimento_programado";
  return `<div style="margin:8px 0;"><span class="destaque-data ${atrasado ? "destaque-data--atrasado" : ""}">${icone("calendario", 14)} ${atrasado ? "Atrasado desde" : "Atendimento"}: ${d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>`;
}

// Alerta visual destacado pros chamados marcados como mau uso
function seloMauUso(c) {
  if (c.fluxo !== "mau_uso") return "";
  const confirmado = c.parecerMauUso?.resultado === "confirmado";
  return `<span class="selo-mauuso ${confirmado ? "selo-mauuso--confirmado" : ""}">${icone("alerta", 13)} ${confirmado ? "Mau uso confirmado" : "Mau uso alegado"}</span>`;
}

// Chamado depende de uma ação do fornecedor agora?
function minhaVez(c) { return !!ACOES_POR_STATUS[c.status]; }

// ============================================================
// Quadro kanban (gestão à vista). Uma coluna por etapa do fluxo;
// quando o fornecedor conclui a etapa, o card muda de coluna sozinho
// (o Firestore atualiza o status e o quadro é redesenhado).
// ============================================================
const COLUNAS_KANBAN = [
  { id: "programar",  n: 1, titulo: "A programar",           sub: "Definir data do atendimento", cor: "amber", status: ["fornecedor_acionado"], ordenar: porRegistro },
  { id: "iniciar",    n: 2, titulo: "Programados",           sub: "Iniciar avaliação técnica",   cor: "blue",  status: ["atendimento_programado"], ordenar: (a, b) => new Date(a.dataAtendimentoPrevista || 0) - new Date(b.dataAtendimentoPrevista || 0) },
  { id: "avaliacao",  n: 3, titulo: "Em avaliação",          sub: "Registrar diagnóstico",       cor: "blue",  status: ["em_avaliacao_tecnica"], ordenar: porRegistro },
  { id: "manutencao", n: 4, titulo: "Aguardando Manutenção", sub: "Validação de mau uso",        cor: "muted", status: ["aguardando_validacao"], ordenar: porRegistro },
  { id: "contestado", n: 5, titulo: "Contestados",           sub: "Novo diagnóstico necessário", cor: "red",   status: ["diagnostico_contestado"], ordenar: porRegistro },
  { id: "aprovacao",  n: 6, titulo: "Aprovação / Autorização", sub: "Aprovador e Gestão de Frota", cor: "muted", status: ["aguardando_aprovacao", "aguardando_autorizacao"], ordenar: porRegistro },
  { id: "execucao",   n: 7, titulo: "Execução",              sub: "Executar e liberar a máquina", cor: "green", status: ["em_teste"], ordenar: porRegistro },
  { id: "documentos", n: 8, titulo: "Documentação",          sub: "Ordem de compra e NF",        cor: "amber", status: ["liberado", "aguardando_ordem_compra", "aguardando_nf"], ordenar: (a, b) => (tsToMs(a.liberadoEm) || 0) - (tsToMs(b.liberadoEm) || 0) }
];
function porRegistro(a, b) { return (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0); }

let filtroKanban = "todos";   // todos | minha_vez | mau_uso
let buscaKanban = "";
let historicoAberto = false;

function setFiltroKanban(f) { filtroKanban = f; renderFila(); }
function setBuscaKanban(v) { buscaKanban = v.trim().toLowerCase(); renderFila(); document.getElementById("kb-busca").focus(); }
function alternarHistorico() { historicoAberto = !historicoAberto; renderFila(); }

// Há quanto tempo o chamado está na etapa atual (último evento do histórico)
function tempoNaEtapa(c) {
  const hist = c.historico || [];
  const ult = hist.length ? Math.max(...hist.map((h) => h.timestamp || 0)) : (tsToMs(c.registradoEm) || 0);
  if (!ult) return "";
  const min = Math.max(0, Math.round((Date.now() - ult) / 60000));
  if (min < 60) return `${min} min`;
  if (min < 1440) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}
function tagAguardando(c) {
  const quem = { aguardando_validacao: "Manutenção Magius", aguardando_aprovacao: "Aprovador", aguardando_autorizacao: "Gestão de Frota", aguardando_ordem_compra: "Gestão de Frota (OC)", liberado: "Gestão de Frota (OC)" }[c.status];
  return quem ? `<div class="kcard__espera">${icone("relogio", 12)} Aguardando ${quem}</div>` : "";
}

function cardChamado(c, opts = {}) {
  const acaoFn = ACOES_POR_STATUS[c.status];
  const acao = acaoFn ? acaoFn(c) : "";
  const tempo = opts.historico ? "" : tempoNaEtapa(c);
  return `
    <div class="kcard ${acao ? "kcard--acao" : ""}">
      <div class="kcard__top">
        <a class="kcard__num" href="chamado.html?id=${c.id}">${escapeHtml(c.numeroFrota || "—")}</a>
        ${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : ""}
      </div>
      <div class="kcard__id">${escapeHtml(c.numero || "")}${tempo ? ` · <span title="Tempo na etapa atual">${tempo} na etapa</span>` : ""}</div>
      ${seloMauUso(c)}
      <div class="kcard__desc">${escapeHtml((c.descricao || "").slice(0, 70))}</div>
      <div class="kcard__local">${escapeHtml(c.plantaNome || "")}${c.setorNome ? " / " + escapeHtml(c.setorNome) : ""}</div>
      ${cardDataAgendada(c)}
      ${tagAguardando(c)}
      <div class="kcard__acoes">${acao}<a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Detalhes</a></div>
    </div>`;
}

function passaFiltro(c) {
  if (filtroKanban === "minha_vez" && !minhaVez(c)) return false;
  if (filtroKanban === "mau_uso" && c.fluxo !== "mau_uso") return false;
  if (buscaKanban && !`${c.numeroFrota || ""} ${c.numero || ""}`.toLowerCase().includes(buscaKanban)) return false;
  return true;
}

function renderFila() {
  const wrap = document.getElementById("paineis-fornecedor");
  const qtdMinha = ativosCache.filter(minhaVez).length;
  const qtdMau = ativosCache.filter((c) => c.fluxo === "mau_uso").length;
  const btn = (id, txt, n) => `<button class="kb-filtro ${filtroKanban === id ? "kb-filtro--on" : ""}" onclick="setFiltroKanban('${id}')">${txt} <b>${n}</b></button>`;

  const colunas = COLUNAS_KANBAN.map((col) => {
    const todos = ativosCache.filter((c) => col.status.includes(c.status));
    const lista = todos.filter(passaFiltro).sort(col.ordenar);
    const nMinha = todos.filter(minhaVez).length;
    return `
      <section class="kcol kcol--${col.cor} ${todos.length === 0 ? "kcol--vazia" : ""}">
        <header class="kcol__head">
          <div class="kcol__n">${col.n}</div>
          <div class="kcol__tit"><div class="kcol__nome">${col.titulo}</div><div class="kcol__sub">${col.sub}</div></div>
          <div class="kcol__cont ${nMinha > 0 ? "kcol__cont--acao" : ""}">${todos.length}</div>
        </header>
        ${nMinha > 0 ? `<div class="kcol__faixa">${nMinha} para você agir</div>` : ""}
        <div class="kcol__corpo">${lista.length ? lista.map((c) => cardChamado(c)).join("") : `<div class="kcol__vazio">—</div>`}</div>
      </section>`;
  }).join("");

  const hist = historicoCache.filter(passaFiltro).slice(0, 50);
  wrap.innerHTML = `
    <div class="kb-barra">
      <div class="kb-filtros">
        ${btn("todos", "Todos", ativosCache.length)}
        ${btn("minha_vez", "Sua vez", qtdMinha)}
        ${btn("mau_uso", "Mau uso", qtdMau)}
      </div>
      <input id="kb-busca" class="kb-busca" type="search" placeholder="Buscar nº da frota ou chamado" value="${escapeHtml(buscaKanban)}" oninput="setBuscaKanban(this.value)" />
    </div>
    <div class="kanban">${colunas}</div>
    <div class="kb-hist">
      <button class="kb-hist__toggle" onclick="alternarHistorico()">${icone("checkCirculo", 16)} Histórico de encerrados <b>${historicoCache.length}</b> <span class="kb-hist__seta ${historicoAberto ? "kb-hist__seta--on" : ""}">${icone("seta", 14)}</span></button>
      ${historicoAberto ? `<div class="kb-hist__lista">${hist.length ? hist.map((c) => cardChamado(c, { historico: true })).join("") : `<div class="kcol__vazio">Nenhum chamado concluído.</div>`}</div>` : ""}
    </div>`;
}

function renderHistorico() { /* histórico agora é um dos painéis acima */ }

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
// Regra do fluxo: se for mau uso, o valor é obrigatório (anexo é opcional).
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

  const btn = document.getElementById("btn-diagnostico");
  btn.disabled = true;
  btn.textContent = "Enviando…";

  let urls = [];
  if (arquivos.length > 0) {
    try {
      urls = await enviarArquivos(`chamados/${id}/diagnostico`, arquivos, btn, "Enviar diagnóstico");
    } catch (err) {
      // Anexo agora é opcional mesmo em caso de mau uso: se o envio falhar,
      // apenas avisa e segue o diagnóstico sem a evidência.
      console.warn("Não foi possível anexar arquivos do diagnóstico:", err);
      alert("O diagnóstico será enviado, mas não foi possível anexar os arquivos: " + err.message);
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
        orcamentoUrl = await enviarArquivo(`chamados/${id}/orcamento-final/${Date.now()}-${arquivoOrcamento.name}`, arquivoOrcamento);
      } catch (err) {
        alert("Não foi possível anexar o orçamento: " + err.message + "\n\nA liberação não foi registrada. Tente novamente.");
        btn.disabled = false;
        return;
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
    notaFiscalUrl = await enviarArquivo(`chamados/${id}/nota-fiscal/${Date.now()}-${arquivo.name}`, arquivo, (pct) => { btn.textContent = `Enviando… ${pct}%`; });
  } catch (err) {
    alert("Não foi possível anexar a nota fiscal: " + err.message);
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
