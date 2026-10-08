// ============================================================
// instalar.js — diagnóstico de instalação do FrotaCTRL (PWA)
// Roda no próprio celular e mostra, item a item, o que impede
// (ou permite) a instalação do aplicativo.
// ============================================================
(function () {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const UA = navigator.userAgent || "";
  const resultados = [];
  let promptInstalar = null;

  const ehIOS = /iphone|ipad|ipod/i.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const ehAndroid = /android/i.test(UA);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

  function add(status, titulo, detalhe) {
    resultados.push({ status, titulo, detalhe });
    desenhar();
  }
  function desenhar() {
    const marca = { ok: "✓", erro: "✕", aviso: "!" };
    $("#lista").innerHTML = resultados.map((r) =>
      `<li class="check check--${r.status}"><div class="check__ic">${marca[r.status]}</div><div><strong>${esc(r.titulo)}</strong><span>${esc(r.detalhe || "")}</span></div></li>`).join("");
    resumir();
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function resumir() {
    const erros = resultados.filter((r) => r.status === "erro");
    const avisos = resultados.filter((r) => r.status === "aviso");
    let classe = "ok", icone = "✓", titulo, texto;
    if (standalone) {
      titulo = "O aplicativo já está instalado";
      texto = "Você está usando o FrotaCTRL em modo aplicativo.";
    } else if (erros.length) {
      classe = "erro"; icone = "✕";
      titulo = "Ainda não dá para instalar";
      texto = erros[0].titulo + " — " + (erros[0].detalhe || "");
    } else if (promptInstalar) {
      titulo = "Pronto para instalar";
      texto = "Toque em “Instalar agora”.";
    } else if (avisos.length) {
      classe = "aviso"; icone = "!";
      titulo = "Quase lá";
      texto = avisos[0].titulo + " — " + (avisos[0].detalhe || "");
    } else {
      titulo = "Tudo certo com o aparelho";
      texto = ehIOS ? "No iPhone, use Compartilhar → Adicionar à Tela de Início." : "Use o menu ⋮ do Chrome → Instalar app.";
    }
    $("#resumo .resumo").className = "resumo resumo--" + classe;
    $("#resumo .resumo__icone").textContent = icone;
    $("#resumo strong").textContent = titulo;
    $("#resumo span").textContent = texto;
    $("#btn-instalar").disabled = !promptInstalar;
    $("#btn-instalar").textContent = promptInstalar ? "Instalar agora" : ehIOS ? "Use o botão Compartilhar do Safari" : "Aguardando o navegador…";
  }

  // ---------- Captura o convite de instalação do navegador ----------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    promptInstalar = e;
    registrarConvite(true);
  });
  window.addEventListener("appinstalled", () => {
    promptInstalar = null;
    add("ok", "Aplicativo instalado", "Procure o ícone F na tela inicial do celular.");
  });
  $("#btn-instalar").addEventListener("click", async () => {
    if (!promptInstalar) return;
    promptInstalar.prompt();
    try { await promptInstalar.userChoice; } catch (e) { /* ignora */ }
    promptInstalar = null;
    resumir();
  });
  let conviteRegistrado = false;
  function registrarConvite(ok) {
    if (conviteRegistrado && !ok) return;
    if (ok) {
      // troca o aviso de "aguardando" pelo OK
      const i = resultados.findIndex((r) => r.titulo === "Convite de instalação do navegador");
      if (i >= 0) resultados.splice(i, 1);
      resultados.push({ status: "ok", titulo: "Convite de instalação do navegador", detalhe: "O navegador liberou a instalação. Use o botão “Instalar agora”." });
      conviteRegistrado = true;
      desenhar();
    } else {
      add("aviso", "Convite de instalação do navegador", "O navegador ainda não ofereceu a instalação. Isso é normal se o app já estiver instalado, se a aba for anônima ou se a página acabou de abrir. Tente o menu ⋮ → Instalar app.");
    }
  }

  // ---------- Verificações ----------
  async function verificar() {
    // 1) Conexão segura
    if (window.isSecureContext) add("ok", "Endereço seguro (HTTPS)", location.origin);
    else add("erro", "Endereço não é seguro", "A instalação exige HTTPS. Abra o endereço que começa com https://.");

    // 2) Navegador
    const emApp = /FBAN|FBAV|Instagram|MicroMessenger|Line\/|GSA\/|; wv\)|WebView|Snapchat|TikTok|Twitter/i.test(UA);
    if (emApp) {
      add("erro", "Você está num navegador embutido de outro app", "WhatsApp, Instagram, e-mail e similares não instalam aplicativos. Toque em ⋮ → “Abrir no Chrome” (ou copie o endereço e cole no Chrome).");
    } else if (ehIOS) {
      if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(UA)) add("aviso", "Navegador no iPhone", "Para melhor resultado use o Safari: Compartilhar → Adicionar à Tela de Início.");
      else add("ok", "Navegador no iPhone", "Safari. Use Compartilhar → Adicionar à Tela de Início.");
    } else if (/SamsungBrowser/i.test(UA)) {
      add("aviso", "Navegador: Samsung Internet", "Funciona: menu → Adicionar página a → Tela inicial (ou Instalar app). O Chrome costuma instalar com mais facilidade.");
    } else if (/Firefox/i.test(UA)) {
      add("aviso", "Navegador: Firefox", "O Firefox para Android só cria atalho. Use o Chrome para instalar como aplicativo.");
    } else if (/Edg\//i.test(UA) || /OPR\//i.test(UA)) {
      add("aviso", "Navegador: Edge/Opera", "Costuma funcionar pelo menu ⋮ → Adicionar à tela inicial. O Chrome é o mais indicado.");
    } else if (/Chrome\/\d+/i.test(UA)) {
      add("ok", "Navegador", "Chrome — compatível com a instalação.");
    } else {
      add("aviso", "Navegador não reconhecido", UA.slice(0, 90));
    }

    // 3) "Site para computador" ligado
    if (!ehIOS && !ehAndroid && navigator.maxTouchPoints > 1 && /X11|Linux x86_64/i.test(UA)) {
      add("erro", "“Site para computador” está ligado", "No Chrome: menu ⋮ → desmarque “Site para computador” e recarregue.");
    }

    // 4) Já instalado
    if (standalone) add("ok", "Modo aplicativo", "Esta página já está aberta como aplicativo.");

    // 5) Manifest
    let manifest = null;
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      add("erro", "Manifesto do aplicativo ausente", "A página não declara o manifest.webmanifest.");
    } else {
      try {
        const resp = await fetch(link.href, { cache: "no-store" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        manifest = await resp.json();
        const problemas = [];
        if (!manifest.name && !manifest.short_name) problemas.push("sem nome");
        if (!manifest.start_url) problemas.push("sem start_url");
        if (!["standalone", "fullscreen", "minimal-ui"].includes(manifest.display)) problemas.push("display inválido");
        const base = new URL(link.href);
        const inicio = manifest.start_url ? new URL(manifest.start_url, base) : null;
        const escopo = new URL(manifest.scope || ".", base);
        if (inicio && !inicio.href.startsWith(escopo.href)) problemas.push("start_url fora do escopo");
        const tamanhos = (manifest.icons || []).map((i) => (i.sizes || "").split(" ")).flat();
        if (!tamanhos.includes("192x192")) problemas.push("falta ícone 192x192");
        if (!tamanhos.includes("512x512")) problemas.push("falta ícone 512x512");
        if (problemas.length) add("erro", "Manifesto com problemas", problemas.join("; "));
        else add("ok", "Manifesto do aplicativo", `“${manifest.short_name || manifest.name}” · ${manifest.display} · início ${manifest.start_url}`);
      } catch (err) {
        add("erro", "Não foi possível ler o manifesto", `${err.message}. Confira se o arquivo manifest.webmanifest foi enviado ao GitHub.`);
      }
    }

    // 6) Ícones
    if (manifest && manifest.icons) {
      const base = new URL(link.href);
      const testes = manifest.icons.map((ic) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res({ src: ic.src, ok: true, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => res({ src: ic.src, ok: false });
        img.src = new URL(ic.src, base).href;
      }));
      const lista = await Promise.all(testes);
      const falhas = lista.filter((i) => !i.ok);
      if (falhas.length) add("erro", "Ícones não carregam", falhas.map((f) => f.src).join(", ") + " — envie esses arquivos .png para o GitHub, na mesma pasta dos arquivos .html.");
      else add("ok", "Ícones do aplicativo", lista.map((i) => `${i.w}×${i.h}`).join(" · "));
    }

    // 7) Service worker
    if (!("serviceWorker" in navigator)) {
      add("erro", "Navegador sem suporte a modo aplicativo", "Este navegador não tem service worker.");
    } else {
      try {
        await navigator.serviceWorker.register("sw.js");
        const reg = await navigator.serviceWorker.ready;
        const ativo = reg.active && reg.active.state === "activated";
        if (ativo) add("ok", "Service worker (modo offline)", "Ativo — escopo " + new URL(reg.scope).pathname);
        else add("aviso", "Service worker instalando", "Aguarde alguns segundos e recarregue a página.");
      } catch (err) {
        add("erro", "Service worker não registrou", `${err.message}. Confira se sw.js foi enviado ao GitHub e se o endereço é https.`);
      }
    }

    // 8) Convite do navegador (espera alguns segundos)
    if (!ehIOS && !standalone) {
      setTimeout(() => { if (!promptInstalar) registrarConvite(false); }, 6000);
    }
    resumir();
  }

  // ---------- Relatório ----------
  $("#btn-copiar").addEventListener("click", async () => {
    const texto = ["Diagnóstico de instalação — FrotaCTRL", location.href, UA, ""]
      .concat(resultados.map((r) => `[${r.status.toUpperCase()}] ${r.titulo}: ${r.detalhe || ""}`)).join("\n");
    try { await navigator.clipboard.writeText(texto); }
    catch (e) {
      const ta = document.createElement("textarea"); ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } catch (e2) { /* ignora */ } ta.remove();
    }
    $("#btn-copiar").textContent = "Relatório copiado ✓";
    setTimeout(() => { $("#btn-copiar").textContent = "Copiar relatório"; }, 2200);
  });

  // abre o guia certo do aparelho
  if (ehIOS) $("#det-ios").open = true; else $("#det-android").open = true;
  verificar();
})();
