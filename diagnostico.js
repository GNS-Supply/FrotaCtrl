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
  const t1 = addTeste("config", "Configuração do Firebase e do Cloudinary");
  try {
    const cfg = firebase.app().options;
    log("projectId:      " + cfg.projectId);
    log("authDomain:     " + cfg.authDomain);
    log("SDK Firebase:   " + firebase.SDK_VERSION);
    log("Cloudinary:     cloud=" + CLOUDINARY_CONFIG.cloudName + " · preset=" + CLOUDINARY_CONFIG.uploadPreset);
    if (!CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
      concluirTeste(t1, false, "CLOUDINARY_CONFIG está incompleto em firebase-config.js.",
        "Preencha cloudName e uploadPreset com os valores do seu painel Cloudinary.");
    } else {
      concluirTeste(t1, true, `Projeto ${cfg.projectId} · SDK ${firebase.SDK_VERSION} · Cloudinary ${CLOUDINARY_CONFIG.cloudName}`);
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

  // ---- 4. Cloudinary: upload de teste ----
  // Os anexos não usam mais o Firebase Storage (passou a exigir plano
  // pago mesmo na cota gratuita) — agora vão para o Cloudinary via
  // upload "unsigned", configurado em CLOUDINARY_CONFIG (firebase-config.js).
  const t4 = addTeste("upload", "Upload no Cloudinary (arquivo de teste)");
  if (user) {
    try {
      const publicId = `_diagnostico__${Date.now()}-teste`;
      log("");
      log(`Tentando upload no Cloudinary (cloud: ${CLOUDINARY_CONFIG.cloudName}, preset: ${CLOUDINARY_CONFIG.uploadPreset})`);
      const blob = new Blob(["teste de diagnostico frotactrl"], { type: "text/plain" });
      const url = await new Promise((resolve, reject) => {
        let fim = false;
        const xhr = new XMLHttpRequest();
        const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`;
        const formData = new FormData();
        formData.append("file", blob, "teste.txt");
        formData.append("upload_preset", CLOUDINARY_CONFIG.uploadPreset);
        formData.append("public_id", publicId);
        const timer = setTimeout(() => {
          if (fim) return;
          fim = true;
          xhr.abort();
          reject(new Error("TIMEOUT: o upload ficou pendurado por 25s sem resposta."));
        }, 25000);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) log("  progresso: " + e.loaded + "/" + e.total);
        });
        xhr.onreadystatechange = () => {
          if (xhr.readyState !== 4 || fim) return;
          fim = true;
          clearTimeout(timer);
          if (xhr.status >= 200 && xhr.status < 300) {
            try { resolve(JSON.parse(xhr.responseText).secure_url); } catch (e) { reject(new Error("Resposta inesperada do Cloudinary: " + xhr.responseText)); }
          } else {
            reject(Object.assign(new Error(xhr.responseText), { status: xhr.status }));
          }
        };
        xhr.onerror = () => { if (fim) return; fim = true; clearTimeout(timer); reject(new Error("TIMEOUT ou CORS: falha de rede ao contatar o Cloudinary.")); };
        xhr.open("POST", endpoint);
        xhr.send(formData);
      });
      concluirTeste(t4, true, "Upload concluído com sucesso — os anexos devem funcionar.");
      log("Upload OK. URL: " + url);
    } catch (err) {
      const status = err.status || 0;
      log("ERRO upload: " + status + " " + err.message);
      let fix = "Veja o log abaixo.";
      if (status === 400) {
        fix = "O Cloudinary recusou o arquivo/parâmetros. Confira no painel se o upload preset <code>" + CLOUDINARY_CONFIG.uploadPreset + "</code> existe, está como <strong>Unsigned</strong> e pertence ao cloud <code>" + CLOUDINARY_CONFIG.cloudName + "</code>.";
      } else if (status === 401 || status === 403) {
        fix = "Sem permissão. Confirme que o upload preset está com Signing Mode = <strong>Unsigned</strong> no painel do Cloudinary (Settings → Upload).";
      } else if (status === 0) {
        fix = "Falha de conexão/CORS ao contatar api.cloudinary.com. Verifique sua internet ou se algum bloqueador de rede/anúncios está interferindo.";
      }
      concluirTeste(t4, false, `${status || "falha"}: ${err.message}`, fix);
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
