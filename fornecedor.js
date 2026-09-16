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
  const naoProgramados = ativosCache.filter((c) => c.status === "fornecedor_acionado").length;
  const emExecucao = ativosCache.filter((c) => ["em_teste", "liberado", "aguardando_ordem_compra", "aguardando_nf"].includes(c.status)).length;
  const aguardandoTerceiros = ativosCache.filter((c) => ["aguardando_validacao", "aguardando_aprovacao", "aguardando_autorizacao"].includes(c.status)).length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${naoProgramados}</div><div class="stat-card__label">Novos a programar</div></div>
    <div class="stat-card"><div class="stat-card__value">${ativosCache.length}</div><div class="stat-card__label">Ativos no total</div></div>
    <div class="stat-card"><div class="stat-card__value">${aguardandoTerceiros}</div><div class="stat-card__label">Aguardando terceiros</div></div>
    <div class="stat-card"><div class="stat-card__value">${emExecucao}</div><div class="stat-card__label">Em execução / encerrando</div></div>
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

// ============================================================
// Painéis: cada um mostra só os chamados daquele estágio, na
// ordem que faz sentido pra quem trabalha naquele estágio.
// ============================================================
const PAINEIS_FORNECEDOR = [
  {
    id: "novos",
    titulo: "Novos — a programar",
    descricao: "Chamados que você recebeu e ainda não têm data de atendimento.",
    cor: "amber",
    icone: "alerta",
    status: ["fornecedor_acionado"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nenhum chamado novo aguardando programação."
  },
  {
    id: "programados",
    titulo: "Programados — aguardando início",
    descricao: "Atendimentos agendados, em ordem de data.",
    cor: "blue",
    icone: "calendario",
    status: ["atendimento_programado"],
    // Ordem por data do atendimento (o mais próximo primeiro)
    ordenar: (a, b) => new Date(a.dataAtendimentoPrevista || 0) - new Date(b.dataAtendimentoPrevista || 0),
    vazio: "Nenhum atendimento programado."
  },
  {
    id: "avaliacao",
    titulo: "Em avaliação técnica",
    descricao: "Você já iniciou a avaliação — o tempo de manutenção está contando.",
    cor: "blue",
    icone: "lupa",
    status: ["em_avaliacao_tecnica"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nenhuma avaliação em andamento."
  },
  {
    id: "aguardando-manutencao",
    titulo: "Diagnóstico enviado — aguardando Manutenção",
    descricao: "Você já deu o diagnóstico; aguardando resposta da Manutenção Magius.",
    cor: "muted",
    icone: "escudo",
    status: ["aguardando_validacao"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nada aguardando a Manutenção."
  },
  {
    id: "contestados",
    titulo: "Contestados — precisam da sua resposta",
    descricao: "A Manutenção não confirmou o mau uso (ou foi inconclusivo). Registre um novo diagnóstico.",
    cor: "red",
    icone: "alerta",
    status: ["diagnostico_contestado"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nenhum diagnóstico contestado."
  },
  {
    id: "aprovados",
    titulo: "Aprovados — aguardando autorização",
    descricao: "Mau uso confirmado e com ciência do aprovador; aguardando a Gestão de Frota liberar a execução.",
    cor: "amber",
    icone: "aprovacao",
    status: ["aguardando_aprovacao", "aguardando_autorizacao"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nenhum chamado aguardando autorização."
  },
  {
    id: "executando",
    titulo: "Liberados para execução",
    descricao: "Autorizados — você já pode executar o serviço na máquina.",
    cor: "green",
    icone: "chave",
    status: ["em_teste"],
    ordenar: (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0),
    vazio: "Nenhum serviço em execução."
  },
  {
    id: "documentacao",
    titulo: "Executados — aguardando documentação",
    descricao: "Máquina já liberada; falta concluir a papelada (ordem de compra e NF).",
    cor: "amber",
    icone: "clip",
    status: ["liberado", "aguardando_ordem_compra", "aguardando_nf"],
    ordenar: (a, b) => (tsToMs(a.liberadoEm) || 0) - (tsToMs(b.liberadoEm) || 0),
    vazio: "Nenhuma documentação pendente."
  },
  {
    id: "historico",
    titulo: "Histórico — concluídos",
    descricao: "Chamados já finalizados.",
    cor: "muted",
    icone: "checkCirculo",
    historico: true,
    ordenar: (a, b) => (tsToMs(b.concluidoEm) || 0) - (tsToMs(a.concluidoEm) || 0),
    vazio: "Nenhum chamado concluído ainda."
  }
];

// Painéis começam abertos, menos o histórico (que tende a crescer muito)
const painelAberto = {};
PAINEIS_FORNECEDOR.forEach((p) => { painelAberto[p.id] = p.id !== "historico"; });

function alternarPainel(id) {
  painelAberto[id] = !painelAberto[id];
  renderFila();
}

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

function cardChamado(c) {
  const acaoFn = ACOES_POR_STATUS[c.status];
  const acao = acaoFn ? acaoFn(c) : "";
  return `
    <div class="ticket-card">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>
        ${badgeHtml(c.status)}
      </div>
      <div class="pill-group" style="margin:6px 0;">
        ${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : ""}
        ${seloMauUso(c)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 90))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")}</span></div>
      ${cardDataAgendada(c)}
      ${stepperHtml(c.status)}
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver detalhes</a>${acao}</div>
    </div>`;
}

function renderFila() {
  const wrap = document.getElementById("paineis-fornecedor");
  wrap.innerHTML = PAINEIS_FORNECEDOR.map((p) => {
    const base = p.historico ? historicoCache : ativosCache;
    const lista = (p.historico ? base : base.filter((c) => p.status.includes(c.status))).slice().sort(p.ordenar);
    const aberto = painelAberto[p.id];
    return `
      <section class="painel ${aberto ? "painel--aberto" : ""}">
        <button class="painel__head" onclick="alternarPainel('${p.id}')">
          <span class="icon-tile icon-tile--${p.cor} icon-tile--sm">${icone(p.icone, 16)}</span>
          <span class="painel__titulo">
            <span class="painel__nome">${p.titulo}</span>
            <span class="painel__desc">${p.descricao}</span>
          </span>
          <span class="painel__contador ${lista.length > 0 ? "painel__contador--ativo" : ""}">${lista.length}</span>
          <span class="painel__seta">${icone("seta", 16)}</span>
        </button>
        ${aberto ? `<div class="painel__corpo">${
          lista.length === 0
            ? `<div class="empty"><div class="empty__text">${p.vazio}</div></div>`
            : `<div class="card-list">${lista.map(cardChamado).join("")}</div>`
        }</div>` : ""}
      </section>`;
  }).join("");
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
      urls = await enviarArquivos(`chamados/${id}/diagnostico`, arquivos, btn, "Enviar diagnóstico");
    } catch (err) {
      // Em caso de mau uso o anexo é obrigatório: se o envio falhar, o
      // diagnóstico NÃO pode seguir sem a evidência — mostra o erro e deixa
      // o usuário tentar de novo, em vez de avançar pela metade.
      if (mauUso) {
        alert("Não foi possível anexar as evidências: " + err.message + "\n\nO diagnóstico não foi enviado. Tente novamente.");
        btn.disabled = false;
        btn.textContent = "Enviar diagnóstico";
        return;
      }
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
