// ============================================================
// auth.js — login e cadastro (index.html)
// ============================================================

const btnTabLogin = document.getElementById("btn-tab-login");
const btnTabCadastro = document.getElementById("btn-tab-cadastro");
const formLogin = document.getElementById("form-login");
const formCadastro = document.getElementById("form-cadastro");
const errorMsg = document.getElementById("error-msg");

btnTabLogin.addEventListener("click", () => {
  btnTabLogin.classList.add("active");
  btnTabCadastro.classList.remove("active");
  formLogin.style.display = "block";
  formCadastro.style.display = "none";
  esconderErro();
});
btnTabCadastro.addEventListener("click", () => {
  btnTabCadastro.classList.add("active");
  btnTabLogin.classList.remove("active");
  formCadastro.style.display = "block";
  formLogin.style.display = "none";
  esconderErro();
});

function mostrarErro(msg) { errorMsg.textContent = msg; errorMsg.classList.add("show"); }
function esconderErro() { errorMsg.classList.remove("show"); }

function traduzErro(err) {
  const map = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres."
  };
  return map[err.code] || "Não foi possível concluir. Tente novamente.";
}

async function redirecionarPorPerfil(uid) {
  const snap = await db.collection("usuarios").doc(uid).get();
  const dados = snap.data();
  window.location.href = PERFIL_HOME[dados.tipo] || "index.html";
}

formLogin.addEventListener("submit", async (e) => {
  e.preventDefault();
  esconderErro();
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const btn = formLogin.querySelector("button");
  btn.disabled = true;
  try {
    const cred = await auth.signInWithEmailAndPassword(email, senha);
    await redirecionarPorPerfil(cred.user.uid);
  } catch (err) {
    mostrarErro(traduzErro(err));
    btn.disabled = false;
  }
});

formCadastro.addEventListener("submit", async (e) => {
  e.preventDefault();
  esconderErro();
  const nome = document.getElementById("cad-nome").value.trim();
  const empresa = document.getElementById("cad-empresa").value.trim();
  const telefone = document.getElementById("cad-telefone").value.trim();
  const email = document.getElementById("cad-email").value.trim();
  const senha = document.getElementById("cad-senha").value;
  const btn = formCadastro.querySelector("button");
  btn.disabled = true;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, senha);
    const { tipo, master } = await determinarTipoInicial();
    await db.collection("usuarios").doc(cred.user.uid).set({
      nome, empresa, telefone, email, tipo, master,
      bloqueado: false,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.location.href = PERFIL_HOME[tipo] || "index.html";
  } catch (err) {
    mostrarErro(traduzErro(err));
    btn.disabled = false;
  }
});

// O primeiro usuário a se cadastrar em toda a plataforma vira Administrador
// master; todos os demais autocadastros entram como Solicitante (o
// administrador pode mudar o perfil depois). Usa uma transação sobre um
// documento "bootstrap" para evitar duas pessoas virarem master ao mesmo tempo.
async function determinarTipoInicial() {
  const ref = db.collection("configuracoes").doc("bootstrap");
  return db.runTransaction(async (tx) => {
    const doc = await tx.get(ref);
    const jaExisteMaster = doc.exists && doc.data().admMasterCriado === true;
    if (jaExisteMaster) {
      return { tipo: "solicitante", master: false };
    }
    tx.set(ref, { admMasterCriado: true }, { merge: true });
    return { tipo: "administrador", master: true };
  });
}

auth.onAuthStateChanged((user) => {
  if (user) redirecionarPorPerfil(user.uid);
});

aplicarMascaraTelefone(document.getElementById("cad-telefone"));

if (new URLSearchParams(window.location.search).get("bloqueado") === "1") {
  document.getElementById("bloqueado-msg").style.display = "block";
}
