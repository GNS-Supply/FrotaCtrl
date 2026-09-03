// ============================================================
// administrador.js — hub da conta master (oculta da lista de usuários)
// ============================================================

let usuarioAtual = null;

(async function init() {
  usuarioAtual = await requireAuth("administrador");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";
})();
