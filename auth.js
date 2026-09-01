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
  const tipo = document.getElementById("cad-tipo").value;
  const nome = document.getElementById("cad-nome").value.trim();
  const empresa = document.getElementById("cad-empresa").value.trim();
  const telefone = document.getElementById("cad-telefone").value.trim();
  const email = document.getElementById("cad-email").value.trim();
  const senha = document.getElementById("cad-senha").value;
  const btn = formCadastro.querySelector("button");
  btn.disabled = true;
  try {
    const cred = await auth.createUserWithEmailAndPassword(email, senha);
    await db.collection("usuarios").doc(cred.user.uid).set({
      nome, empresa, telefone, email, tipo,
      criadoEm: firebase.firestore.FieldValue.serverTimestamp()
    });
    window.location.href = PERFIL_HOME[tipo] || "index.html";
  } catch (err) {
    mostrarErro(traduzErro(err));
    btn.disabled = false;
  }
});

auth.onAuthStateChanged((user) => {
  if (user) redirecionarPorPerfil(user.uid);
});
