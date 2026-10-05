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
  aplicarMascaraTelefone(document.getElementById("nu-telefone"));
  aplicarMascaraTelefone(document.getElementById("fd-telefone"));
  document.getElementById("nu-tipo").addEventListener("change", ajustarCamposFornecedor);
  ajustarCamposFornecedor();
  document.getElementById("btn-novo-chamado-fila").addEventListener("click", () => abrirNovoChamado(usuarioAtual));
  document.getElementById("form-fornecedor-dados").addEventListener("submit", salvarDadosFornecedor);
  adicionarAtalhoMaster(usuarioAtual);
})();

function popularSelectsEstaticos() {
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
      ["fila", "equipamentos", "cadastros", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
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
  if (tipo === "fornecedor" && (!empresa || telefone.replace(/\D/g, "").length < 10)) {
    alert("Para cadastrar um Fornecedor, informe o nome da empresa e um telefone de contato válido (com DDD).");
    return;
  }
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

// Para o perfil Fornecedor, nome da empresa e telefone de contato são
// obrigatórios (mesmos campos do cadastro da tela inicial).
function ajustarCamposFornecedor() {
  const forn = document.getElementById("nu-tipo").value === "fornecedor";
  document.getElementById("nu-empresa").required = forn;
  document.getElementById("nu-telefone").required = forn;
  document.getElementById("nu-empresa-label").textContent = forn ? "Nome da empresa" : "Empresa";
  document.getElementById("nu-telefone-label").textContent = forn ? "Telefone para contato" : "Telefone";
  marcarObrigatorios(document.getElementById("form-novo-usuario"));
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
          <select style="flex:1; min-width:160px;" onchange="alterarPerfil('${u.id}', this.value, this)">
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

async function alterarPerfil(uid, novoTipo, selectEl) {
  // Virando Fornecedor: pede nome da empresa e telefone antes de aplicar
  if (novoTipo === "fornecedor") {
    const u = usuariosCache.find((x) => x.id === uid);
    if (selectEl && u) selectEl.value = u.tipo; // só muda de fato depois de confirmar os dados
    document.getElementById("fd-uid").value = uid;
    document.getElementById("fd-info").innerHTML = `<strong>${escapeHtml(u?.nome || "")}</strong> passará a ser Fornecedor. Confirme os dados da empresa para contato.`;
    document.getElementById("fd-empresa").value = u?.empresa || "";
    document.getElementById("fd-telefone").value = u?.telefone || "";
    marcarObrigatorios(document.getElementById("form-fornecedor-dados"));
    abrirFechar("overlay-fornecedor-dados", true);
    return;
  }
  try {
    await db.collection("usuarios").doc(uid).update({ tipo: novoTipo });
  } catch (err) {
    alert("Erro ao alterar perfil: " + err.message);
  }
}
async function salvarDadosFornecedor(e) {
  e.preventDefault();
  const uid = document.getElementById("fd-uid").value;
  const empresa = document.getElementById("fd-empresa").value.trim();
  const telefone = document.getElementById("fd-telefone").value.trim();
  if (!empresa || telefone.replace(/\D/g, "").length < 10) {
    alert("Informe o nome da empresa e um telefone de contato válido (com DDD).");
    return;
  }
  try {
    await db.collection("usuarios").doc(uid).update({ tipo: "fornecedor", empresa, telefone });
    abrirFechar("overlay-fornecedor-dados", false);
    mostrarToast("Usuário alterado para Fornecedor.");
    carregarFornecedores();
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
    renderStats();
    renderEquipamentos();
  });
}

// ============================================================
// Fila de chamados da Gestão de Frota — 6 telas (botões) com kanbans
// ============================================================
const TELAS_GESTAO = [
  { id: "todos", titulo: "Todos os chamados", subtitulo: "Últimos 60 dias por padrão — use o filtro para mudar o período", tipo: "lista" },
  { id: "triagem", titulo: "Triagem e acionamento", subtitulo: "Triar e acionar fornecedor", tipo: "kanban", colunas: [
    { id: "triar", titulo: "Realizar triagem", sub: "Confirmar criticidade", cor: "amber", status: ["registrado"] },
    { id: "acionar", titulo: "Acionar fornecedor", sub: "Triagem concluída", cor: "blue", status: ["em_triagem"] }
  ]},
  { id: "mauuso", titulo: "Mau uso", subtitulo: "Acompanhamento até a ciência do aprovador", tipo: "kanban", colunas: [
    { id: "mu_fornecedor", titulo: "Com o fornecedor", sub: "Mau uso contestado — novo diagnóstico", cor: "red", status: ["diagnostico_contestado"] },
    { id: "mu_manutencao", titulo: "Com a Manutenção", sub: "Validação de mau uso", cor: "muted", status: ["aguardando_validacao"] },
    { id: "mu_aprovador", titulo: "Com o aprovador", sub: "Aguardando ciência", cor: "muted", status: ["aguardando_aprovacao"] }
  ]},
  { id: "contestacoes", titulo: "Contestações", subtitulo: "Contestadas pelo aprovador", tipo: "kanban", colunas: [
    { id: "ct_gestao", titulo: "Contestados pelo aprovador", sub: "Responder o aprovador ou enviar ao fornecedor", cor: "red", filtro: (c) => c.status === "contestacao_gestao" && origemContestacaoGestao(c) === "aprovador" },
    { id: "ct_fornecedor", titulo: "Fornecedor notificado", sub: "Aguardando resposta do fornecedor", cor: "muted", status: ["contestacao_fornecedor"] },
    { id: "ct_resposta", titulo: "Resposta do fornecedor", sub: "Devolver ao fornecedor ou ao aprovador", cor: "amber", filtro: (c) => c.status === "contestacao_gestao" && origemContestacaoGestao(c) === "fornecedor" }
  ]},
  { id: "execucao", titulo: "Execução", subtitulo: "Autorizar, acompanhar e ordem de compra", tipo: "kanban", colunas: [
    { id: "ex_autorizar", titulo: "Autorizar execução", sub: "Aprovados — liberar o fornecedor", cor: "green", status: ["aguardando_autorizacao"] },
    { id: "ex_execucao", titulo: "Em execução", sub: "Fornecedor executando o serviço", cor: "blue", status: ["em_teste"] },
    { id: "ex_oc", titulo: "Máquinas liberadas", sub: "Anexar ordem de compra (PDF)", cor: "amber", status: ["aguardando_ordem_compra", "liberado"] }
  ]},
  { id: "encerramento", titulo: "Notas fiscais", subtitulo: "Aguardando NF e NF recebidas", tipo: "kanban", colunas: [
    { id: "en_nf", titulo: "Aguardando NF", sub: "Ordem de compra enviada ao fornecedor", cor: "muted", status: ["aguardando_nf"] },
    { id: "en_concluir", titulo: "NF recebidas", sub: "Conferir e concluir o chamado", cor: "amber", status: ["aguardando_conclusao"] }
  ]}
];

function acoesGestao(c, col) {
  switch (c.status) {
    case "registrado": return `<button class="btn btn--primary btn--sm" onclick="abrirTriagem('${c.id}')">Iniciar triagem</button>`;
    case "em_triagem": return `<button class="btn btn--primary btn--sm" onclick="abrirAcionar('${c.id}')">Acionar fornecedor</button>`;
    case "contestacao_gestao": return `<a class="btn btn--primary btn--sm" href="chamado.html?id=${c.id}&acao=avaliar-contestacao">${origemContestacaoGestao(c) === "fornecedor" ? "Avaliar resposta" : "Avaliar contestação"}</a>`;
    case "aguardando_autorizacao": return `<button class="btn btn--primary btn--sm" onclick="autorizarExecucao('${c.id}')">Autorizar execução</button>`;
    case "liberado":
    case "aguardando_ordem_compra": return `<button class="btn btn--primary btn--sm" onclick="abrirOrdemCompra('${c.id}')">Anexar ordem de compra</button>`;
    case "aguardando_conclusao": return `<button class="btn btn--primary btn--sm" onclick="concluirChamado('${c.id}')">Concluir chamado</button>`;
    default: return "";
  }
}
// Links dos documentos (ordem de compra / nota fiscal) nos cards
function extraGestao(c) {
  const f = c.financeiro || {};
  const links = [];
  if (f.ordemCompraUrl) links.push(`<a class="kcard__link" href="${escapeHtml(f.ordemCompraUrl)}" target="_blank" rel="noopener">OC${f.ordemCompraNumero ? " " + escapeHtml(f.ordemCompraNumero) : ""}</a>`);
  if (f.notaFiscalUrl) links.push(`<a class="kcard__link" href="${escapeHtml(f.notaFiscalUrl)}" target="_blank" rel="noopener">Nota fiscal</a>`);
  return links.length ? `<div class="kcard__links">${links.join("")}</div>` : "";
}

const painelGestao = TelasKanban.criar({
  id: "gestao",
  container: "paineis-gestao",
  telas: TELAS_GESTAO,
  obter: () => chamadosCache,
  acoes: acoesGestao,
  extra: extraGestao,
  periodoPadraoDias: 60 // "Todos os chamados" mostra os últimos 60 dias até o filtro mudar
});
function renderFila() { painelGestao.render(); }

// Indicadores da frota: total / paradas / operando com restrição / % em funcionamento
function renderStats() {
  document.getElementById("stats-grid").innerHTML = indicadoresFrotaHtml(indicadoresFrota(equipamentosCache, chamadosCache));
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

async function concluirChamado(id) {
  if (!confirm("Concluir este chamado? A ordem de compra e a nota fiscal já estão anexadas.")) return;
  try {
    await concluirChamadoGestao(id, usuarioAtual);
    mostrarToast("Chamado concluído.");
  } catch (err) {
    alert("Erro ao concluir: " + err.message);
  }
}

// ---------- Equipamentos ----------
function escutarEquipamentos() {
  db.collection("equipamentos").orderBy("numeroFrota").onSnapshot((snap) => {
    equipamentosCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderStats();
    renderEquipamentos();
  });
}

// Situação operacional exibida no cartão: segue as mesmas regras dos
// indicadores (parada = P1 confirmado ou avaliação técnica iniciada, até
// o fornecedor liberar).
function statusExibicaoEquip(eq, doEquip) {
  if (doEquip.some(chamadoParandoMaquina)) return { label: "Parada", icone: "parada", classe: "fr-status--parada" };
  const chave = eq.statusOperacional;
  if (chave === "operacional_restricao" || doEquip.some(chamadoComRestricao)) return { label: "Com restrição", icone: "alerta", classe: "fr-status--restricao" };
  const cor = STATUS_OPERACIONAL_COLORS[chave];
  const label = STATUS_OPERACIONAL_LABELS[chave] || "operacional";
  if (cor === "green" || !cor) return { label, icone: "checkQuadro", classe: "fr-status--ok" };
  if (cor === "amber" || cor === "blue") return { label, icone: "alerta", classe: "fr-status--restricao" };
  if (cor === "muted") return { label, icone: "parada", classe: "fr-status--inativo" };
  return { label, icone: "parada", classe: "fr-status--parada" };
}

function renderEquipamentos() {
  const el = document.getElementById("lista-equipamentos");
  if (equipamentosCache.length === 0) {
    el.innerHTML = `<div class="empty">${icone("empilhadeira", 34)}<div class="empty__title">Nenhum equipamento cadastrado</div></div>`;
    return;
  }
  const iconeRecorrencia = { alta: "sirene", atencao: "alerta", normal: "checkCirculo" };
  el.innerHTML = equipamentosCache.map((eq) => {
    const doEquip = chamadosCache.filter((c) => c.equipamentoId === eq.id);
    const nivel = classificarRecorrencia(doEquip, parametrosRecorrencia);
    const st = statusExibicaoEquip(eq, doEquip);
    const aberto = doEquip
      .filter((c) => !["concluido", "cancelado"].includes(c.status))
      .sort((a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0))[0];
    const pendente = aberto ? PERFIL_LABELS[PROXIMO_RESPONSAVEL[aberto.status]] : null;
    const pills = [eq.capacidade, eq.energia, eq.ano].filter(Boolean).map((t) => `<span class="fr-pill">${escapeHtml(t)}</span>`).join("")
      + (eq.numeroSerie ? `<span class="fr-pill fr-pill--serie" title="Número de série">S/N ${escapeHtml(eq.numeroSerie)}</span>` : "");
    const total = doEquip.length;
    const numero = String(eq.numeroFrota || "");
    const tamNum = numero.length >= 9 ? "fr-card__num--p" : numero.length >= 6 ? "fr-card__num--m" : "";
    return `
    <div class="fr-card" id="card-equip-${eq.id}">
      <div class="fr-card__main" role="button" tabindex="0" aria-label="Ver últimos chamados de ${escapeHtml(numero)}" onclick="alternarHistoricoEquip('${eq.id}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();alternarHistoricoEquip('${eq.id}')}">
        <div class="fr-card__topo">
          <div class="fr-card__num ${tamNum}" title="${escapeHtml(numero)}">${escapeHtml(numero)}</div>
          <div class="fr-card__ident">
            <div class="fr-card__modelo" title="${escapeHtml(eq.tipoModelo || "")}">${escapeHtml(eq.tipoModelo || "—")}</div>
            <div class="fr-card__local">${icone("pin", 13)}<span>${escapeHtml(eq.plantaNome || "—")} / ${escapeHtml(eq.setorNome || "—")}</span></div>
            ${pills ? `<div class="fr-card__pills">${pills}</div>` : ""}
          </div>
        </div>
        <div class="fr-card__metricas">
          <div class="fr-card__col">
            <div class="fr-card__rotulo">Horímetro</div>
            <div class="fr-card__horimetro">${(eq.horimetroAtual ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<small>h</small></div>
          </div>
          <div class="fr-card__col fr-rec fr-rec--${nivel}">
            ${icone(iconeRecorrencia[nivel] || "checkCirculo", 26)}
            <div class="fr-card__texto">${RECORRENCIA_LABELS[nivel]}</div>
          </div>
          <div class="fr-card__col fr-status ${st.classe}">
            ${icone(st.icone, 26)}
            <div class="fr-card__texto">${escapeHtml(st.label)}</div>
          </div>
        </div>
        <div class="fr-card__chamado">
          ${aberto ? `<a class="fr-chamado" href="chamado.html?id=${aberto.id}" onclick="event.stopPropagation()"><span class="fr-chamado__titulo"><i class="fr-chamado__ponto"></i>Chamado aberto</span><span class="fr-chamado__sub">${escapeHtml(aberto.numero || "")}${pendente ? ` · pendente com <strong>${escapeHtml(pendente)}</strong>` : ""}</span></a>` : `<span class="fr-chamado fr-chamado--vazio">Sem chamado aberto</span>`}
          <div class="fr-card__total">${total} chamado${total === 1 ? "" : "s"} no total</div>
        </div>
      </div>
      <button class="fr-card__editar" title="Editar equipamento" aria-label="Editar equipamento" onclick="event.stopPropagation(); abrirFormEquip('${eq.id}')">${icone("lapis", 17)}</button>
      <div class="equip-row__historico" id="historico-equip-${eq.id}" style="display:none;"></div>
    </div>`;
  }).join("");
}

// Expande/recolhe, embaixo da própria máquina, os últimos chamados dela —
// sem precisar sair da tela de Frota para consultar o histórico.
function alternarHistoricoEquip(id) {
  const painel = document.getElementById(`historico-equip-${id}`);
  const abrindo = painel.style.display === "none";
  painel.style.display = abrindo ? "block" : "none";
  document.getElementById(`card-equip-${id}`)?.classList.toggle("fr-card--aberto", abrindo);
  if (!abrindo || painel.dataset.carregado) return;
  painel.dataset.carregado = "1";

  const doEquip = chamadosCache
    .filter((c) => c.equipamentoId === id)
    .slice()
    .sort((a, b) => (tsToMs(b.registradoEm) || 0) - (tsToMs(a.registradoEm) || 0))
    .slice(0, 5);

  if (doEquip.length === 0) {
    painel.innerHTML = `<div class="empty__text">Nenhum chamado registrado para este equipamento ainda.</div>`;
    return;
  }
  painel.innerHTML = `
    <div class="equip-historico-titulo">Últimos chamados</div>
    ${doEquip.map((c) => `
      <a class="equip-historico-item" href="chamado.html?id=${c.id}">
        <div class="equip-historico-item__topo">
          <span>${escapeHtml(c.numero)}</span>
          ${badgeHtml(c.status)}
        </div>
        <div class="equip-historico-item__meta"><span>${escapeHtml(c.categoria || "")}</span><span>${formatarData(c.registradoEm)}</span></div>
        ${stepperHtml(c.status)}
      </a>`).join("")}
  `;
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
    document.getElementById("eq-serie").value = eq.numeroSerie || "";
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
    numeroSerie: document.getElementById("eq-serie").value.trim(),
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
