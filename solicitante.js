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
})();

function popularSelects() {
  document.getElementById("ch-categoria").innerHTML = CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("");
  document.getElementById("ch-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, "P2");
  aplicarMascaraFracionado(document.getElementById("ch-horimetro"));
}

function configurarNav() {
  document.querySelectorAll(".navitem").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem").forEach((b) => b.classList.remove("active"));
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
  if (chamadosCache.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty__icon">📋</div><div class="empty__title">Nenhum chamado ainda</div><div class="empty__text">Toque no + para abrir seu primeiro chamado.</div></div>`;
    return;
  }
  el.innerHTML = chamadosCache
    .map(
      (c) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero || "")} — ${escapeHtml(c.numeroFrota || "")}</div>
        ${badgeHtml(c.status)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 70))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.categoria || "")}</span><span>Aberto em ${formatarData(c.registradoEm)}</span></div>
      ${STATUS_ATIVOS.includes(c.status) ? `<div style="margin-top:8px;">${responsavelAtualHtml(c.status)}</div>` : ""}
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
  btn.textContent = "Enviando…";
  try {
    const numero = await proximoNumeroChamado();
    const horimetro = valorFracionadoParaNumero(document.getElementById("ch-horimetro"));
    const docRef = await db.collection("chamados").add({
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

    await db.collection("equipamentos").doc(equipamentoId).update({ horimetroAtual: horimetro });

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

    e.target.reset();
    abrirFechar("overlay-chamado", false);
    window.location.href = `chamado.html?id=${docRef.id}`;
  } catch (err) {
    alert("Erro ao abrir chamado: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar chamado";
  }
}
