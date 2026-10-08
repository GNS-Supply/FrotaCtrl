// ============================================================
// pwa.js — FrotaCTRL como aplicativo instalável
//  • registra o service worker (funciona offline para abrir o app)
//  • convite de instalação (Android/Chrome) e instruções (iPhone/Safari)
//  • aviso de "nova versão disponível" e de "sem conexão"
//  • comportamento de app nativo: botão Voltar do Android fecha as telas
//    sobrepostas e arrastar para baixo fecha as "bottom sheets"
// Autônomo: não depende de app.js (funciona também na tela de login).
// ============================================================
(function () {
  "use strict";

  const ehStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const ehIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  document.documentElement.classList.toggle("is-standalone", ehStandalone());
  if (ehIOS) document.documentElement.classList.add("is-ios");

  // ---------- Service worker + atualização ----------
  let promptInstalar = null;
  let recarregando = false;

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then((reg) => {
        // Procura versão nova sempre que o app volta para a tela
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") reg.update().catch(() => {});
        });
        reg.addEventListener("updatefound", () => {
          const novo = reg.installing;
          if (!novo) return;
          novo.addEventListener("statechange", () => {
            if (novo.state === "installed" && navigator.serviceWorker.controller) avisarAtualizacao(novo);
          });
        });
      }).catch((err) => console.warn("Service worker não registrado:", err));
    });
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (recarregando) return;
      recarregando = true;
      window.location.reload();
    });
  }

  function avisarAtualizacao(worker) {
    mostrarAviso({
      id: "pwa-aviso-update",
      texto: "Nova versão do FrotaCTRL disponível.",
      acao: "Atualizar",
      aoClicar: () => worker.postMessage("PULAR_ESPERA")
    });
  }

  // ---------- Avisos (faixa inferior) ----------
  function mostrarAviso({ id, texto, acao, aoClicar, fechavel }) {
    document.getElementById(id)?.remove();
    const el = document.createElement("div");
    el.id = id;
    el.className = "pwa-aviso";
    el.setAttribute("role", "status");
    el.innerHTML = `<span class="pwa-aviso__texto">${texto}</span>` +
      (acao ? `<button type="button" class="pwa-aviso__acao">${acao}</button>` : "") +
      (fechavel ? `<button type="button" class="pwa-aviso__fechar" aria-label="Fechar">✕</button>` : "");
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("pwa-aviso--visivel"));
    el.querySelector(".pwa-aviso__acao")?.addEventListener("click", () => { aoClicar && aoClicar(); el.remove(); });
    el.querySelector(".pwa-aviso__fechar")?.addEventListener("click", () => el.remove());
    return el;
  }

  // ---------- Sem conexão ----------
  function atualizarConexao() {
    const id = "pwa-offline";
    const atual = document.getElementById(id);
    if (navigator.onLine) { atual?.remove(); return; }
    if (atual) return;
    const el = document.createElement("div");
    el.id = id;
    el.className = "pwa-offline";
    el.textContent = "Sem conexão — os dados podem estar desatualizados.";
    document.body.appendChild(el);
  }
  window.addEventListener("online", atualizarConexao);
  window.addEventListener("offline", atualizarConexao);
  document.addEventListener("DOMContentLoaded", atualizarConexao);

  // ---------- Instalação ----------
  const CHAVE_ADIAR = "frotactrl.instalar.adiarAte";
  const adiado = () => Number(localStorage.getItem(CHAVE_ADIAR) || 0) > Date.now();
  const adiar = (dias) => { try { localStorage.setItem(CHAVE_ADIAR, String(Date.now() + dias * 86400000)); } catch (e) { /* ignora */ } };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalar = e;
    injetarBotaoInstalar();
    if (!adiado() && !ehStandalone()) {
      setTimeout(() => {
        if (!promptInstalar) return;
        mostrarAviso({
          id: "pwa-aviso-instalar",
          texto: "Instale o FrotaCTRL no seu celular para abrir como aplicativo.",
          acao: "Instalar",
          fechavel: true,
          aoClicar: instalar
        }).querySelector(".pwa-aviso__fechar")?.addEventListener("click", () => adiar(14));
      }, 3000);
    }
  });
  window.addEventListener("appinstalled", () => {
    promptInstalar = null;
    document.getElementById("pwa-aviso-instalar")?.remove();
    document.getElementById("pwa-botao-instalar")?.remove();
    document.documentElement.classList.add("is-standalone");
  });

  async function instalar() {
    if (promptInstalar) {
      promptInstalar.prompt();
      try { await promptInstalar.userChoice; } catch (e) { /* ignora */ }
      promptInstalar = null;
      return;
    }
    mostrarInstrucoes();
  }

  function mostrarInstrucoes() {
    document.getElementById("pwa-instrucoes")?.remove();
    const passos = ehIOS
      ? ["Abra este endereço no <strong>Safari</strong>.",
         "Toque no botão <strong>Compartilhar</strong> (quadrado com seta para cima) na barra do Safari.",
         "Role a lista e toque em <strong>Adicionar à Tela de Início</strong>.",
         "Confirme em <strong>Adicionar</strong>. O ícone <strong>F</strong> aparece na sua tela inicial."]
      : ["Abra este endereço no <strong>Chrome</strong>.",
         "Toque no menu <strong>⋮</strong> (três pontos) no canto superior.",
         "Toque em <strong>Instalar aplicativo</strong> (ou <strong>Adicionar à tela inicial</strong>).",
         "Confirme. O ícone <strong>F</strong> aparece na sua tela inicial."];
    const el = document.createElement("div");
    el.id = "pwa-instrucoes";
    el.className = "pwa-instrucoes";
    el.innerHTML = `
      <div class="pwa-instrucoes__caixa" role="dialog" aria-modal="true" aria-label="Instalar o aplicativo">
        <div class="pwa-instrucoes__logo">F</div>
        <h3>Instalar o FrotaCTRL</h3>
        <ol>${passos.map((p) => `<li>${p}</li>`).join("")}</ol>
        <button type="button" class="pwa-instrucoes__ok">Entendi</button>
        <a class="pwa-instrucoes__diag" href="instalar.html">Não consegue instalar? Fazer diagnóstico</a>
      </div>`;
    document.body.appendChild(el);
    const fechar = () => el.remove();
    el.querySelector(".pwa-instrucoes__ok").addEventListener("click", fechar);
    el.addEventListener("click", (e) => { if (e.target === el) fechar(); });
  }

  // Botão "Instalar aplicativo" no perfil de qualquer usuário
  function injetarBotaoInstalar() {
    if (ehStandalone() || document.getElementById("pwa-botao-instalar")) return;
    const sair = document.querySelector('button[onclick="logout()"]');
    if (!sair) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "pwa-botao-instalar";
    btn.className = "btn btn--secondary pwa-botao-instalar";
    btn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg> Instalar aplicativo`;
    btn.addEventListener("click", instalar);
    sair.parentNode.insertBefore(btn, sair);
  }
  document.addEventListener("DOMContentLoaded", injetarBotaoInstalar);
  window.addEventListener("load", injetarBotaoInstalar);

  // iPhone não tem convite automático: lembra uma vez a cada 14 dias
  window.addEventListener("load", () => {
    if (!ehIOS || ehStandalone() || adiado()) return;
    setTimeout(() => {
      const aviso = mostrarAviso({
        id: "pwa-aviso-instalar",
        texto: "Quer o FrotaCTRL como aplicativo no iPhone?",
        acao: "Como instalar",
        fechavel: true,
        aoClicar: mostrarInstrucoes
      });
      aviso.querySelector(".pwa-aviso__fechar")?.addEventListener("click", () => adiar(14));
      aviso.querySelector(".pwa-aviso__acao")?.addEventListener("click", () => adiar(14));
    }, 4000);
  });

  // ---------- Botão Voltar do celular fecha as telas sobrepostas ----------
  // Cada vez que uma tela sobreposta abre, entra uma entrada no histórico;
  // voltar (gesto/botão do Android) fecha a tela em vez de sair da página.
  let empilhadas = 0;        // entradas de histórico criadas por nós
  let ignorarPop = 0;        // popstate causados por nossos próprios history.back()
  let fecharPeloVoltar = 0;  // overlays que o popstate mandou fechar

  const observador = new MutationObserver((muts) => {
    muts.forEach((m) => {
      const alvo = m.target;
      if (!alvo.classList || !alvo.classList.contains("overlay")) return;
      const estavaOculto = (m.oldValue || "").split(/\s+/).includes("hidden");
      const agoraOculto = alvo.classList.contains("hidden");
      if (estavaOculto && !agoraOculto) {
        history.pushState({ overlay: true }, "");
        empilhadas++;
      } else if (!estavaOculto && agoraOculto) {
        if (fecharPeloVoltar > 0) {
          fecharPeloVoltar--;
          empilhadas = Math.max(0, empilhadas - 1);
        } else if (empilhadas > 0) {
          empilhadas--;
          ignorarPop++;
          history.back();
        }
      }
    });
  });
  document.addEventListener("DOMContentLoaded", () => {
    observador.observe(document.body, { attributes: true, attributeFilter: ["class"], attributeOldValue: true, subtree: true });
  });
  window.addEventListener("popstate", () => {
    if (ignorarPop > 0) { ignorarPop--; return; }
    const abertas = [...document.querySelectorAll(".overlay:not(.hidden)")];
    const topo = abertas[abertas.length - 1];
    if (topo) { fecharPeloVoltar++; topo.classList.add("hidden"); }
  });

  // ---------- Arrastar a "bottom sheet" para baixo fecha ----------
  let arraste = null;
  document.addEventListener("touchstart", (e) => {
    if (window.innerWidth >= 900) return;
    const zona = e.target.closest && e.target.closest(".sheet__handle, .sheet__header");
    if (!zona) return;
    const sheet = zona.closest(".sheet");
    if (!sheet) return;
    arraste = { sheet, y0: e.touches[0].clientY, dy: 0 };
    sheet.style.transition = "none";
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!arraste) return;
    arraste.dy = Math.max(0, e.touches[0].clientY - arraste.y0);
    arraste.sheet.style.transform = `translateY(${arraste.dy}px)`;
  }, { passive: true });
  document.addEventListener("touchend", () => {
    if (!arraste) return;
    const { sheet, dy } = arraste;
    arraste = null;
    sheet.style.transition = "transform 180ms ease";
    if (dy > 110) {
      sheet.style.transform = "translateY(100%)";
      setTimeout(() => {
        sheet.closest(".overlay")?.classList.add("hidden");
        sheet.style.transform = "";
        sheet.style.transition = "";
      }, 170);
    } else {
      sheet.style.transform = "";
      setTimeout(() => { sheet.style.transition = ""; }, 200);
    }
  });
})();
