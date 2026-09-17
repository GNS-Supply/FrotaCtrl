// ============================================================
// diagnostico.js — testa cada parte da configuração do Firebase
// e mostra o erro EXATO de cada uma, com a correção sugerida.
// ============================================================

const resultadosEl = document.getElementById("resultados");
const logEl = document.getElementById("log");
let linhasLog = [];

function log(txt) {
  linhasLog.push(txt);
  logEl.textContent = linhasLog.join("\n");
}

function addTeste(id, titulo) {
  const div = document.createElement("div");
  div.className = "teste teste--rodando";
  div.id = "teste-" + id;
  div.innerHTML = `<div class="teste__icone">…</div><div style="flex:1;min-width:0;"><div class="teste__titulo">${titulo}</div><div class="teste__msg">testando…</div></div>`;
  resultadosEl.appendChild(div);
  return div;
}
function concluirTeste(div, ok, msg, comoCorrigir) {
  div.className = "teste " + (ok ? "teste--ok" : "teste--erro");
  div.querySelector(".teste__icone").textContent = ok ? "✓" : "!";
  div.querySelector(".teste__msg").textContent = msg;
  if (!ok && comoCorrigir) {
    const fix = document.createElement("div");
    fix.className = "teste__fix";
    fix.innerHTML = "<strong>Como corrigir:</strong> " + comoCorrigir;
    div.lastElementChild.appendChild(fix);
  }
}

document.getElementById("btn-rodar").addEventListener("click", rodarDiagnostico);

async function rodarDiagnostico() {
  resultadosEl.innerHTML = "";
  linhasLog = [];
  const btn = document.getElementById("btn-rodar");
  btn.disabled = true;
  btn.textContent = "Rodando…";

  log("=== DIAGNÓSTICO FROTACTRL ===");
  log("Data: " + new Date().toLocaleString("pt-BR"));
  log("Origem (origin): " + window.location.origin);
  log("SDK Firebase: " + (firebase.SDK_VERSION || "desconhecido"));
  log("");

  // ---- 1. Configuração ----
  const t1 = addTeste("config", "Configuração do Firebase");
  try {
    const cfg = firebase.app().options;
    log("projectId:      " + cfg.projectId);
    log("storageBucket:  " + cfg.storageBucket);
    log("authDomain:     " + cfg.authDomain);
    const bucketNovo = (cfg.storageBucket || "").endsWith(".firebasestorage.app");
    const sdkMaior = parseInt((firebase.SDK_VERSION || "0").split(".")[0], 10);
    if (bucketNovo && sdkMaior < 11) {
      concluirTeste(t1, false, `Bucket no padrão novo (${cfg.storageBucket}) com SDK ${firebase.SDK_VERSION} — incompatível.`,
        "Atualize a versão do SDK nas tags &lt;script&gt; de todas as páginas para 12.4.0 ou superior.");
    } else {
      concluirTeste(t1, true, `Projeto ${cfg.projectId} · bucket ${cfg.storageBucket} · SDK ${firebase.SDK_VERSION}`);
    }
  } catch (err) {
    concluirTeste(t1, false, "Falha ao ler a configuração: " + err.message, "Verifique o arquivo firebase-config.js.");
    log("ERRO config: " + err.message);
  }

  // ---- 2. Autenticação ----
  const t2 = addTeste("auth", "Autenticação");
  const user = await new Promise((r) => { const un = auth.onAuthStateChanged((u) => { un(); r(u); }); });
  if (user) {
    concluirTeste(t2, true, `Logado como ${user.email} (uid: ${user.uid})`);
    log("");
    log("Usuário logado: " + user.email + " / uid " + user.uid);
  } else {
    concluirTeste(t2, false, "Nenhum usuário logado.",
      "Os testes de Firestore e Storage exigem login. Clique em 'Ir para o login', entre, e volte a esta página.");
    log("Nenhum usuário logado — testes seguintes podem falhar por isso.");
  }

  // ---- 3. Perfil do usuário no Firestore ----
  const t3 = addTeste("perfil", "Leitura do Firestore (perfil do usuário)");
  let perfil = null;
  if (user) {
    try {
      const snap = await db.collection("usuarios").doc(user.uid).get();
      if (snap.exists) {
        perfil = snap.data();
        concluirTeste(t3, true, `Perfil encontrado: ${perfil.nome || "—"} · tipo "${perfil.tipo}"`);
        log("Perfil: tipo=" + perfil.tipo + " bloqueado=" + !!perfil.bloqueado);
      } else {
        concluirTeste(t3, false, "Usuário autenticado mas sem documento em /usuarios.",
          "A conta existe no Authentication mas não tem perfil no Firestore. Cadastre o usuário pelo painel da Gestão de Frota.");
      }
    } catch (err) {
      concluirTeste(t3, false, `${err.code || "erro"}: ${err.message}`,
        "Publique o conteúdo de firestore.rules no console (Firestore Database → Regras).");
      log("ERRO firestore: " + (err.code || "") + " " + err.message);
    }
  } else {
    concluirTeste(t3, false, "Pulado — exige login.");
  }

  // ---- 4. Storage: upload de teste ----
  const t4 = addTeste("upload", "Upload no Storage (arquivo de teste)");
  if (user) {
    try {
      const caminho = `chamados/_diagnostico/${Date.now()}-teste.txt`;
      log("");
      log("Tentando upload em: " + caminho);
      const blob = new Blob(["teste de diagnostico frotactrl"], { type: "text/plain" });
      const url = await new Promise((resolve, reject) => {
        let fim = false;
        const tarefa = storage.ref(caminho).put(blob);
        const timer = setTimeout(() => {
          if (fim) return;
          fim = true;
          try { tarefa.cancel(); } catch (e) {}
          reject(new Error("TIMEOUT: o upload ficou pendurado por 25s sem resposta."));
        }, 25000);
        tarefa.on("state_changed",
          (s) => log("  progresso: " + s.bytesTransferred + "/" + s.totalBytes),
          (e) => { if (fim) return; fim = true; clearTimeout(timer); reject(e); },
          async () => { if (fim) return; fim = true; clearTimeout(timer); try { resolve(await tarefa.snapshot.ref.getDownloadURL()); } catch (e) { reject(e); } });
      });
      concluirTeste(t4, true, "Upload concluído com sucesso — os anexos devem funcionar.");
      log("Upload OK. URL: " + url);
    } catch (err) {
      const code = err.code || "";
      log("ERRO upload: " + code + " " + err.message);
      let fix = "Veja o código do erro acima e o log abaixo.";
      if (code === "storage/unauthorized") {
        fix = "As regras do <strong>Storage</strong> estão bloqueando. No console do Firebase: <strong>Storage → Regras</strong>, cole o conteúdo do arquivo <code>storage.rules</code> deste projeto e publique. (Atenção: as regras do Storage são SEPARADAS das do Firestore.)";
      } else if (code === "storage/unauthenticated") {
        fix = "Sessão não reconhecida pelo Storage. Saia e entre novamente.";
      } else if (code === "storage/unknown" || String(err.message).includes("TIMEOUT") || String(err.message).includes("CORS")) {
        fix = "Provável bloqueio de <strong>CORS</strong> ou Storage não provisionado. 1) Confirme que o Storage está ativado no console (Build → Storage → Começar). 2) Se estiver ativo, aplique o CORS no bucket com o arquivo <code>cors.json</code> descrito no README.";
      } else if (code === "storage/retry-limit-exceeded") {
        fix = "A rede interrompeu o envio várias vezes. Teste em outra conexão.";
      } else if (code === "storage/quota-exceeded") {
        fix = "A cota gratuita do Storage foi excedida neste projeto.";
      }
      concluirTeste(t4, false, `${code || "falha"}: ${err.message}`, fix);
    }
  } else {
    concluirTeste(t4, false, "Pulado — exige login.");
  }

  // ---- 5. Leitura de chamados ----
  const t5 = addTeste("chamados", "Leitura da coleção de chamados");
  if (user) {
    try {
      const snap = await db.collection("chamados").limit(3).get();
      concluirTeste(t5, true, `${snap.size} chamado(s) lidos com sucesso.`);
      log("");
      log("Chamados lidos: " + snap.size);
    } catch (err) {
      concluirTeste(t5, false, `${err.code || "erro"}: ${err.message}`, "Publique o firestore.rules atualizado no console.");
      log("ERRO chamados: " + (err.code || "") + " " + err.message);
    }
  } else {
    concluirTeste(t5, false, "Pulado — exige login.");
  }

  log("");
  log("=== FIM ===");
  btn.disabled = false;
  btn.textContent = "Rodar diagnóstico novamente";
}
