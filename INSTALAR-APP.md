# FrotaCTRL como aplicativo (PWA)

O sistema já está configurado como PWA: pode ser instalado no celular (Android e iPhone) e abre em tela cheia, com o ícone **F**, sem barra do navegador.

## Requisito
O endereço precisa ser **HTTPS** — o GitHub Pages já é. Publique **todos** os arquivos desta pasta (inclusive `icons/`, `manifest.webmanifest`, `sw.js`, `offline.html` e `pwa.js`).

## Como instalar
**Android (Chrome)**
1. Abra o endereço do sistema no Chrome.
2. Aparece a faixa "Instale o FrotaCTRL…" → toque em **Instalar**.
   Se não aparecer: menu **⋮ → Instalar aplicativo** (ou "Adicionar à tela inicial").
3. Também há o botão **Instalar aplicativo** no Perfil de qualquer usuário.

**iPhone (Safari — precisa ser o Safari)**
1. Abra o endereço no Safari.
2. Toque em **Compartilhar** (quadrado com seta ↑).
3. **Adicionar à Tela de Início → Adicionar.**

## Como o app se comporta depois de instalado
- Abre em **tela cheia**, sem barra de endereço, com tela de abertura escura com o **F** (no iPhone há uma imagem de abertura para cada modelo).
- Barra de status do celular integrada ao topo escuro do app; menu flutuante embaixo que some ao rolar para baixo.
- Botão **Voltar** do Android fecha a tela aberta (formulários, filtros) em vez de sair do app; arrastar uma folha para baixo também fecha.
- Nenhuma tela rola para o lado: kanbans viram **abas**, os botões de tela viram **ladrilhos** e os gráficos se ajustam à largura.

## Atualizações
- Com internet, o app sempre busca a versão mais nova dos arquivos.
- Quando você publicar uma versão nova, o app mostra a faixa **"Nova versão disponível — Atualizar"**.
- Para forçar a troca do cache de todos: aumente `VERSAO` no topo do `sw.js` (ex.: `frotactrl-v2`).

## Sem internet
O app abre (tela "Sem conexão" ou a última tela visitada), mas **os dados vêm do Firebase e exigem internet**.

## Se algo não aparecer
- Ícone antigo / app sem atualizar: remova o app da tela inicial e instale de novo, ou limpe os dados do site.
- Chrome no computador: F12 → Application → Manifest / Service Workers mostram erros de configuração.
- Teste de qualidade: Chrome → Lighthouse → categoria "Progressive Web App".

## Arquivos do PWA
`manifest.webmanifest` · `sw.js` · `pwa.js` · `offline.html` · `mobile.css` · `mobile-ui.js` · `icons/` (192, 512, maskable, apple-touch-icon, favicons) · `icons/splash/` (aberturas do iPhone)
