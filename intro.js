// ============================================================
// intro.js — animação de abertura do aplicativo
// Fundo todo escuro, o "F" (sem quadrado) se desenha em âmbar,
// acende e some; texto pequeno na base com a autoria.
// Aparece só quando o app é aberto instalado (modo aplicativo),
// uma vez por abertura. Para testar no navegador: adicione ?intro
// ao endereço (ex.: .../index.html?intro).
// Script pequeno e síncrono de propósito: assim a abertura cobre a
// tela antes de qualquer conteúdo aparecer.
// ============================================================
(function () {
  "use strict";
  try {
    var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
    var forcar = /[?&]intro(=|&|$)/.test(location.search);
    if (!standalone && !forcar) return;
    if (!forcar && sessionStorage.getItem("frotactrl.intro")) return;
    sessionStorage.setItem("frotactrl.intro", "1");
  } catch (e) { return; }

  var reduzido = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var DURACAO = reduzido ? 700 : 2300;

  var css =
    "#intro-app{position:fixed;inset:0;z-index:2147483000;background:#101922;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
    "transition:opacity .45s ease,transform .45s ease;touch-action:manipulation;-webkit-tap-highlight-color:transparent}" +
    "#intro-app.sai{opacity:0;transform:scale(1.04);pointer-events:none}" +
    "#intro-app .ia-halo{position:absolute;width:62vmin;height:62vmin;border-radius:50%;background:radial-gradient(circle,rgba(232,163,61,.32),rgba(232,163,61,0) 68%);" +
    "opacity:0;transform:scale(.6);animation:ia-halo 1.5s .35s cubic-bezier(.2,.8,.2,1) forwards}" +
    "#intro-app svg{position:relative;width:min(34vmin,190px);height:auto;overflow:visible;filter:drop-shadow(0 0 0 rgba(232,163,61,0));animation:ia-brilho 1.2s 1.05s ease-out forwards}" +
    "#intro-app .ia-tr{fill:none;stroke:#E8A33D;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round;stroke-dasharray:1;stroke-dashoffset:1;animation:ia-desenha 1.05s .15s cubic-bezier(.65,0,.35,1) forwards}" +
    "#intro-app .ia-pre{fill:#E8A33D;opacity:0;animation:ia-preenche .6s .85s ease-out forwards}" +
    "#intro-app .ia-faixa{position:relative;height:5px;width:0;margin-top:22px;border-radius:2px;" +
    "background:repeating-linear-gradient(-45deg,#E8A33D 0 7px,#101922 7px 14px);animation:ia-faixa .8s 1.15s cubic-bezier(.2,.8,.2,1) forwards}" +
    "#intro-app .ia-nome{position:relative;margin-top:16px;color:#fff;font:500 15px/1 Oswald,'Arial Narrow',Inter,sans-serif;letter-spacing:.42em;text-indent:.42em;text-transform:uppercase;" +
    "opacity:0;transform:translateY(8px);animation:ia-sobe .7s 1.3s ease-out forwards}" +
    "#intro-app .ia-rodape{position:absolute;left:0;right:0;bottom:calc(22px + env(safe-area-inset-bottom));text-align:center;color:rgba(255,255,255,.55);" +
    "font:400 11px/1.3 Inter,system-ui,sans-serif;letter-spacing:.06em;opacity:0;animation:ia-rodape .8s .9s ease-out forwards}" +
    "@keyframes ia-desenha{to{stroke-dashoffset:0}}" +
    "@keyframes ia-preenche{to{opacity:1}}" +
    "@keyframes ia-brilho{0%{filter:drop-shadow(0 0 0 rgba(232,163,61,0))}45%{filter:drop-shadow(0 0 26px rgba(232,163,61,.75))}100%{filter:drop-shadow(0 0 12px rgba(232,163,61,.35))}}" +
    "@keyframes ia-halo{to{opacity:1;transform:scale(1)}}" +
    "@keyframes ia-faixa{to{width:min(34vmin,190px)}}" +
    "@keyframes ia-sobe{to{opacity:1;transform:none}}" +
    "@keyframes ia-rodape{to{opacity:1}}" +
    "@media (prefers-reduced-motion:reduce){#intro-app *{animation-duration:.01ms!important;animation-delay:0ms!important}}";

  var estilo = document.createElement("style");
  estilo.textContent = css;
  (document.head || document.documentElement).appendChild(estilo);

  var el = document.createElement("div");
  el.id = "intro-app";
  el.setAttribute("role", "presentation");
  el.innerHTML =
    '<div class="ia-halo"></div>' +
    '<svg viewBox="0 0 100 120" aria-hidden="true">' +
    '<path class="ia-pre" fill="#E8A33D" d="M22 10H78V27H43V53H70.2V70H43V110H22Z"/>' +
    '<path class="ia-tr" fill="none" stroke="#E8A33D" stroke-width="2.4" pathLength="1" d="M22 10H78V27H43V53H70.2V70H43V110H22Z"/>' +
    "</svg>" +
    '<div class="ia-faixa"></div>' +
    '<div class="ia-nome">FrotaCTRL</div>' +
    '<div class="ia-rodape">Desenvolvido por Genesis A. Goncalves</div>';
  document.documentElement.appendChild(el);

  var fechado = false;
  function fechar() {
    if (fechado) return;
    fechado = true;
    el.classList.add("sai");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); if (estilo.parentNode) estilo.parentNode.removeChild(estilo); }, 520);
  }
  el.addEventListener("click", fechar);          // toque para pular
  setTimeout(fechar, DURACAO);
})();
