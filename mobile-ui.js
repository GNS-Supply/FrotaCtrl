// ============================================================
// mobile-ui.js — comportamento "de aplicativo" no celular
//  • cabeçalho com paralaxe e barra superior que ganha faixa ao rolar
//  • menu flutuante que some ao rolar para baixo e volta ao subir
//  • kanban em abas deslizantes (nenhuma rolagem lateral)
//  • revelação suave dos cartões, contagem animada dos números
//  • ondas ao toque e vibração leve (onde o aparelho permite)
// Só atua abaixo de 900px; no computador não faz nada.
// ============================================================
(function () {
  "use strict";
  const mq = window.matchMedia("(max-width: 899px)");
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ehMobile = () => mq.matches;
  const $$ = (sel, raiz) => Array.from((raiz || document).querySelectorAll(sel));

  // ---------- Rolagem: paralaxe + menu flutuante ----------
  let ultimoY = 0, ticking = false, sobrePagina = 0;
  function aoRolar() {
    ticking = false;
    if (!ehMobile()) return;
    const y = Math.max(0, window.scrollY || 0);
    const v = Math.min(y, 320);
    if (!(v === 320 && sobrePagina === 320)) {
      $$(".page-header, .topbar").forEach((el) => el.style.setProperty("--sy", v));
      sobrePagina = v;
    }
    const dock = document.querySelector(".bottomnav");
    if (dock) {
      const delta = y - ultimoY;
      const noFim = window.innerHeight + y >= document.documentElement.scrollHeight - 24;
      if (y < 80 || noFim || delta < -6) dock.classList.remove("dock-oculto");
      else if (delta > 10 && y > 140) dock.classList.add("dock-oculto");
    }
    ultimoY = y;
  }
  window.addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(aoRolar); } }, { passive: true });

  // Teclado aberto: esconde o menu flutuante (iOS/Android)
  document.addEventListener("focusin", (e) => {
    if (ehMobile() && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) document.documentElement.classList.add("kbd-aberto");
  });
  document.addEventListener("focusout", () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || !/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) document.documentElement.classList.remove("kbd-aberto");
    }, 120);
  });

  // ---------- Kanban em abas ----------
  const indicePorTela = {};
  function chaveKanban(k) {
    return (document.querySelector(".tela-header h2")?.textContent || k.id || "kanban").trim();
  }
  function melhorColuna(cols) {
    const comAcao = cols.findIndex((c) => c.querySelector(".kcol__faixa"));
    if (comAcao >= 0) return comAcao;
    const cheia = cols.findIndex((c) => !c.classList.contains("kcol--vazia"));
    return cheia >= 0 ? cheia : 0;
  }
  function montarAbas(k) {
    const cols = Array.from(k.children).filter((c) => c.classList.contains("kcol"));
    if (!cols.length) return;
    const chave = chaveKanban(k);
    const assinatura = cols.map((c) => `${c.querySelector(".kcol__nome")?.textContent}|${c.querySelector(".kcol__cont")?.textContent}|${c.querySelector(".kcol__faixa") ? 1 : 0}`).join("§");
    let barra = k.previousElementSibling;
    if (!barra || !barra.classList.contains("kb-tabs")) barra = null;
    if (k.dataset.kbAssinatura === assinatura && barra) {
      aplicarAtiva(k, barra, cols, indicePorTela[chave] ?? 0, false);
      return;
    }
    if (indicePorTela[chave] == null || indicePorTela[chave] >= cols.length) indicePorTela[chave] = melhorColuna(cols);
    k.dataset.kbAssinatura = assinatura;
    k.classList.add("kanban--tabs");
    if (!barra) {
      barra = document.createElement("div");
      barra.className = "kb-tabs";
      barra.setAttribute("role", "tablist");
      k.parentNode.insertBefore(barra, k);
    }
    barra.style.setProperty("--n", cols.length);
    barra.hidden = cols.length < 2;
    barra.innerHTML = cols.map((c, i) => {
      const nome = c.querySelector(".kcol__nome")?.textContent.trim() || `Coluna ${i + 1}`;
      const qtd = c.querySelector(".kcol__cont")?.textContent.trim() || "0";
      const acao = c.querySelector(".kcol__faixa") ? " kb-tab--acao" : "";
      return `<button type="button" role="tab" class="kb-tab${acao}" data-i="${i}"><b>${qtd}</b><span>${nome.replace(/</g, "&lt;")}</span></button>`;
    }).join("");
    barra.onclick = (e) => {
      const btn = e.target.closest(".kb-tab");
      if (!btn) return;
      const novo = Number(btn.dataset.i);
      const antes = indicePorTela[chave] ?? 0;
      if (novo === antes) return;
      k.style.setProperty("--dir", novo > antes ? "28px" : "-28px");
      indicePorTela[chave] = novo;
      aplicarAtiva(k, barra, Array.from(k.children).filter((c) => c.classList.contains("kcol")), novo, true);
      if (navigator.vibrate) navigator.vibrate(6);
    };
    aplicarAtiva(k, barra, cols, indicePorTela[chave], false);
  }
  function aplicarAtiva(k, barra, cols, idx, animar) {
    barra.style.setProperty("--i", idx);
    cols.forEach((c, i) => {
      const ativa = i === idx;
      if (ativa && animar) { c.classList.remove("kcol--ativa"); void c.offsetWidth; }
      c.classList.toggle("kcol--ativa", ativa);
    });
    $$(".kb-tab", barra).forEach((b, i) => {
      b.classList.toggle("kb-tab--on", i === idx);
      b.setAttribute("aria-selected", i === idx ? "true" : "false");
    });
  }
  function desmontarAbas() {
    $$(".kb-tabs").forEach((b) => b.remove());
    $$(".kanban--tabs").forEach((k) => { k.classList.remove("kanban--tabs"); delete k.dataset.kbAssinatura; $$(".kcol--ativa", k).forEach((c) => c.classList.remove("kcol--ativa")); });
  }

  // ---------- Revelação ao rolar + contagem ----------
  const vistos = new Set();
  const contados = new Map();
  const SEL_REVELAR = ".stat-card, .ticket-card, .kcard, .fr-card, .chamado-row, .chamado-lista-row, .lt-item, .chart-card, .fornecedor-tela-btn, .limpar-item, .equip-historico-item";
  let io = null;
  function chaveDe(el) {
    const href = el.getAttribute && el.getAttribute("href");
    let texto = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 48);
    // indicadores e ladrilhos: a chave ignora os números (que mudam), só o rótulo conta
    if (el.matches && el.matches(".fornecedor-tela-btn, .stat-card")) texto = texto.replace(/\d+/g, "#");
    return (href || el.id || "") + "|" + el.className.toString().split(" ")[0] + "|" + texto;
  }
  function chaveContagem(el) {
    const caixa = el.closest(".stat-card, .fornecedor-tela-btn");
    const rotulo = caixa && caixa.querySelector(".stat-card__label, strong");
    return (rotulo ? rotulo.textContent.trim() : el.className) + "|" + (document.querySelector(".tela-header h2")?.textContent || "");
  }
  function prepararReveal() {
    if (reduzido || !("IntersectionObserver" in window)) return;
    if (!io) {
      io = new IntersectionObserver((entradas) => {
        let ordem = 0;
        entradas.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          el.style.setProperty("--d", Math.min(ordem++, 7) * 55 + "ms");
          el.classList.add("rv--in");
          io.unobserve(el);
          contar(el);
        });
      }, { threshold: 0.06, rootMargin: "0px 0px -4% 0px" });
    }
    $$(SEL_REVELAR).forEach((el) => {
      if (el.dataset.rv || el.closest(".overlay")) return;
      el.dataset.rv = "1";
      const k = chaveDe(el);
      if (vistos.has(k)) return;          // já animado antes: aparece direto
      vistos.add(k);
      el.classList.add("rv");
      io.observe(el);
    });
    $$(".stat-card__value, .kcol__cont, .fornecedor-tela-btn__qtd").forEach((el) => {
      if (el.closest(".rv:not(.rv--in)")) return;
      contar(el);
    });
  }
  function contar(raiz) {
    const alvos = raiz.matches && raiz.matches(".stat-card__value, .fornecedor-tela-btn__qtd") ? [raiz] : $$(".stat-card__value, .fornecedor-tela-btn__qtd", raiz);
    alvos.forEach((el) => {
      if (el.dataset.cu) return;
      const texto = el.textContent.trim();
      if (!/^\d{1,5}$/.test(texto)) return;
      el.dataset.cu = "1";
      const chave = chaveContagem(el);
      const fim = Number(texto);
      if (contados.has(chave)) { contados.set(chave, fim); return; }
      contados.set(chave, fim);
      if (reduzido || fim === 0) return;
      const t0 = performance.now(), dur = 700;
      const passo = (t) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = Math.round(fim * e);
        if (p < 1) requestAnimationFrame(passo); else el.textContent = fim;
      };
      el.textContent = "0";
      requestAnimationFrame(passo);
    });
  }

  // ---------- Ondas ao toque + vibração ----------
  document.addEventListener("pointerdown", (e) => {
    if (!ehMobile()) return;
    const alvo = e.target.closest && e.target.closest(".btn, .btn-filtro, .navitem, .fab, .kb-tab, .fornecedor-tela-btn, .tabs button");
    if (!alvo) return;
    if (navigator.vibrate && e.pointerType === "touch" && !alvo.disabled) navigator.vibrate(5);
    if (reduzido || !alvo.classList.contains("btn")) return;
    const r = alvo.getBoundingClientRect();
    const d = Math.max(r.width, r.height);
    const onda = document.createElement("span");
    onda.className = "ripple";
    onda.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    alvo.appendChild(onda);
    setTimeout(() => onda.remove(), 600);
  }, { passive: true });

  // ---------- Observa o que o app desenha (Firestore re-renderiza as listas) ----------
  let agendado = false;
  function varrer() {
    agendado = false;
    if (!ehMobile()) return;
    $$(".kanban").forEach(montarAbas);
    prepararReveal();
  }
  const obs = new MutationObserver(() => { if (!agendado) { agendado = true; requestAnimationFrame(varrer); } });
  function iniciar() {
    obs.observe(document.body, { childList: true, subtree: true });
    varrer();
    aoRolar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();

  const aoMudarTela = () => {
    if (ehMobile()) { varrer(); aoRolar(); }
    else { desmontarAbas(); $$(".rv").forEach((el) => el.classList.remove("rv")); $$(".page-header, .topbar").forEach((el) => el.style.removeProperty("--sy")); document.querySelector(".bottomnav")?.classList.remove("dock-oculto"); }
  };
  if (mq.addEventListener) mq.addEventListener("change", aoMudarTela); else mq.addListener(aoMudarTela);
})();
