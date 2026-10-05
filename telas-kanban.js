// ============================================================
// telas-kanban.js — painel de chamados em "telas" (botões) com kanbans
//
// Cada botão abre uma tela: ou a lista geral (com botão de filtro) ou
// um conjunto de colunas kanban. O número em destaque no botão é a
// quantidade de chamados da tela.
//
// Uso:
//   const painel = TelasKanban.criar({
//     id: "gestao",
//     container: "paineis-gestao",
//     telas: [...],                       // veja gestao-frota.js
//     obter: () => chamadosCache,         // todos os chamados do perfil
//     acoes: (c, coluna) => "<button…>",  // botões de ação do card
//     extra: (c, coluna) => "<div…>"      // linha extra opcional do card
//   });
//   painel.render();
// ============================================================

const TelasKanban = (() => {
  const instancias = {};
  const ENCERRADOS = ["concluido", "cancelado"];
  const porRegistroPadrao = (a, b) => (tsToMs(a.registradoEm) || 0) - (tsToMs(b.registradoEm) || 0);

  const ICONE_FILTRO = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/><circle cx="16" cy="6" r="2.6" fill="currentColor"/><circle cx="8" cy="12" r="2.6" fill="currentColor"/><circle cx="13" cy="18" r="2.6" fill="currentColor"/></svg>`;

  function criar(cfg) {
    // Período padrão da lista geral (dias); sem cfg.periodoPadraoDias mostra todo o período
    const PERIODO_PADRAO = cfg.periodoPadraoDias ? String(cfg.periodoPadraoDias) : "todos";
    const st = {
      telaId: cfg.telas[0].id,
      busca: "",
      lista: { busca: "", status: new Set(), criticidade: new Set(), fluxo: new Set(), periodo: PERIODO_PADRAO, de: "", ate: "" },
      painelAberto: false
    };
    const self = { cfg, st };
    instancias[cfg.id] = self;
    const q = (fn) => `TelasKanban.get('${cfg.id}').${fn}`;

    const todos = () => cfg.obter() || [];
    const telaAtual = () => cfg.telas.find((t) => t.id === st.telaId) || cfg.telas[0];

    function itensDaColuna(col) {
      const base = todos().filter((c) => (col.filtro ? col.filtro(c) : (col.status || []).includes(c.status)));
      return base;
    }
    // ---------- Período (lista geral) ----------
    function dataDoChamado(c) {
      return tsToMs(c.registradoEm) || (c.historico || []).reduce((m, h) => Math.min(m, h.timestamp || Infinity), Infinity) || 0;
    }
    function dentroPeriodo(c) {
      const f = st.lista;
      if (f.periodo === "todos") return true;
      const ms = dataDoChamado(c);
      if (f.periodo === "custom") {
        if (f.de && ms < new Date(f.de + "T00:00:00").getTime()) return false;
        if (f.ate && ms > new Date(f.ate + "T23:59:59.999").getTime()) return false;
        return true;
      }
      return ms >= Date.now() - Number(f.periodo) * 86400000;
    }
    function rotuloPeriodo() {
      const f = st.lista;
      if (f.periodo === "todos") return "todo o período";
      if (f.periodo === "custom") {
        const fmt = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "…";
        return `${fmt(f.de)} a ${fmt(f.ate)}`;
      }
      return `últimos ${f.periodo} dias`;
    }
    function contagemTela(t) {
      if (t.tipo === "lista") return todos().filter(dentroPeriodo).length;
      return t.colunas.reduce((soma, col) => soma + itensDaColuna(col).length, 0);
    }

    // ---------- Card ----------
    function card(c, col) {
      const acoes = cfg.acoes ? cfg.acoes(c, col) : "";
      const ult = (c.historico || []).reduce((m, h) => Math.max(m, h.timestamp || 0), 0) || tsToMs(c.registradoEm) || 0;
      const naEtapa = ult ? msParaDuracao(Date.now() - ult) : "";
      const parada = chamadoParandoMaquina(c);
      return `<div class="kcard ${acoes ? "kcard--acao" : ""} ${classeDestaque(c)}">
        <div class="kcard__top"><a class="kcard__num" href="chamado.html?id=${c.id}">${escapeHtml(c.numeroFrota || "—")}</a>${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : ""}</div>
        ${seloDestaque(c) ? `<div style="margin-bottom:4px;">${seloDestaque(c)}</div>` : ""}
        <div class="kcard__id">${escapeHtml(c.numero || "")}${naEtapa && !ENCERRADOS.includes(c.status) ? ` · <span title="Tempo na etapa atual">${naEtapa} na etapa</span>` : ""}</div>
        ${parada ? `<div class="kcard__parada" title="Máquina parada desde a confirmação P1 / início da avaliação técnica">${icone("alerta", 12)} Máquina parada · <span data-desde="${paradaInfo(c).inicio}">${msParaHMS(Date.now() - paradaInfo(c).inicio)}</span></div>` : ""}
        ${c.fluxo === "mau_uso" ? `<span class="selo-mauuso ${c.parecerMauUso?.resultado === "confirmado" ? "selo-mauuso--confirmado" : ""}">${icone("alerta", 13)} ${c.parecerMauUso?.resultado === "confirmado" ? "Mau uso confirmado" : "Mau uso alegado"}</span>` : ""}
        <div class="kcard__desc">${escapeHtml((c.descricao || "").slice(0, 90))}</div>
        <div class="kcard__local">${escapeHtml(c.plantaNome || "")}${c.setorNome ? " / " + escapeHtml(c.setorNome) : ""}${c.fornecedorNome ? ` · ${escapeHtml(c.fornecedorNome)}` : ""}</div>
        ${cfg.extra ? cfg.extra(c, col) : ""}
        <div class="kcard__acoes">${acoes}<a class="btn btn--secondary btn--sm" href="chamado.html?id=${c.id}">Detalhes</a></div>
      </div>`;
    }

    // ---------- Kanban ----------
    function htmlColunas(tela) {
      return tela.colunas.map((col, i) => {
        let itens = itensDaColuna(col);
        const total = itens.length;
        itens = itens.filter((c) => !st.busca || `${c.numeroFrota || ""} ${c.numero || ""}`.toLowerCase().includes(st.busca));
        itens.sort(comDestaque(col.ordenar || porRegistroPadrao));
        if (col.limite) itens = itens.slice(0, col.limite);
        const nAcao = cfg.acoes ? itensDaColuna(col).filter((c) => cfg.acoes(c, col)).length : 0;
        return `<section class="kcol kcol--${col.cor || "muted"} ${total === 0 ? "kcol--vazia" : ""}">
          <header class="kcol__head">
            <div class="kcol__n">${i + 1}</div>
            <div class="kcol__tit"><div class="kcol__nome">${col.titulo}</div><div class="kcol__sub">${col.sub || ""}</div></div>
            <div class="kcol__cont ${nAcao > 0 ? "kcol__cont--acao" : ""}">${total}</div>
          </header>
          ${nAcao > 0 ? `<div class="kcol__faixa">${nAcao} para você agir</div>` : ""}
          <div class="kcol__corpo">${itens.length ? itens.map((c) => card(c, col)).join("") : `<div class="kcol__vazio">Nenhum chamado</div>`}</div>
          ${col.limite && total > col.limite ? `<div class="kcol__vazio">Mostrando os ${col.limite} mais recentes de ${total}. Use "Todos os chamados" para ver o restante.</div>` : ""}
        </section>`;
      }).join("");
    }
    function atualizarKanban() {
      const el = document.getElementById(`${cfg.id}-kanban`);
      if (el) el.innerHTML = htmlColunas(telaAtual());
    }
    function renderKanban(tela) {
      return `<div class="kb-barra"><input class="kb-busca" type="search" placeholder="Buscar nº da frota ou chamado" value="${escapeHtml(st.busca)}" oninput="${q("setBusca(this.value)")}"></div>
        <div id="${cfg.id}-kanban" class="kanban kanban--${tela.colunas.length}">${htmlColunas(tela)}</div>`;
    }

    // ---------- Lista geral + filtro ----------
    function passaLista(c) {
      const f = st.lista;
      if (!dentroPeriodo(c)) return false;
      if (f.busca && !`${c.numeroFrota || ""} ${c.numero || ""} ${c.descricao || ""} ${c.plantaNome || ""} ${c.setorNome || ""} ${c.fornecedorNome || ""}`.toLowerCase().includes(f.busca)) return false;
      if (f.status.size && !f.status.has(c.status)) return false;
      if (f.criticidade.size && !f.criticidade.has(c.criticidade)) return false;
      if (f.fluxo.size && !f.fluxo.has(c.fluxo || "contratual")) return false;
      return true;
    }
    // Abertos primeiro (mais antigo → mais recente); encerrados depois (mais recentes primeiro)
    function ordenarLista(a, b) {
      const aEnc = ENCERRADOS.includes(a.status), bEnc = ENCERRADOS.includes(b.status);
      if (aEnc !== bEnc) return aEnc ? 1 : -1;
      if (!aEnc) return porRegistroPadrao(a, b);
      return (tsToMs(b.concluidoEm) || tsToMs(b.registradoEm) || 0) - (tsToMs(a.concluidoEm) || tsToMs(a.registradoEm) || 0);
    }
    function totalFiltros() { return st.lista.status.size + st.lista.criticidade.size + st.lista.fluxo.size + (st.lista.periodo !== PERIODO_PADRAO ? 1 : 0); }
    function htmlResultado() {
      const lista = todos().filter(passaLista).sort(comDestaque(ordenarLista));
      const abertos = lista.filter((c) => !ENCERRADOS.includes(c.status)).length;
      return `<div class="lista-total"><strong>${lista.length}</strong> chamados (${rotuloPeriodo()}) · <strong>${abertos}</strong> abertos · <strong>${lista.length - abertos}</strong> encerrados</div>
      <div class="chamados-lista">${lista.length ? lista.map((c) => {
        const enc = ENCERRADOS.includes(c.status);
        return `<a class="chamado-lista-row ${enc ? "chamado-lista-row--encerrado" : ""} ${classeDestaque(c)}" href="chamado.html?id=${c.id}">
          <div class="chamado-lista-row__main"><div class="chamado-lista-row__top"><strong>${escapeHtml(c.numeroFrota || "—")}</strong>${seloDestaque(c)}${c.criticidade ? `<span class="chip chip--${c.criticidade}">${c.criticidade}</span>` : ""}</div><div class="chamado-lista-row__id">${escapeHtml(c.numero || "—")}</div><div class="chamado-lista-row__desc">${escapeHtml(c.descricao || "Sem descrição")}</div></div>
          <div class="chamado-lista-row__status">${badgeHtml(c.status)}<span>${escapeHtml(c.plantaNome || "—")}${c.setorNome ? " · " + escapeHtml(c.setorNome) : ""}</span></div>
        </a>`;
      }).join("") : `<div class="kcol__vazio">Nenhum chamado encontrado com os filtros atuais.</div>`}</div>`;
    }
    function atualizarResultado() {
      const el = document.getElementById(`${cfg.id}-resultado`);
      if (el) el.innerHTML = htmlResultado();
      const n = totalFiltros();
      const badge = document.getElementById(`${cfg.id}-filtro-badge`);
      if (badge) { badge.textContent = n; badge.style.display = n ? "inline-flex" : "none"; }
    }
    function grupo(titulo, campo, opcoes) {
      return `<div class="filtro-grupo"><div class="filtro-grupo__tit">${titulo}</div>${opcoes.map(([v, nome]) =>
        `<label class="filtro-op"><input type="checkbox" ${st.lista[campo].has(v) ? "checked" : ""} onchange="${q(`toggleFiltro('${campo}','${v}',this.checked)`)}"><span>${nome}</span></label>`).join("")}</div>`;
    }
    function renderLista() {
      const statusOpcoes = Object.keys(STATUS_LABELS).filter((s) => todos().some((c) => c.status === s)).map((s) => [s, STATUS_LABELS[s]]);
      const n = totalFiltros();
      return `<div class="lista-barra">
        <input class="kb-busca lista-barra__busca" type="search" placeholder="Buscar frota, chamado, descrição, planta ou fornecedor" value="${escapeHtml(st.lista.busca)}" oninput="${q("setBuscaLista(this.value)")}">
        <button type="button" id="${cfg.id}-btn-filtro" class="btn-filtro ${st.painelAberto ? "kb-filtro--on" : ""}" onclick="${q("togglePainel()")}" aria-label="Filtrar chamados" title="Filtrar chamados">${ICONE_FILTRO}<span id="${cfg.id}-filtro-badge" class="btn-filtro__badge" style="display:${n ? "inline-flex" : "none"};">${n}</span></button>
      </div>
      <div id="${cfg.id}-painel-filtro" class="painel-filtro ${st.painelAberto ? "" : "hidden"}">
        <div class="painel-filtro__grid">
          <div class="filtro-grupo"><div class="filtro-grupo__tit">Período (data de abertura)</div>
            <select class="filtro-select" onchange="${q("setPeriodo(this.value)")}">
              ${[["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["60", "Últimos 60 dias"], ["90", "Últimos 90 dias"], ["180", "Últimos 180 dias"], ["365", "Último ano"], ["todos", "Todo o período"], ["custom", "Personalizado…"]].map(([v, n]) => `<option value="${v}" ${st.lista.periodo === v ? "selected" : ""}>${n}</option>`).join("")}
            </select>
            <div class="filtro-datas" style="display:${st.lista.periodo === "custom" ? "flex" : "none"};">
              <label>De<input type="date" value="${st.lista.de}" onchange="${q("setData('de', this.value)")}"></label>
              <label>Até<input type="date" value="${st.lista.ate}" onchange="${q("setData('ate', this.value)")}"></label>
            </div>
          </div>
          ${grupo("Status", "status", statusOpcoes)}
          ${grupo("Prioridade", "criticidade", [["P1", "P1"], ["P2", "P2"], ["P3", "P3"]])}
          ${grupo("Fluxo", "fluxo", [["contratual", "Contratual"], ["mau_uso", "Mau uso"]])}
        </div>
        <div class="painel-filtro__rodape"><button type="button" class="btn btn--secondary btn--sm" onclick="${q("limparFiltros()")}">Limpar filtros</button></div>
      </div>
      <div id="${cfg.id}-resultado">${htmlResultado()}</div>`;
    }

    // ---------- Render geral ----------
    function render() {
      const wrap = document.getElementById(cfg.container);
      if (!wrap) return;
      const tela = telaAtual();
      wrap.innerHTML = `<div class="fornecedor-telas fornecedor-telas--${cfg.telas.length}">${cfg.telas.map((t) => `
        <button class="fornecedor-tela-btn ${t.id === st.telaId ? "active" : ""}" onclick="${q(`setTela('${t.id}')`)}">
          <span class="fornecedor-tela-btn__txt"><strong>${t.titulo}</strong><small>${t.subtitulo}</small></span>
          <b class="fornecedor-tela-btn__qtd">${contagemTela(t)}</b>
        </button>`).join("")}</div>
        <div class="tela-header"><div><h2>${tela.titulo}</h2><p>${tela.subtitulo}</p></div></div>
        ${tela.tipo === "lista" ? renderLista() : renderKanban(tela)}`;
      wrap.querySelector(".fornecedor-tela-btn.active")?.scrollIntoView({ inline: "center", block: "nearest" });
    }

    Object.assign(self, {
      render,
      setTela(id) { st.telaId = id; st.busca = ""; render(); },
      setBusca(v) { st.busca = v.trim().toLowerCase(); atualizarKanban(); },
      setBuscaLista(v) { st.lista.busca = v.trim().toLowerCase(); atualizarResultado(); },
      toggleFiltro(campo, valor, marcado) { if (marcado) st.lista[campo].add(valor); else st.lista[campo].delete(valor); atualizarResultado(); },
      limparFiltros() {
        st.lista.status.clear(); st.lista.criticidade.clear(); st.lista.fluxo.clear();
        st.lista.periodo = PERIODO_PADRAO; st.lista.de = ""; st.lista.ate = "";
        render();
      },
      setPeriodo(v) { st.lista.periodo = v; render(); },
      setData(campo, v) { st.lista[campo] = v; render(); },
      togglePainel() {
        st.painelAberto = !st.painelAberto;
        document.getElementById(`${cfg.id}-painel-filtro`)?.classList.toggle("hidden", !st.painelAberto);
        document.getElementById(`${cfg.id}-btn-filtro`)?.classList.toggle("kb-filtro--on", st.painelAberto);
      }
    });
    return self;
  }

  return { criar, get: (id) => instancias[id] };
})();
