// ============================================================
// administrador.js — hub da conta master (oculta da lista de usuários)
// Inclui "Apagar dados do banco": dados específicos ou tudo (100%),
// com dupla confirmação (tem certeza? + digitar o e-mail completo).
// ============================================================

let usuarioAtual = null;

(async function init() {
  usuarioAtual = await requireAuth("administrador");
  popularTopbarMeta(usuarioAtual);
  document.getElementById("perfil-nome").textContent = usuarioAtual.nome || "—";
  document.getElementById("perfil-email").textContent = usuarioAtual.email || "—";
  configurarLimpeza();

  document.getElementById("loading").style.display = "none";
  document.getElementById("shell").style.display = "block";
})();

// ============================================================
// Apagar dados do banco
// ============================================================
// O que pode ser apagado. "contar" devolve a quantidade de registros;
// "apagar" remove e devolve quantos foram removidos.
const ITENS_LIMPEZA = [
  { id: "chamados", titulo: "Chamados", desc: "Todos os chamados, com histórico, comentários e anexos (links)",
    contar: () => contarColecao("chamados"), apagar: (cb) => apagarColecao("chamados", null, cb) },
  { id: "contadores", titulo: "Numeração dos chamados", desc: "Zera o contador: o próximo chamado volta a ser o nº 1",
    contar: () => contarColecao("contadores"), apagar: (cb) => apagarColecao("contadores", null, cb) },
  { id: "equipamentos", titulo: "Equipamentos (frota)", desc: "Todas as máquinas cadastradas e seus horímetros",
    contar: () => contarColecao("equipamentos"), apagar: (cb) => apagarColecao("equipamentos", null, cb) },
  { id: "locais", titulo: "Plantas e setores", desc: "Todas as plantas e os setores de cada uma",
    contar: async () => (await contarColecao("plantas")) + (await contarColecao("setores")),
    apagar: async (cb) => (await apagarColecao("setores", null, cb)) + (await apagarColecao("plantas", null, cb)) },
  { id: "parametros", titulo: "Parâmetros", desc: "Regras de recorrência e demais parâmetros configurados",
    contar: async () => ((await db.collection("configuracoes").doc("parametros").get()).exists ? 1 : 0),
    apagar: async () => {
      const ref = db.collection("configuracoes").doc("parametros");
      if (!(await ref.get()).exists) return 0;
      await ref.delete();
      return 1;
    } },
  { id: "usuarios", titulo: "Usuários cadastrados", desc: "Colaboradores e fornecedores (a sua conta Master é mantida)",
    contar: async () => (await db.collection("usuarios").get()).docs.filter((d) => d.data().tipo !== "administrador").length,
    apagar: (cb) => apagarColecao("usuarios", (d) => d.data().tipo !== "administrador", cb) }
];

async function contarColecao(nome) {
  const snap = await db.collection(nome).get();
  return snap.size;
}

// Apaga em lotes de 400 (limite do Firestore é 500 por lote)
async function apagarColecao(nome, filtro, aoProgredir) {
  const snap = await db.collection(nome).get();
  const docs = filtro ? snap.docs.filter(filtro) : snap.docs;
  let feitos = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const lote = db.batch();
    docs.slice(i, i + 400).forEach((d) => lote.delete(d.ref));
    await lote.commit();
    feitos += Math.min(400, docs.length - i);
    if (aoProgredir) aoProgredir(feitos, docs.length);
  }
  return feitos;
}

const limpeza = { contagens: {}, selecionados: [] };
const abrirFechar = (id, abrir) => document.getElementById(id).classList.toggle("hidden", !abrir);

function configurarLimpeza() {
  document.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => {
    if (btn.id === "limpar-fechar-2" && limpeza.apagando) return; // não fecha no meio da exclusão
    abrirFechar(btn.dataset.close, false);
  }));
  document.querySelectorAll(".overlay").forEach((ov) => ov.addEventListener("click", (e) => {
    if (e.target === ov && !limpeza.apagando) abrirFechar(ov.id, false);
  }));
  document.getElementById("btn-abrir-limpeza").addEventListener("click", abrirLimpeza);
  document.getElementById("limpar-tudo").addEventListener("change", aoMarcarTudo);
  document.getElementById("btn-limpar-continuar").addEventListener("click", irParaCerteza);
  document.getElementById("btn-limpar-cancelar-1").addEventListener("click", () => abrirFechar("overlay-limpar-1", false));
  document.getElementById("btn-limpar-sim").addEventListener("click", irParaEmail);
  document.getElementById("btn-limpar-cancelar-2").addEventListener("click", () => abrirFechar("overlay-limpar-2", false));
  document.getElementById("limpar-email").addEventListener("input", validarEmailDigitado);
  document.getElementById("form-limpar").addEventListener("submit", executarLimpeza);
  document.getElementById("btn-limpar-fim").addEventListener("click", () => {
    abrirFechar("overlay-limpar-2", false);
    window.location.reload();
  });
}

// ---------- 1) escolher o que apagar ----------
async function abrirLimpeza() {
  document.getElementById("limpar-carregando").style.display = "block";
  document.getElementById("limpar-carregando").textContent = "Contando registros…";
  document.getElementById("limpar-opcoes").style.display = "none";
  document.getElementById("limpar-tudo").checked = false;
  abrirFechar("overlay-limpar", true);
  try {
    const contagens = await Promise.all(ITENS_LIMPEZA.map((i) => i.contar()));
    ITENS_LIMPEZA.forEach((item, idx) => { limpeza.contagens[item.id] = contagens[idx]; });
    document.getElementById("limpar-lista").innerHTML = ITENS_LIMPEZA.map((item) => {
      const n = limpeza.contagens[item.id];
      return `<label class="limpar-item ${n === 0 ? "limpar-item--vazio" : ""}">
        <input type="checkbox" class="limpar-check" value="${item.id}" ${n === 0 ? "disabled" : ""} />
        <span class="limpar-item__texto"><strong>${item.titulo}</strong><small>${item.desc}</small></span>
        <span class="limpar-item__qtd">${n === 0 ? "vazio" : n + (n === 1 ? " registro" : " registros")}</span>
      </label>`;
    }).join("");
    document.querySelectorAll(".limpar-check").forEach((c) => c.addEventListener("change", atualizarSelecao));
    document.getElementById("limpar-carregando").style.display = "none";
    document.getElementById("limpar-opcoes").style.display = "block";
    atualizarSelecao();
  } catch (err) {
    document.getElementById("limpar-carregando").textContent = "Não foi possível ler o banco de dados: " + err.message;
  }
}

function aoMarcarTudo(e) {
  document.querySelectorAll(".limpar-check:not(:disabled)").forEach((c) => { c.checked = e.target.checked; });
  atualizarSelecao();
}
function atualizarSelecao() {
  const marcaveis = [...document.querySelectorAll(".limpar-check:not(:disabled)")];
  limpeza.selecionados = marcaveis.filter((c) => c.checked).map((c) => c.value);
  const tudo = marcaveis.length > 0 && limpeza.selecionados.length === marcaveis.length;
  document.getElementById("limpar-tudo").checked = tudo;
  document.getElementById("btn-limpar-continuar").disabled = limpeza.selecionados.length === 0;
}

// ---------- 2) "Tem certeza?" ----------
function irParaCerteza() {
  const itens = ITENS_LIMPEZA.filter((i) => limpeza.selecionados.includes(i.id));
  const todosMarcaveis = ITENS_LIMPEZA.filter((i) => limpeza.contagens[i.id] > 0).length;
  const tudo = itens.length === todosMarcaveis;
  document.getElementById("limpar-resumo").innerHTML =
    (tudo ? `<li class="limpar-resumo__tudo"><strong>REINICIAR O APLICATIVO (100%)</strong> — tudo será apagado</li>` : "") +
    itens.map((i) => `<li><strong>${i.titulo}</strong> <span>${limpeza.contagens[i.id]} ${limpeza.contagens[i.id] === 1 ? "registro" : "registros"}</span></li>`).join("");
  abrirFechar("overlay-limpar-1", true);
}

// ---------- 3) digitar o e-mail completo ----------
function irParaEmail() {
  abrirFechar("overlay-limpar-1", false);
  const email = (auth.currentUser && auth.currentUser.email) || usuarioAtual.email || "";
  document.getElementById("limpar-email-dica").textContent = email;
  document.getElementById("limpar-email").value = "";
  document.getElementById("limpar-erro").classList.remove("show");
  document.getElementById("limpar-progresso").style.display = "none";
  document.getElementById("limpar-botoes").style.display = "flex";
  document.getElementById("btn-limpar-fim").style.display = "none";
  document.getElementById("btn-limpar-apagar").disabled = true;
  marcarObrigatorios(document.getElementById("form-limpar"));
  abrirFechar("overlay-limpar-2", true);
  setTimeout(() => document.getElementById("limpar-email").focus(), 150);
}
function emailConfere() {
  const esperado = ((auth.currentUser && auth.currentUser.email) || usuarioAtual.email || "").trim().toLowerCase();
  return esperado !== "" && document.getElementById("limpar-email").value.trim().toLowerCase() === esperado;
}
function validarEmailDigitado() {
  document.getElementById("btn-limpar-apagar").disabled = !emailConfere();
}

// ---------- Execução ----------
async function executarLimpeza(e) {
  e.preventDefault();
  const erro = document.getElementById("limpar-erro");
  erro.classList.remove("show");
  if (!emailConfere()) { erro.textContent = "O e-mail digitado não confere com o da sua conta."; erro.classList.add("show"); return; }

  limpeza.apagando = true;
  const progresso = document.getElementById("limpar-progresso");
  progresso.style.display = "block";
  document.getElementById("limpar-botoes").style.display = "none";
  document.getElementById("limpar-email").disabled = true;
  document.getElementById("limpar-fechar-2").style.visibility = "hidden";

  // Ordem segura: usuários por último
  const ordem = ["chamados", "contadores", "equipamentos", "locais", "parametros", "usuarios"];
  const itens = ordem.map((id) => ITENS_LIMPEZA.find((i) => i.id === id)).filter((i) => limpeza.selecionados.includes(i.id));
  const linhas = [];
  const desenhar = (atual) => {
    progresso.innerHTML = linhas.map((l) => `<div class="limpar-progresso__linha ${l.ok ? "ok" : l.erro ? "erro" : ""}"><span>${l.ok ? "✓" : l.erro ? "✕" : "…"}</span><span>${l.texto}</span></div>`).join("") + (atual || "");
  };
  let falhou = false;
  for (const item of itens) {
    const linha = { texto: `Apagando ${item.titulo.toLowerCase()}…` };
    linhas.push(linha); desenhar();
    try {
      const n = await item.apagar((feitos, total) => { linha.texto = `Apagando ${item.titulo.toLowerCase()}… ${feitos}/${total}`; desenhar(); });
      linha.ok = true;
      linha.texto = `${item.titulo}: ${n} ${n === 1 ? "registro apagado" : "registros apagados"}`;
    } catch (err) {
      linha.erro = true;
      falhou = true;
      linha.texto = `${item.titulo}: falhou — ${err.code === "permission-denied" ? "sem permissão (publique o firestore.rules atualizado no Firebase)" : err.message}`;
    }
    desenhar();
  }
  desenhar(falhou
    ? `<div class="callout callout--perigo" style="margin-top:12px;">Alguns itens não foram apagados. Veja acima o motivo.</div>`
    : `<div class="callout" style="margin-top:12px;">Concluído. Os dados selecionados foram apagados.</div>`);
  limpeza.apagando = false;
  document.getElementById("limpar-fechar-2").style.visibility = "visible";
  document.getElementById("btn-limpar-fim").style.display = "block";
}
