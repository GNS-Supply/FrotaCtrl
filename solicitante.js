// ============================================================
// solicitante.js
// ============================================================

let usuarioAtual = null;
let equipamentosCache = [];
let chamadosCache = [];

(async function init() {
  usuarioAtual = await requireAuth("solicitante");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-empresa").textContent = usuarioAtual.empresa || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  popularSelects();
  escutarEquipamentos();
  escutarChamados();
  configurarNav();
  configurarOverlay();
  adicionarAtalhoMaster(usuarioAtual);
  montarFiltroStatus("filtro-status-solicitante", (chave) => { filtroAtualSolicitante = chave; renderChamados(); });
})();

function popularSelects() {
  document.getElementById("ch-categoria").innerHTML = CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("ch-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, "P2");
  aplicarMascaraFracionado(document.getElementById("ch-horimetro"));
}

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["meus", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
      document.getElementById("fab-wrap").style.display = view === "perfil" ? "none" : "block";
    });
  });
}

function configurarOverlay() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("btn-fab-chamado").addEventListener("click", () => abrirFechar("overlay-chamado", true));
  document.getElementById("ch-equipamento").addEventListener("change", atualizarInfoEquipamento);
  document.getElementById("form-chamado").addEventListener("submit", salvarChamado);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function escutarEquipamentos() {
  db.collection("equipamentos").orderBy("numeroFrota").onSnapshot((snap) => {
    equipamentosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const select = document.getElementById("ch-equipamento");
    const selecionadoAnterior = select.value;
    select.innerHTML = equipamentosCache
      .map((e) => `<option value="${e.id}">${escapeHtml(e.numeroFrota)} — ${escapeHtml(e.tipoModelo)}</option>`)
      .join("");
    // preserva a seleção do usuário se o equipamento ainda existir na lista atualizada
    if (equipamentosCache.some((e) => e.id === selecionadoAnterior)) {
      select.value = selecionadoAnterior;
    }
    atualizarInfoEquipamento();
  });
}

function atualizarInfoEquipamento() {
  const id = document.getElementById("ch-equipamento").value;
  const eq = equipamentosCache.find((e) => e.id === id);
  const info = document.getElementById("ch-equip-info");
  if (!eq) {
    info.textContent = equipamentosCache.length === 0 ? "Nenhum equipamento cadastrado ainda — peça para a Gestão de Frota cadastrar." : "Selecione um equipamento.";
    return;
  }
  definirValorFracionado(document.getElementById("ch-horimetro"), eq.horimetroAtual ?? 0);
  info.innerHTML = `<strong>${escapeHtml(eq.plantaNome || "—")}</strong> / ${escapeHtml(eq.setorNome || "—")} · ${STATUS_OPERACIONAL_LABELS[eq.statusOperacional] || ""} ${eq.criticidade ? `· <span class="chip chip--${eq.criticidade}">${eq.criticidade}</span>` : ""}`;
}

function escutarChamados() {
  db.collection("chamados").where("solicitanteId", "==", usuarioAtual.uid).onSnapshot((snap) => {
    chamadosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    chamadosCache.sort((a, b) => (tsToMs(b.registradoEm) || 0) - (tsToMs(a.registradoEm) || 0));
    renderChamados();
    renderStats();
  });
}

let filtroAtualSolicitante = "todos";

function renderStats() {
  const abertos = chamadosCache.filter((c) => STATUS_ATIVOS.includes(c.status)).length;
  const concluidos = chamadosCache.filter((c) => c.status === "concluido").length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${abertos}</div><div class="stat-card__label">Em aberto</div></div>
    <div class="stat-card"><div class="stat-card__value">${concluidos}</div><div class="stat-card__label">Concluídos</div></div>
  `;
}

function renderChamados() {
  const el = document.getElementById("lista-chamados");
  const lista = aplicarFiltroStatus(chamadosCache, filtroAtualSolicitante);
  if (lista.length === 0) {
    el.innerHTML = chamadosCache.length === 0
      ? `<div class="empty"><div class="empty__icon">📋</div><div class="empty__title">Nenhum chamado ainda</div><div class="empty__text">Toque no + para abrir seu primeiro chamado.</div></div>`
      : `<div class="empty"><div class="empty__text">Nenhum chamado nesse filtro.</div></div>`;
    return;
  }
  el.innerHTML = lista
    .map(
      (c) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero || "")} — ${escapeHtml(c.numeroFrota || "")}</div>
        ${badgeHtml(c.status)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 70))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.categoria || "")}</span><span>Aberto em ${formatarData(c.registradoEm)}</span></div>
      ${stepperHtml(c.status)}
      ${STATUS_ATIVOS.includes(c.status) ? `<div style="margin-top:4px;">${responsavelAtualHtml(c.status)}</div>` : ""}
    </a>`
    )
    .join("");
}

async function salvarChamado(e) {
  e.preventDefault();
  const equipamentoId = document.getElementById("ch-equipamento").value;
  const eq = equipamentosCache.find((x) => x.id === equipamentoId);
  if (!eq) { alert("Selecione um equipamento."); return; }
  const btn = document.getElementById("btn-enviar-chamado");
  btn.disabled = true;
  btn.textContent = "Verificando…";

  // Não permite abrir um segundo chamado pra mesma máquina se já existe um em andamento
  const chamadoAtivo = await equipamentoTemChamadoAtivo(equipamentoId);
  if (chamadoAtivo) {
    alert(`Esta máquina já tem o chamado ${chamadoAtivo.numero || ""} em andamento (status: ${STATUS_LABELS[chamadoAtivo.status] || chamadoAtivo.status}). Aguarde ele ser concluído antes de abrir um novo.`);
    btn.disabled = false;
    btn.textContent = "Enviar chamado";
    return;
  }

  btn.textContent = "Enviando…";
  const horimetro = valorFracionadoParaNumero(document.getElementById("ch-horimetro"));
  let docRef, numeroCriado;
  try {
    const numero = await proximoNumeroChamado();
    numeroCriado = numero;
    docRef = await db.collection("chamados").add({
      numero,
      equipamentoId,
      numeroFrota: eq.numeroFrota,
      tipoModeloEquip: eq.tipoModelo,
      plantaNome: eq.plantaNome || "",
      setorNome: eq.setorNome || "",
      solicitanteId: usuarioAtual.uid,
      solicitanteNome: usuarioAtual.nome,
      turno: document.getElementById("ch-turno").value,
      categoria: document.getElementById("ch-categoria").value,
      criticidade: document.getElementById("ch-criticidade").value,
      descricao: document.getElementById("ch-problema").value.trim(),
      impactoSeguranca: document.getElementById("ch-impacto").value.trim(),
      horimetro,
      fotos: [],
      status: "registrado",
      fluxo: null,
      registradoEm: firebase.firestore.FieldValue.serverTimestamp(),
      historico: [
        { status: "registrado", timestamp: Date.now(), obs: "Chamado registrado pelo solicitante", autor: usuarioAtual.nome, perfil: "Solicitante" }
      ]
    });
  } catch (err) {
    // Isso aqui é a parte crítica — se falhar, o chamado de fato não existe.
    alert("Erro ao abrir chamado: " + err.message);
    btn.disabled = false;
    btn.textContent = "Enviar chamado";
    return;
  }

  // Daqui pra baixo o chamado JÁ FOI CRIADO. Qualquer falha nessas etapas
  // secundárias não deve assustar o usuário nem fazer parecer que precisa
  // tentar de novo (isso é o que causava chamados duplicados).
  try {
    await db.collection("equipamentos").doc(equipamentoId).update({ horimetroAtual: horimetro });
  } catch (err) {
    console.warn("Não foi possível atualizar o horímetro do equipamento:", err);
  }

  try {
    const arquivos = document.getElementById("ch-fotos").files;
    if (arquivos.length > 0) {
      const urls = [];
      for (const file of arquivos) {
        const ref = storage.ref(`chamados/${docRef.id}/fotos/${Date.now()}-${file.name}`);
        await ref.put(file);
        urls.push(await ref.getDownloadURL());
      }
      await docRef.update({ fotos: urls });
    }
  } catch (err) {
    console.warn("Não foi possível anexar as fotos:", err);
    alert("O chamado foi aberto, mas houve um problema ao anexar as fotos. Você pode tentar anexá-las novamente pelo detalhe do chamado.");
  }

  e.target.reset();
  abrirFechar("overlay-chamado", false);
  sessionStorage.setItem("toastPendente", `Chamado ${numeroCriado} criado com sucesso!`);
  window.location.href = `chamado.html?id=${docRef.id}`;
}
