// ============================================================
// chamado.js — detalhe de um chamado (todos os perfis)
// ============================================================

let usuarioAtual = null;
let chamadoId = null;

(async function init() {
  usuarioAtual = await requireAuth();
  popularTopbarMeta(usuarioAtual);

  const params = new URLSearchParams(window.location.search);
  chamadoId = params.get("id");
  if (!chamadoId) { voltar(); return; }

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  db.collection("chamados").doc(chamadoId).onSnapshot((doc) => {
    if (!doc.exists) return;
    render({ id: doc.id, ...doc.data() });
  });
})();

function voltar() {
  window.location.href = PERFIL_HOME[usuarioAtual?.tipo] || "index.html";
}

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
