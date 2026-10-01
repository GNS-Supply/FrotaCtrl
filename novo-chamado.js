// ============================================================
// novo-chamado.js — formulário "Abrir chamado" compartilhado
// Usado pelo Solicitante e pela Gestão de Frota. Todos os campos
// (inclusive o anexo) são obrigatórios.
//
// Diferença por perfil:
//  - Solicitante: o chamado nasce "registrado" e aguarda a triagem.
//  - Gestão de Frota: ela mesma faz a triagem, então a etapa é
//    considerada concluída e o chamado já nasce "em_triagem",
//    pronto para acionar o fornecedor.
// ============================================================

const NovoChamado = (() => {
  let usuario = null;
  let equipamentos = [];
  let montado = false;
  let unsub = null;

  const HTML = `
<div class="overlay hidden" id="overlay-chamado">
  <div class="sheet">
    <div class="sheet__handle"></div>
    <div class="sheet__header"><h3>Abrir chamado</h3><button type="button" class="close-x" id="nc-fechar" aria-label="Fechar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="callout" id="nc-aviso-gestao" style="display:none;">Como o chamado está sendo aberto pela Gestão de Frota, a triagem é considerada concluída — ele já segue direto para o acionamento do fornecedor.</div>
    <p class="form-legenda">Campos marcados com <span class="req-ast">*</span> são obrigatórios.</p>
    <form id="form-chamado" novalidate>
      <div class="field"><label>Equipamento (planta → setor → frota)</label>
        <select id="ch-equipamento" required></select>
      </div>
      <div class="callout" id="ch-equip-info">Selecione um equipamento para ver planta e setor.</div>
      <div class="grid-2">
        <div class="field" style="margin-top:0;"><label>Turno</label>
          <select id="ch-turno" required><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select>
        </div>
        <div class="field" style="margin-top:0;"><label>Horímetro atual</label><input type="text" id="ch-horimetro" required inputmode="numeric" placeholder="0,00" /></div>
      </div>
      <div class="grid-2">
        <div class="field"><label>Categoria da ocorrência</label><select id="ch-categoria" required></select></div>
        <div class="field"><label>Criticidade</label><select id="ch-criticidade" required></select></div>
      </div>
      <div class="field"><label>Descrição da ocorrência</label><textarea id="ch-problema" required placeholder="Descreva sintoma, contexto e impacto"></textarea></div>
      <div class="field"><label>Impacto e segurança</label><textarea id="ch-impacto" required placeholder="Parado? Risco? Pode operar?"></textarea></div>
      <div class="field"><label>Anexos (fotos, vídeos, PDF, Word, Excel ou texto) — pode anexar vários</label><input type="file" id="ch-fotos" required accept="${ACCEPT_ANEXOS}" multiple /></div>
      <div class="error-msg" id="nc-erro"></div>
      <button type="submit" class="btn btn--primary" id="btn-enviar-chamado" style="margin-top:20px;">Enviar chamado</button>
    </form>
  </div>
</div>`;

  function montar() {
    if (montado) return;
    document.body.insertAdjacentHTML("beforeend", HTML);
    montado = true;
    document.getElementById("ch-categoria").innerHTML = CATEGORIAS.map((c) => `<option value="${c}">${c}</option>`).join("");
    document.getElementById("ch-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, "P2");
    aplicarMascaraFracionado(document.getElementById("ch-horimetro"));

    const overlay = document.getElementById("overlay-chamado");
    document.getElementById("nc-fechar").addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) fechar(); });
    document.getElementById("ch-equipamento").addEventListener("change", atualizarInfoEquipamento);
    document.getElementById("form-chamado").addEventListener("submit", salvar);

    unsub = db.collection("equipamentos").orderBy("numeroFrota").onSnapshot((snap) => {
      equipamentos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const select = document.getElementById("ch-equipamento");
      const anterior = select.value;
      select.innerHTML = equipamentos.length
        ? equipamentos.map((e) => `<option value="${e.id}">${escapeHtml(e.numeroFrota)} — ${escapeHtml(e.tipoModelo)}</option>`).join("")
        : `<option value="">Nenhum equipamento cadastrado</option>`;
      if (equipamentos.some((e) => e.id === anterior)) select.value = anterior;
      atualizarInfoEquipamento();
    });
  }

  function fechar() { document.getElementById("overlay-chamado").classList.add("hidden"); }

  function abrir(usuarioLogado) {
    usuario = usuarioLogado;
    montar();
    document.getElementById("nc-aviso-gestao").style.display = usuario.tipo === "gestao_frota" ? "block" : "none";
    document.getElementById("nc-erro").classList.remove("show");
    atualizarInfoEquipamento();
    marcarObrigatorios(document.getElementById("overlay-chamado"));
    document.getElementById("overlay-chamado").classList.remove("hidden");
  }

  function atualizarInfoEquipamento() {
    const id = document.getElementById("ch-equipamento").value;
    const eq = equipamentos.find((e) => e.id === id);
    const info = document.getElementById("ch-equip-info");
    if (!eq) {
      info.textContent = equipamentos.length === 0 ? "Nenhum equipamento cadastrado ainda — peça para a Gestão de Frota cadastrar." : "Selecione um equipamento.";
      return;
    }
    definirValorFracionado(document.getElementById("ch-horimetro"), eq.horimetroAtual ?? 0);
    info.innerHTML = `<strong>${escapeHtml(eq.plantaNome || "—")}</strong> / ${escapeHtml(eq.setorNome || "—")} · ${STATUS_OPERACIONAL_LABELS[eq.statusOperacional] || ""}${eq.numeroSerie ? ` · Nº de série: <strong>${escapeHtml(eq.numeroSerie)}</strong>` : ""}`;
  }

  function erro(msg) {
    const el = document.getElementById("nc-erro");
    el.textContent = msg;
    el.classList.add("show");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function salvar(e) {
    e.preventDefault();
    document.getElementById("nc-erro").classList.remove("show");

    // Todos os campos são obrigatórios
    const equipamentoId = document.getElementById("ch-equipamento").value;
    const eq = equipamentos.find((x) => x.id === equipamentoId);
    const turno = document.getElementById("ch-turno").value;
    const categoria = document.getElementById("ch-categoria").value;
    const criticidade = document.getElementById("ch-criticidade").value;
    const descricao = document.getElementById("ch-problema").value.trim();
    const impacto = document.getElementById("ch-impacto").value.trim();
    const horimetroTxt = document.getElementById("ch-horimetro").value.trim();
    const arquivos = document.getElementById("ch-fotos").files;

    const faltando = [];
    if (!eq) faltando.push("Equipamento");
    if (!turno) faltando.push("Turno");
    if (!horimetroTxt) faltando.push("Horímetro atual");
    if (!categoria) faltando.push("Categoria da ocorrência");
    if (!criticidade) faltando.push("Criticidade");
    if (!descricao) faltando.push("Descrição da ocorrência");
    if (!impacto) faltando.push("Impacto e segurança");
    if (!arquivos || arquivos.length === 0) faltando.push("Anexo (pelo menos um arquivo)");
    if (faltando.length) { erro("Preencha os campos obrigatórios: " + faltando.join(", ") + "."); return; }

    const btn = document.getElementById("btn-enviar-chamado");
    btn.disabled = true;
    btn.textContent = "Verificando…";
    const restaurar = () => { btn.disabled = false; btn.textContent = "Enviar chamado"; };

    try {
      // Não permite abrir um segundo chamado pra mesma máquina se já existe um em andamento
      const chamadoAtivo = await equipamentoTemChamadoAtivo(equipamentoId);
      if (chamadoAtivo) {
        erro(`Esta máquina já tem o chamado ${chamadoAtivo.numero || ""} em andamento (status: ${STATUS_LABELS[chamadoAtivo.status] || chamadoAtivo.status}). Aguarde ele ser concluído antes de abrir um novo.`);
        restaurar();
        return;
      }

      // Anexos primeiro: como são obrigatórios, não criamos o chamado se o envio falhar
      let anexos;
      try {
        anexos = await enviarArquivos(`chamados/novo-${usuario.uid}`, arquivos, btn, "Enviar chamado");
      } catch (err) {
        erro("Não foi possível enviar os anexos: " + err.message + " Nenhum chamado foi criado — tente novamente.");
        restaurar();
        return;
      }

      btn.textContent = "Enviando…";
      const horimetro = valorFracionadoParaNumero(document.getElementById("ch-horimetro"));
      const gestao = usuario.tipo === "gestao_frota";
      const agora = Date.now();
      const historico = [{
        status: "registrado", timestamp: agora,
        obs: gestao ? "Chamado registrado pela Gestão de Frota" : "Chamado registrado pelo solicitante",
        autor: usuario.nome, perfil: gestao ? "Gestão de Frota" : "Solicitante"
      }];
      if (gestao) {
        historico.push({
          status: "em_triagem", timestamp: agora + 1,
          obs: "Triagem dispensada — chamado aberto pela própria Gestão de Frota",
          autor: usuario.nome, perfil: "Gestão de Frota",
          dados: { tipo: "triagem", criticidadeAnterior: criticidade, criticidadeNova: criticidade, descricaoRevisada: descricao }
        });
      }

      const numero = await proximoNumeroChamado();
      const docRef = await db.collection("chamados").add({
        numero,
        equipamentoId,
        numeroFrota: eq.numeroFrota,
        tipoModeloEquip: eq.tipoModelo,
        numeroSerie: eq.numeroSerie || "",
        plantaNome: eq.plantaNome || "",
        setorNome: eq.setorNome || "",
        solicitanteId: usuario.uid,
        solicitanteNome: usuario.nome,
        turno, categoria, criticidade,
        descricao,
        impactoSeguranca: impacto,
        horimetro,
        fotos: anexos,
        status: gestao ? "em_triagem" : "registrado",
        fluxo: null,
        registradoEm: firebase.firestore.FieldValue.serverTimestamp(),
        historico
      });

      try {
        await db.collection("equipamentos").doc(equipamentoId).update({ horimetroAtual: horimetro });
      } catch (err) {
        console.warn("Não foi possível atualizar o horímetro do equipamento:", err);
      }

      e.target.reset();
      fechar();
      sessionStorage.setItem("toastPendente", `Chamado ${numero} criado com sucesso!`);
      window.location.href = `chamado.html?id=${docRef.id}`;
    } catch (err) {
      erro("Erro ao abrir chamado: " + err.message);
      restaurar();
    }
  }

  return { abrir };
})();

function abrirNovoChamado(usuario) { NovoChamado.abrir(usuario); }
