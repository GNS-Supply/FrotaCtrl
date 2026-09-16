// ============================================================
// gestao-frota.js
// ============================================================

let usuarioAtual = null;
let chamadosCache = [];
let equipamentosCache = [];
let plantasCache = [];
let setoresCache = [];
let fornecedoresCache = [];
let parametrosRecorrencia = { atencaoQtd: 2, atencaoDias: 90, altaQtd: 3, altaDias: 90 };

(async function init() {
  usuarioAtual = await requireAuth("gestao_frota");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";

  parametrosRecorrencia = await obterParametrosRecorrencia();

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  popularSelectsEstaticos();
  await carregarFornecedores();
  escutarPlantasSetores();
  escutarEquipamentos();
  escutarChamados();
  escutarUsuarios();
  carregarParametrosForm();
  configurarNav();
  configurarSubTabsCadastros();
  configurarOverlays();
  configurarFormsCadastros();
  configurarFiltroChamados();
  aplicarMascaraTelefone(document.getElementById("nu-telefone"));
  adicionarAtalhoMaster(usuarioAtual);
})();

function popularSelectsEstaticos() {
  document.getElementById("eq-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, "P2");
  document.getElementById("eq-status").innerHTML = optionsHtml(STATUS_OPERACIONAL_LABELS, "operacional");
  aplicarMascaraMoeda(document.getElementById("eq-contrato"));
  aplicarMascaraFracionado(document.getElementById("eq-horimetro"));
}

async function carregarFornecedores() {
  const snap = await db.collection("usuarios").where("tipo", "==", "fornecedor").get();
  fornecedoresCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("ac-fornecedor").innerHTML =
    fornecedoresCache.length > 0
      ? fornecedoresCache.map((f) => `<option value="${f.id}">${escapeHtml(f.nome)}${f.empresa ? " — " + escapeHtml(f.empresa) : ""}</option>`).join("")
      : `<option value="">Nenhum fornecedor cadastrado</option>`;
}

function configurarNav() {
  document.querySelectorAll(".navitem[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem[data-view]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["fila", "equipamentos", "chamados", "cadastros", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}

function configurarOverlays() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => abrirFechar(btn.dataset.close, false)));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => { if (e.target === ov) abrirFechar(ov.id, false); }));
  document.getElementById("btn-novo-equip").addEventListener("click", () => abrirFormEquip(null));
  document.getElementById("form-acionar").addEventListener("submit", salvarAcionamento);
  document.getElementById("form-ordem-compra").addEventListener("submit", salvarOrdemCompra);
  document.getElementById("form-triagem").addEventListener("submit", salvarTriagem);
  document.getElementById("form-equip").addEventListener("submit", salvarEquipamento);
}
function abrirFechar(id, abrir) { document.getElementById(id).classList.toggle("hidden", !abrir); }

function configurarSubTabsCadastros() {
  document.querySelectorAll("#view-cadastros .tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#view-cadastros .tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sub = btn.dataset.sub;
      ["plantas", "setores", "parametros", "usuarios"].forEach((s) => (document.getElementById(`sub-${s}`).style.display = s === sub ? "block" : "none"));
    });
  });
}

function configurarFormsCadastros() {
  document.getElementById("form-planta").addEventListener("submit", salvarPlanta);
  document.getElementById("form-setor").addEventListener("submit", salvarSetor);
  document.getElementById("form-parametros").addEventListener("submit", salvarParametros);
  document.getElementById("form-novo-usuario").addEventListener("submit", cadastrarUsuario);
}

// ---------- Plantas / Setores (agora com editar/excluir — antes só listava) ----------
function escutarPlantasSetores() {
  db.collection("plantas").orderBy("nome").onSnapshot((snap) => {
    plantasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("eq-planta");
    sel.innerHTML = plantasCache.length
      ? plantasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("")
      : `<option value="">Cadastre em Cadastros → Plantas</option>`;
    atualizarSetoresSelect();
    renderPlantasAdmin();
    renderSetoresAdmin();

    const selSt = document.getElementById("st-planta");
    if (selSt) {
      selSt.innerHTML = plantasCache.length
        ? plantasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("")
        : `<option value="">Cadastre uma planta primeiro</option>`;
    }
  });
  db.collection("setores").orderBy("nome").onSnapshot((snap) => {
    setoresCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    atualizarSetoresSelect();
    renderSetoresAdmin();
  });
  document.getElementById("eq-planta").addEventListener("change", atualizarSetoresSelect);
}
function atualizarSetoresSelect() {
  const plantaId = document.getElementById("eq-planta").value;
  const doPlanta = setoresCache.filter((s) => s.plantaId === plantaId);
  document.getElementById("eq-setor").innerHTML = doPlanta.length
    ? doPlanta.map((s) => `<option value="${s.id}">${escapeHtml(s.nome)}</option>`).join("")
    : `<option value="">Sem setores nesta planta</option>`;
}

function renderPlantasAdmin() {
  const el = document.getElementById("lista-plantas-admin");
  if (!el) return;
  el.innerHTML = plantasCache.length
    ? plantasCache.map((p) => `
      <div class="list-row">
        <input type="text" value="${escapeHtml(p.nome)}" style="flex:1; margin-right:8px;" onchange="renomearPlanta('${p.id}', this.value)" />
        <button class="btn btn--secondary btn--sm" onclick="excluirPlanta('${p.id}', '${escapeHtml(p.nome).replace(/'/g, "\\'")}')">Excluir</button>
      </div>`).join("")
    : `<div class="empty"><div class="empty__text">Nenhuma planta cadastrada.</div></div>`;
}
async function salvarPlanta(e) {
  e.preventDefault();
  const nome = document.getElementById("pl-nome").value.trim();
  if (!nome) return;
  try {
    await db.collection("plantas").add({ nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    e.target.reset();
  } catch (err) {
    alert("Erro ao adicionar planta: " + err.message);
  }
}
async function renomearPlanta(id, novoNome) {
  novoNome = novoNome.trim();
  if (!novoNome) return;
  try {
    await db.collection("plantas").doc(id).update({ nome: novoNome });
    // mantém os equipamentos com o nome congelado atualizado também
    const eqs = equipamentosCache.filter((e) => e.plantaId === id);
    await Promise.all(eqs.map((e) => db.collection("equipamentos").doc(e.id).update({ plantaNome: novoNome })));
  } catch (err) {
    alert("Erro ao renomear planta: " + err.message);
  }
}
async function excluirPlanta(id, nome) {
  if (!confirm(`Excluir a planta "${nome}"? Setores vinculados a ela deixarão de aparecer no cadastro de equipamentos.`)) return;
  try {
    await db.collection("plantas").doc(id).delete();
  } catch (err) {
    alert("Erro ao excluir planta: " + err.message);
  }
}

function renderSetoresAdmin() {
  const el = document.getElementById("lista-setores-admin");
  if (!el) return;
  el.innerHTML = setoresCache.length
    ? setoresCache.map((s) => {
        const planta = plantasCache.find((p) => p.id === s.plantaId);
        return `
      <div class="list-row">
        <div style="flex:1;">
          <input type="text" value="${escapeHtml(s.nome)}" style="margin-bottom:4px;" onchange="renomearSetor('${s.id}', this.value)" />
          <div class="list-row__sub">${escapeHtml(planta ? planta.nome : "planta não encontrada")}</div>
        </div>
        <button class="btn btn--secondary btn--sm" onclick="excluirSetor('${s.id}', '${escapeHtml(s.nome).replace(/'/g, "\\'")}')">Excluir</button>
      </div>`;
      }).join("")
    : `<div class="empty"><div class="empty__text">Nenhum setor cadastrado.</div></div>`;
}
async function salvarSetor(e) {
  e.preventDefault();
  const plantaId = document.getElementById("st-planta").value;
  const nome = document.getElementById("st-nome").value.trim();
  if (!plantaId || !nome) return;
  try {
    await db.collection("setores").add({ plantaId, nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
    e.target.reset();
  } catch (err) {
    alert("Erro ao adicionar setor: " + err.message);
  }
}
async function renomearSetor(id, novoNome) {
  novoNome = novoNome.trim();
  if (!novoNome) return;
  try {
    await db.collection("setores").doc(id).update({ nome: novoNome });
    const eqs = equipamentosCache.filter((e) => e.setorId === id);
    await Promise.all(eqs.map((e) => db.collection("equipamentos").doc(e.id).update({ setorNome: novoNome })));
  } catch (err) {
    alert("Erro ao renomear setor: " + err.message);
  }
}
async function excluirSetor(id, nome) {
  if (!confirm(`Excluir o setor "${nome}"?`)) return;
  try {
    await db.collection("setores").doc(id).delete();
  } catch (err) {
    alert("Erro ao excluir setor: " + err.message);
  }
}

// ---------- Parâmetros de recorrência ----------
async function carregarParametrosForm() {
  const p = await obterParametrosRecorrencia();
  document.getElementById("pr-atencao-qtd").value = p.atencaoQtd;
  document.getElementById("pr-atencao-dias").value = p.atencaoDias;
  document.getElementById("pr-alta-qtd").value = p.altaQtd;
  document.getElementById("pr-alta-dias").value = p.altaDias;
}
async function salvarParametros(e) {
  e.preventDefault();
  try {
    await db.collection("configuracoes").doc("parametros").set({
      atencaoQtd: parseInt(document.getElementById("pr-atencao-qtd").value) || 2,
      atencaoDias: parseInt(document.getElementById("pr-atencao-dias").value) || 90,
      altaQtd: parseInt(document.getElementById("pr-alta-qtd").value) || 3,
      altaDias: parseInt(document.getElementById("pr-alta-dias").value) || 90
    });
    parametrosRecorrencia = await obterParametrosRecorrencia();
    renderEquipamentos();
    alert("Parâmetros salvos.");
  } catch (err) {
    alert("Erro ao salvar parâmetros: " + err.message);
  }
}

// ---------- Usuários (cadastrar / trocar perfil / bloquear / excluir) ----------
// A conta "administrador" é oculta desta lista de propósito: é a conta
// mestre (a primeira criada na plataforma), reservada para quem mantém o
// site. Ela nunca aparece aqui nem pode ser criada por este formulário.
let usuariosCache = [];
function escutarUsuarios() {
  db.collection("usuarios").orderBy("criadoEm", "desc").onSnapshot((snap) => {
    usuariosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.tipo !== "administrador");
    renderUsuarios();
  });
}

function appAdminSecundario() {
  const existente = firebase.apps.find((a) => a.name === "adminCreate");
  return existente || firebase.initializeApp(firebaseConfig, "adminCreate");
}

async function cadastrarUsuario(e) {
  e.preventDefault();
  const tipo = document.getElementById("nu-tipo").value;
  const nome = document.getElementById("nu-nome").value.trim();
  const empresa = document.getElementById("nu-empresa").value.trim();
  const telefone = document.getElementById("nu-telefone").value.trim();
  const email = document.getElementById("nu-email").value.trim();
  const senha = document.getElementById("nu-senha").value;
  const btn = document.getElementById("btn-novo-usuario");
  btn.disabled = true;
  btn.textContent = "Cadastrando…";
  try {
    const appSec = appAdminSecundario();
    const authSec = appSec.auth();
    const cred = await authSec.createUserWithEmailAndPassword(email, senha);
    await db.collection("usuarios").doc(cred.user.uid).set({
      nome, empresa, telefone, email, tipo,
      bloqueado: false,
      criadoPor: usuarioAtual.uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    await authSec.signOut();
    e.target.reset();
    alert(`Usuário ${nome} cadastrado como ${PERFIL_LABELS[tipo]}.`);
  } catch (err) {
    alert("Erro ao cadastrar usuário: " + (err.code === "auth/email-already-in-use" ? "este e-mail já está cadastrado." : err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar usuário";
  }
}

function renderUsuarios() {
  const el = document.getElementById("lista-usuarios");
  if (!el) return;
  el.innerHTML = usuariosCache.length
    ? usuariosCache.map((u) => `
      <div class="list-row" style="align-items:flex-start; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; width:100%;">
          <div><div class="list-row__title">${escapeHtml(u.nome)}</div><div class="list-row__sub">${escapeHtml(u.email)}${u.empresa ? " · " + escapeHtml(u.empresa) : ""}</div></div>
          ${u.bloqueado ? '<span class="badge badge--red">Bloqueado</span>' : '<span class="badge badge--green">Ativo</span>'}
        </div>
        <div style="display:flex; gap:8px; width:100%; flex-wrap:wrap;">
          <select style="flex:1; min-width:160px;" onchange="alterarPerfil('${u.id}', this.value)">
            ${optionsHtml(PERFIL_LABELS_SEM_ADMIN(), u.tipo)}
          </select>
          <button class="btn btn--sm ${u.bloqueado ? "btn--primary" : "btn--secondary"}" onclick="alternarBloqueio('${u.id}', ${!!u.bloqueado})">${u.bloqueado ? "Desbloquear" : "Bloquear"}</button>
          <button class="btn btn--sm btn--danger" onclick="excluirUsuario('${u.id}', '${escapeHtml(u.nome).replace(/'/g, "\\'")}')">Excluir</button>
        </div>
      </div>`).join("")
    : `<div class="empty"><div class="empty__text">Nenhum usuário.</div></div>`;
}
function PERFIL_LABELS_SEM_ADMIN() {
  const { administrador, ...resto } = PERFIL_LABELS;
  return resto;
}

async function alterarPerfil(uid, novoTipo) {
  try {
    await db.collection("usuarios").doc(uid).update({ tipo: novoTipo });
  } catch (err) {
    alert("Erro ao alterar perfil: " + err.message);
  }
}

async function alternarBloqueio(uid, bloqueadoAtual) {
  const acao = bloqueadoAtual ? "desbloquear" : "bloquear";
  if (!confirm(`Confirma ${acao} este usuário?`)) return;
  try {
    await db.collection("usuarios").doc(uid).update({ bloqueado: !bloqueadoAtual });
  } catch (err) {
    alert("Erro ao alterar bloqueio: " + err.message);
  }
}

async function excluirUsuario(uid, nome) {
  if (!confirm(`Excluir o acesso de "${nome}"? Isso remove o perfil dele da plataforma — a pessoa é desconectada imediatamente e não consegue mais entrar. (O login em si só é totalmente apagado direto no console do Firebase.)`)) return;
  try {
    await db.collection("usuarios").doc(uid).delete();
  } catch (err) {
    alert("Erro ao excluir usuário: " + err.message);
  }
}

// ---------- Chamados ----------
function escutarChamados() {
  db.collection("chamados").onSnapshot((snap) => {
    chamadosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    chamadosCache.sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0));
    renderFila();
    renderTodosChamados();
    renderStats();
    renderEquipamentos();
  });
}

const STATUS_FILA_GESTAO = ["registrado", "em_triagem", "aguardando_autorizacao", "aguardando_ordem_compra"];

function renderStats() {
  const fila = chamadosCache.filter((c) => STATUS_FILA_GESTAO.includes(c.status)).length;
  const emAndamento = chamadosCache.filter((c) => STATUS_ATIVOS.includes(c.status)).length;
  const parados = equipamentosCache.filter((e) => ["parado", "indisponivel"].includes(e.statusOperacional)).length;
  const concluidosMes = chamadosCache.filter((c) => {
    const ms = tsToMs(c.concluidoEm);
    if (!ms) return false;
    const d = new Date(ms), a = new Date();
    return d.getMonth() === a.getMonth() && d.getFullYear() === a.getFullYear();
  }).length;
  document.getElementById("stats-grid").innerHTML = `
    <div class="stat-card"><div class="stat-card__value">${fila}</div><div class="stat-card__label">Pendentes comigo</div></div>
    <div class="stat-card"><div class="stat-card__value">${emAndamento}</div><div class="stat-card__label">Chamados ativos</div></div>
    <div class="stat-card"><div class="stat-card__value">${parados}</div><div class="stat-card__label">Equipamentos parados</div></div>
    <div class="stat-card"><div class="stat-card__value">${concluidosMes}</div><div class="stat-card__label">Concluídos no mês</div></div>
  `;
}

function renderFila() {
  const el = document.getElementById("lista-fila");
  const fila = chamadosCache.filter((c) => STATUS_FILA_GESTAO.includes(c.status));
  if (fila.length === 0) {
    el.innerHTML = `<div class="empty">${icone("checkCirculo", 34)}<div class="empty__title">Nenhuma pendência</div></div>`;
    return;
  }
  el.innerHTML = fila.map((c) => {
    let acoes = "";
    if (c.status === "registrado") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="abrirTriagem('${c.id}')">Iniciar triagem</button>`;
    } else if (c.status === "em_triagem") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="abrirAcionar('${c.id}')">Acionar fornecedor</button>`;
    } else if (c.status === "aguardando_autorizacao") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="autorizarExecucao('${c.id}')">Autorizar execução</button>`;
    } else if (c.status === "aguardando_ordem_compra") {
      acoes = `<button class="btn btn--primary btn--sm" onclick="abrirOrdemCompra('${c.id}')">Anexar ordem de compra</button>`;
    }
    return `
    <div class="ticket-card">
      <div class="ticket-card__top">
        <div class="ticket-card__title">${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>
        ${badgeHtml(c.status)}
      </div>
      <div style="font-size:13px; color:var(--text-dim);">${escapeHtml((c.descricao || "").slice(0, 80))}</div>
      <div class="ticket-card__meta"><span>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")}</span><span class="chip chip--${c.criticidade}">${c.criticidade || ""}</span></div>
      ${stepperHtml(c.status)}
      <div class="small-btn-row"><a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Ver detalhes</a>${acoes}</div>
    </div>`;
  }).join("");
}

let filtroChamadoAtual = "todos";

function configurarFiltroChamados() {
  montarFiltroStatus("filtro-status-chamados", (chave) => { filtroChamadoAtual = chave; renderTodosChamados(); });
}

function renderTodosChamados() {
  const el = document.getElementById("lista-todos-chamados");
  // Fila de verdade: ordem cronológica, do mais antigo (quem está esperando
  // há mais tempo) para o mais novo — não o contrário.
  const lista = aplicarFiltroStatus(chamadosCache, filtroChamadoAtual).slice().sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0));

  if (lista.length === 0) { el.innerHTML = `<div class="empty"><div class="empty__text">Nenhum chamado nesse filtro.</div></div>`; return; }
  el.innerHTML = lista.map((c, i) => `
    <a class="ticket-card" href="chamado.html?id=${c.id}">
      <div class="ticket-card__top">
        <div class="ticket-card__title"><span style="color:var(--text-dim); font-weight:400;">#${i + 1}</span> ${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</div>
        ${badgeHtml(c.status)}
      </div>
      <div class="ticket-card__meta"><span>${formatarData(c.registradoEm)}</span><span>${escapeHtml(c.categoria || "")}</span></div>
      ${stepperHtml(c.status)}
      ${STATUS_ATIVOS.includes(c.status) ? `<div style="margin-top:4px;">${responsavelAtualHtml(c.status)}</div>` : ""}
    </a>`).join("");
}

function abrirTriagem(id) {
  const c = chamadosCache.find((x) => x.id === id);
  if (!c) return;
  document.getElementById("tr-chamado-id").value = id;
  document.getElementById("tr-info").innerHTML = `<strong>${escapeHtml(c.numero)} — ${escapeHtml(c.numeroFrota)}</strong><br/>${escapeHtml(c.plantaNome || "")} / ${escapeHtml(c.setorNome || "")} · Categoria: ${escapeHtml(c.categoria || "—")}`;
  document.getElementById("tr-criticidade").innerHTML = optionsHtml(CRITICIDADE_LABELS, c.criticidade || "P2");
  document.getElementById("tr-descricao").value = c.descricao || "";
  abrirFechar("overlay-triagem", true);
}
async function salvarTriagem(e) {
  e.preventDefault();
  const id = document.getElementById("tr-chamado-id").value;
  const c = chamadosCache.find((x) => x.id === id);
  const novaCriticidade = document.getElementById("tr-criticidade").value;
  const novaDescricao = document.getElementById("tr-descricao").value.trim();
  const mudouCriticidade = c && c.criticidade !== novaCriticidade;
  const mudouDescricao = c && (c.descricao || "") !== novaDescricao;
  let obs = "Triagem concluída pela Gestão de Frota";
  if (mudouCriticidade) obs += ` — criticidade ajustada de ${c.criticidade} para ${novaCriticidade}`;
  if (mudouDescricao) obs += " — descrição revisada";
  try {
    await transicionarChamado(id, "em_triagem", obs, usuarioAtual.nome, "gestao_frota", {
      criticidade: novaCriticidade,
      descricao: novaDescricao
    }, { tipo: "triagem", criticidadeAnterior: c?.criticidade, criticidadeNova: novaCriticidade, descricaoRevisada: novaDescricao });
    abrirFechar("overlay-triagem", false);
    mostrarToast("Triagem concluída.");
  } catch (err) {
    alert("Erro ao concluir triagem: " + err.message);
  }
}
function abrirAcionar(id) {
  document.getElementById("ac-chamado-id").value = id;
  abrirFechar("overlay-acionar", true);
}
async function salvarAcionamento(e) {
  e.preventDefault();
  const id = document.getElementById("ac-chamado-id").value;
  const fornecedorId = document.getElementById("ac-fornecedor").value;
  const fornecedor = fornecedoresCache.find((f) => f.id === fornecedorId);
  if (!fornecedor) { alert("Selecione um fornecedor."); return; }
  try {
    await transicionarChamado(id, "fornecedor_acionado", `Fornecedor ${fornecedor.nome} acionado`, usuarioAtual.nome, "gestao_frota", {
      fornecedorId,
      fornecedorNome: fornecedor.nome
    }, { tipo: "acionamento", fornecedorNome: fornecedor.nome });
    abrirFechar("overlay-acionar", false);
    mostrarToast("Fornecedor acionado.");
  } catch (err) {
    alert("Erro ao acionar fornecedor: " + err.message);
  }
}
async function autorizarExecucao(id) {
  try {
    await transicionarChamado(id, "em_teste", "Execução autorizada pela Gestão de Frota — fornecedor pode iniciar", usuarioAtual.nome, "gestao_frota", {
      autorizadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    mostrarToast("Execução autorizada.");
  } catch (err) {
    alert("Erro ao autorizar execução: " + err.message);
  }
}

// ---------- Ordem de compra (só no fluxo de mau uso confirmado) ----------
function abrirOrdemCompra(id) {
  document.getElementById("form-ordem-compra").reset();
  document.getElementById("oc-chamado-id").value = id;
  abrirFechar("overlay-ordem-compra", true);
}
async function salvarOrdemCompra(e) {
  e.preventDefault();
  const id = document.getElementById("oc-chamado-id").value;
  const numeroOc = document.getElementById("oc-numero").value.trim();
  const arquivo = document.getElementById("oc-arquivo").files[0];
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  let ordemCompraUrl = null;
  if (arquivo) {
    try {
      ordemCompraUrl = await enviarArquivo(`chamados/${id}/ordem-compra/${Date.now()}-${arquivo.name}`, arquivo, (pct) => { btn.textContent = `Enviando… ${pct}%`; });
    } catch (err) {
      alert("Não foi possível anexar a ordem de compra: " + err.message + "\n\nNada foi alterado. Tente novamente.");
      btn.disabled = false;
      btn.textContent = "Confirmar";
      return;
    }
  }
  try {
    await transicionarChamado(id, "aguardando_nf", "Ordem de compra anexada pela Gestão de Frota", usuarioAtual.nome, "gestao_frota", {
      "financeiro.ordemCompraNumero": numeroOc,
      "financeiro.ordemCompraUrl": ordemCompraUrl
    }, { tipo: "ordem_compra", numeroOc, ordemCompraUrl });
    e.target.reset();
    abrirFechar("overlay-ordem-compra", false);
    mostrarToast("Ordem de compra anexada.");
  } catch (err) {
    alert("Erro ao anexar ordem de compra: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// ---------- Equipamentos ----------
function escutarEquipamentos() {
  db.collection("equipamentos").orderBy("numeroFrota").onSnapshot((snap) => {
    equipamentosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderEquipamentos();
  });
}

function renderEquipamentos() {
  const el = document.getElementById("lista-equipamentos");
  if (equipamentosCache.length === 0) {
    el.innerHTML = `<div class="empty">${icone("caminhao", 34)}<div class="empty__title">Nenhum equipamento cadastrado</div></div>`;
    return;
  }
  el.innerHTML = equipamentosCache.map((eq) => {
    const doEquip = chamadosCache.filter((c) => c.equipamentoId === eq.id);
    const nivel = classificarRecorrencia(doEquip, parametrosRecorrencia);
    return `
    <div class="machine-plate">
      <div class="machine-plate__head">
        <div>
          <div class="machine-plate__id">${escapeHtml(eq.numeroFrota)} · ${escapeHtml(eq.plantaNome || "—")}/${escapeHtml(eq.setorNome || "—")}</div>
          <div class="machine-plate__model">${escapeHtml(eq.tipoModelo)}</div>
        </div>
        <div class="hourmeter"><div class="hourmeter__value">${(eq.horimetroAtual ?? 0).toLocaleString("pt-BR")}h</div><div class="hourmeter__label">Horímetro</div></div>
      </div>
      <div class="pill-group" style="margin-top:8px;">
        <span class="badge badge--${STATUS_OPERACIONAL_COLORS[eq.statusOperacional]}">${STATUS_OPERACIONAL_LABELS[eq.statusOperacional]}</span>
        ${eq.criticidade ? `<span class="chip chip--${eq.criticidade}">${eq.criticidade}</span>` : ""}
        <span class="badge badge--${RECORRENCIA_COLORS[nivel]}">${RECORRENCIA_LABELS[nivel]}</span>
      </div>
      <div class="machine-plate__footer">
        <span style="font-size:12px; color:var(--text-dim);">${doEquip.length} chamado(s) no total</span>
        <button class="btn btn--secondary btn--sm" onclick="abrirFormEquip('${eq.id}')">Editar</button>
      </div>
    </div>`;
  }).join("");
}

function abrirFormEquip(id) {
  const form = document.getElementById("form-equip");
  form.reset();
  document.getElementById("eq-id").value = id || "";
  document.getElementById("equip-titulo").textContent = id ? "Editar equipamento" : "Novo equipamento";
  if (id) {
    const eq = equipamentosCache.find((e) => e.id === id);
    document.getElementById("eq-numero").value = eq.numeroFrota || "";
    document.getElementById("eq-modelo").value = eq.tipoModelo || "";
    document.getElementById("eq-fabricante").value = eq.fabricante || "";
    document.getElementById("eq-fornecedor-nome").value = eq.fornecedorNome || "";
    document.getElementById("eq-ano").value = eq.ano || "";
    document.getElementById("eq-inicio").value = eq.inicioLocacao || "";
    definirValorMoeda(document.getElementById("eq-contrato"), eq.contratoValor || 0);
    document.getElementById("eq-capacidade").value = eq.capacidade || "";
    document.getElementById("eq-energia").value = eq.energiaCombustivel || "";
    document.getElementById("eq-criticidade").value = eq.criticidade || "P2";
    document.getElementById("eq-backup").value = eq.backupDisponivel ? "sim" : "nao";
    document.getElementById("eq-status").value = eq.statusOperacional || "operacional";
    definirValorFracionado(document.getElementById("eq-horimetro"), eq.horimetroAtual || 0);
    if (eq.plantaId) { document.getElementById("eq-planta").value = eq.plantaId; atualizarSetoresSelect(); }
    if (eq.setorId) setTimeout(() => (document.getElementById("eq-setor").value = eq.setorId), 50);
  }
  abrirFechar("overlay-equip", true);
}

async function salvarEquipamento(e) {
  e.preventDefault();
  const id = document.getElementById("eq-id").value;
  const plantaId = document.getElementById("eq-planta").value;
  const setorId = document.getElementById("eq-setor").value;
  const planta = plantasCache.find((p) => p.id === plantaId);
  const setor = setoresCache.find((s) => s.id === setorId);
  const dados = {
    numeroFrota: document.getElementById("eq-numero").value.trim(),
    tipoModelo: document.getElementById("eq-modelo").value.trim(),
    fabricante: document.getElementById("eq-fabricante").value.trim(),
    fornecedorNome: document.getElementById("eq-fornecedor-nome").value.trim(),
    plantaId, plantaNome: planta ? planta.nome : "",
    setorId, setorNome: setor ? setor.nome : "",
    ano: parseInt(document.getElementById("eq-ano").value) || null,
    inicioLocacao: document.getElementById("eq-inicio").value || null,
    contratoValor: valorMoedaParaNumero(document.getElementById("eq-contrato")) || null,
    capacidade: document.getElementById("eq-capacidade").value.trim(),
    energiaCombustivel: document.getElementById("eq-energia").value.trim(),
    criticidade: document.getElementById("eq-criticidade").value,
    backupDisponivel: document.getElementById("eq-backup").value === "sim",
    statusOperacional: document.getElementById("eq-status").value,
    horimetroAtual: valorFracionadoParaNumero(document.getElementById("eq-horimetro"))
  };
  try {
    if (id) {
      await db.collection("equipamentos").doc(id).update(dados);
    } else {
      dados.criadoEm = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("equipamentos").add(dados);
    }
    abrirFechar("overlay-equip", false);
  } catch (err) {
    alert("Erro ao salvar equipamento: " + err.message);
  }
}
