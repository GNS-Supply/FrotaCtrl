// ============================================================
// administrador.js
// ============================================================

let usuarioAtual = null;
let plantasCache = [];
let setoresCache = [];

(async function init() {
  usuarioAtual = await requireAuth("administrador");
  document.getElementById("user-avatar").textContent = iniciais(usuarioAtual.nome);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";

  escutarPlantas();
  escutarSetores();
  carregarParametros();
  carregarUsuarios();
  configurarNav();
  configurarSubTabs();
  configurarForms();
  aplicarMascaraTelefone(document.getElementById("nu-telefone"));
})();

function configurarNav() {
  document.querySelectorAll(".navitem").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navitem").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      ["cadastros", "perfil"].forEach((v) => (document.getElementById(`view-${v}`).style.display = v === view ? "block" : "none"));
    });
  });
}

function configurarSubTabs() {
  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const sub = btn.dataset.sub;
      ["plantas", "setores", "parametros", "usuarios"].forEach((s) => (document.getElementById(`sub-${s}`).style.display = s === sub ? "block" : "none"));
    });
  });
}

function configurarForms() {
  document.getElementById("form-planta").addEventListener("submit", salvarPlanta);
  document.getElementById("form-setor").addEventListener("submit", salvarSetor);
  document.getElementById("form-parametros").addEventListener("submit", salvarParametros);
  document.getElementById("form-novo-usuario").addEventListener("submit", cadastrarUsuario);
}

// ---------- Cadastro de colaboradores/fornecedores pelo admin ----------
// Criar uma conta de autenticação normalmente derrubaria a sessão do admin
// (o Firebase Auth troca o usuário logado para o recém-criado). Para evitar
// isso, a criação roda numa instância secundária do Firebase, isolada da
// sessão principal; a gravação no Firestore usa a sessão principal (do
// admin), que é quem tem permissão para criar o documento do novo usuário.
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
      master: false,
      bloqueado: false,
      criadoPor: usuarioAtual.uid,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    await authSec.signOut();
    e.target.reset();
    carregarUsuarios();
    alert(`Usuário ${nome} cadastrado como ${PERFIL_LABELS[tipo]}.`);
  } catch (err) {
    alert("Erro ao cadastrar usuário: " + (err.code === "auth/email-already-in-use" ? "este e-mail já está cadastrado." : err.message));
  } finally {
    btn.disabled = false;
    btn.textContent = "Cadastrar usuário";
  }
}

// ---------- Usuários (trocar perfil / bloquear) ----------
async function carregarUsuarios() {
  const snap = await db.collection("usuarios").orderBy("criadoEm", "desc").get();
  const usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  document.getElementById("lista-usuarios").innerHTML = usuarios.length
    ? usuarios.map((u) => {
        const protegido = u.master === true;
        return `
      <div class="list-row" style="align-items:flex-start; flex-direction:column; gap:8px;">
        <div style="display:flex; justify-content:space-between; width:100%;">
          <div><div class="list-row__title">${escapeHtml(u.nome)} ${protegido ? '<span class="chip chip--P1">MASTER</span>' : ""}</div><div class="list-row__sub">${escapeHtml(u.email)}${u.empresa ? " · " + escapeHtml(u.empresa) : ""}</div></div>
          ${u.bloqueado ? '<span class="badge badge--red">Bloqueado</span>' : '<span class="badge badge--green">Ativo</span>'}
        </div>
        ${protegido ? '<div class="callout" style="margin:0;">Administrador master — perfil e bloqueio protegidos.</div>' : `
        <div style="display:flex; gap:8px; width:100%;">
          <select style="flex:1;" onchange="alterarPerfil('${u.id}', this.value)">
            ${optionsHtml(PERFIL_LABELS, u.tipo)}
          </select>
          <button class="btn btn--sm ${u.bloqueado ? "btn--primary" : "btn--secondary"}" onclick="alternarBloqueio('${u.id}', ${!!u.bloqueado})">${u.bloqueado ? "Desbloquear" : "Bloquear"}</button>
        </div>`}
      </div>`;
      }).join("")
    : `<div class="empty"><div class="empty__text">Nenhum usuário.</div></div>`;
}

async function alterarPerfil(uid, novoTipo) {
  await db.collection("usuarios").doc(uid).update({ tipo: novoTipo });
  carregarUsuarios();
}

async function alternarBloqueio(uid, bloqueadoAtual) {
  const acao = bloqueadoAtual ? "desbloquear" : "bloquear";
  if (!confirm(`Confirma ${acao} este usuário?`)) return;
  await db.collection("usuarios").doc(uid).update({ bloqueado: !bloqueadoAtual });
  carregarUsuarios();
}

// ---------- Plantas ----------
function escutarPlantas() {
  db.collection("plantas").orderBy("nome").onSnapshot((snap) => {
    plantasCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    document.getElementById("lista-plantas").innerHTML = plantasCache.length
      ? plantasCache.map((p) => `<div class="list-row"><div class="list-row__title">${escapeHtml(p.nome)}</div></div>`).join("")
      : `<div class="empty"><div class="empty__text">Nenhuma planta cadastrada.</div></div>`;
    document.getElementById("st-planta").innerHTML = plantasCache.length
      ? plantasCache.map((p) => `<option value="${p.id}">${escapeHtml(p.nome)}</option>`).join("")
      : `<option value="">Cadastre uma planta primeiro</option>`;
  });
}
async function salvarPlanta(e) {
  e.preventDefault();
  const nome = document.getElementById("pl-nome").value.trim();
  if (!nome) return;
  await db.collection("plantas").add({ nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
  e.target.reset();
}

// ---------- Setores ----------
function escutarSetores() {
  db.collection("setores").orderBy("nome").onSnapshot((snap) => {
    setoresCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    document.getElementById("lista-setores").innerHTML = setoresCache.length
      ? setoresCache.map((s) => {
          const planta = plantasCache.find((p) => p.id === s.plantaId);
          return `<div class="list-row"><div><div class="list-row__title">${escapeHtml(s.nome)}</div><div class="list-row__sub">${escapeHtml(planta ? planta.nome : "—")}</div></div></div>`;
        }).join("")
      : `<div class="empty"><div class="empty__text">Nenhum setor cadastrado.</div></div>`;
  });
}
async function salvarSetor(e) {
  e.preventDefault();
  const plantaId = document.getElementById("st-planta").value;
  const nome = document.getElementById("st-nome").value.trim();
  if (!plantaId || !nome) return;
  await db.collection("setores").add({ plantaId, nome, criadoEm: firebase.firestore.FieldValue.serverTimestamp() });
  e.target.reset();
}

// ---------- Parâmetros de recorrência ----------
async function carregarParametros() {
  const p = await obterParametrosRecorrencia();
  document.getElementById("pr-atencao-qtd").value = p.atencaoQtd;
  document.getElementById("pr-atencao-dias").value = p.atencaoDias;
  document.getElementById("pr-alta-qtd").value = p.altaQtd;
  document.getElementById("pr-alta-dias").value = p.altaDias;
}
async function salvarParametros(e) {
  e.preventDefault();
  await db.collection("configuracoes").doc("parametros").set({
    atencaoQtd: parseInt(document.getElementById("pr-atencao-qtd").value) || 2,
    atencaoDias: parseInt(document.getElementById("pr-atencao-dias").value) || 90,
    altaQtd: parseInt(document.getElementById("pr-alta-qtd").value) || 3,
    altaDias: parseInt(document.getElementById("pr-alta-dias").value) || 90
  });
  alert("Parâmetros salvos.");
}
