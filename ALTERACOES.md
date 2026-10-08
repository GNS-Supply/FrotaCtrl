# Alterações desta rodada

- **Equipamento**: campo "criticidade" trocado por "Número de série" (texto).
- **Novo chamado** (`novo-chamado.js`, compartilhado): agora Solicitante **e** Gestão de Frota abrem chamados.
  Todos os campos e o anexo são obrigatórios. Chamado aberto pela Gestão já nasce com a triagem concluída (`em_triagem`).
- **Campos obrigatórios** marcados com `*` automaticamente em todos os formulários (`marcarObrigatorios()` em `app.js`).
- **Destaque de prioridade** (Gestão de Frota): na tela do chamado, "Destacar chamado" (somente na etapa atual ou até o final).
  Aparece com selo "Prioridade" e sempre no topo das listas de todos os perfis.
- **Anexos**: aceitam imagem, vídeo, PDF, TXT/CSV, Word e Excel. PDF/Word/Excel/texto são enviados ao Cloudinary como `raw`
  (mantendo a extensão) e exibidos como cartão com nome e link — não mais como imagem quebrada.
- **Contestação do aprovador**: Aprovador contesta (desconto / mau uso) → Gestão de Frota avalia → responde ao aprovador
  (volta para "aguardando ciência") ou encaminha ao fornecedor → fornecedor responde → volta à Gestão (ciclo repetível).
  Novos status: `contestacao_gestao` e `contestacao_fornecedor`.
- **Telas em sobreposição** com no mínimo 70% da largura (formulários em 2 colunas no desktop).
- **Usuário Fornecedor**: ao criar ou trocar o perfil para Fornecedor, nome da empresa e telefone de contato são obrigatórios.
- **Perfil**: botão "Alterar minha senha" (pede a senha atual).
- **Login**: "Esqueci minha senha" envia e-mail de recuperação do Firebase.
- **`firestore.rules`**: Gestão de Frota autorizada a criar chamados — **publique as regras no Firebase**.

# Rodada 2

- **Fluxo pós-liberação (mau uso)**: fornecedor libera → `aguardando_ordem_compra` (Gestão anexa OC em PDF) → `aguardando_nf`
  (fornecedor anexa NF em PDF) → novo status `aguardando_conclusao` (Gestão conclui). Chamados antigos parados em `liberado` também aparecem na fila da Gestão.
  Chamados contratuais continuam concluindo direto na liberação.
- **Tempo de máquina parada** (`paradaInfo` em `app.js`): P1 confirmado na triagem começa na confirmação; P2/P3 começa no início da avaliação técnica;
  termina quando o fornecedor libera. Separado do tempo por etapa.
- **Indicadores** (`indicadoresFrota`): total / paradas / operando com restrição / % em funcionamento — painel da Gestão e Dashboard.
- **Linha do tempo linear** no chamado: cada passagem (inclusive idas e voltas) com usuário, data/hora com segundos, comentários, anexos e tempo (h/min/s) na etapa.
- **Fila da Gestão**: 6 telas (`telas-kanban.js`): Todos (filtro) · Triagem e acionamento · Mau uso · Contestações · Execução · Notas fiscais e concluídos.
- **Fornecedor**: tela Mau uso com 3 kanbans (contestado / aguardando Manutenção / Renegociação). Resposta da renegociação: Aceito/Negado,
  manter ou reclassificar o mau uso, novo valor e novo documento.
- **PDF com erro 401 (Cloudinary)**: configuração da conta — Settings → Security → "Restricted media types": liberar PDF.

# Rodada 3 (layout)

- **Gestão › Todos os chamados**: lista e contagem do botão usam, por padrão, os últimos 60 dias (data de abertura). O botão de filtro tem "Período" (7/30/60/90/180 dias, 1 ano, todo o período ou datas personalizadas).
- **Gestão › Notas fiscais**: só 2 kanbans — Aguardando NF e NF recebidas (concluídos ficam em "Todos os chamados").
- **Linha do tempo detalhada**: cada etapa mostra "Aguardando: <tipo de usuário>" (quem devia agir) e há um resumo com o tempo total esperando cada responsável.
- **Sem informação repetida**: removido o bloco extra de detalhes; clicar numa etapa do resumo rola até a(s) etapa(s) na linha do tempo detalhada e a destaca. O selo "repetiu N×" não aparece mais em "Chamado aberto".
- **Pop-up de novo chamado** passou a ficar acima do menu lateral/topo (z-index 90).

# Rodada 4 (frota)

- **Lista de frota** (Gestão › Frota) em cartões de linha, como no anexo: faixa amarela + nº da frota grande, modelo, planta/setor,
  capacidade – combustível – ano (e S/N), horímetro, recorrência (sirene / atenção), situação (PARADA / operacional / com restrição),
  chamado aberto ("Pendente com …", abre o chamado) e total de chamados, lápis para editar. Clicar no cartão ainda expande o histórico.
- A situação PARADA / com restrição segue as mesmas regras dos indicadores da frota.
- **Menu "Frota"** com ícone de empilhadeira.

# Rodada 5 (acabamento, PWA e mobile)

- **Lista de frota** refeita com colunas de largura fixa (tudo alinhado), cartão branco com sombra suave, tipografia do sistema
  (Oswald no número, Inter no resto), cápsulas para capacidade/combustível/ano/S-N, ícones de traço único e cores do design
  (vermelho = parada/alta recorrência, âmbar = atenção/restrição, verde = operacional), chamado aberto em destaque clicável.
- **PWA instalável**: `manifest.webmanifest`, `sw.js` (cache + offline), `offline.html`, ícones do "F" (192/512/maskable/apple-touch),
  `pwa.js` (convite de instalação no Android, instruções no iPhone, botão "Instalar aplicativo" no perfil, aviso de nova versão e de falta de conexão).
  Guia em `INSTALAR-APP.md`.
- **Mobile com cara de app**: menu inferior estilo tab bar com safe-area, abas e kanbans deslizantes (swipe), pop-ups como bottom sheets
  (arrastar para baixo fecha; botão Voltar do Android fecha a tela aberta), campos de 16px/48px (sem zoom no iPhone), alvos de toque
  grandes, feedback ao toque, transição entre abas, status bar e notch tratados.

# Rodada 6 (Painel Master › Apagar dados)

- Novo card **"Apagar dados do banco"** no Painel Master: escolha dados específicos (chamados, numeração dos chamados, equipamentos,
  plantas e setores, parâmetros, usuários) ou **"Apagar TUDO (100%)"** para reiniciar o aplicativo.
- Cada opção mostra quantos registros existem. Usuários: a conta Master e o registro de bootstrap nunca são apagados.
- Confirmação em duas etapas: **"Tem certeza?"** (com o resumo do que será apagado) → **digitar o e-mail completo** da conta Master.
  O botão final só habilita quando o e-mail confere; durante a exclusão não dá para fechar a tela.
- Exclusão em lotes de 400 com progresso por item e relatório final.
- `firestore.rules`: apenas o administrador pode apagar chamados — **publique as regras novamente no Firebase**.
- Login: quem teve o cadastro apagado vê mensagem clara em vez de erro genérico.
- Não são apagados: anexos no Cloudinary e contas de login no Firebase Authentication.

# Rodada 7 (mobile autoral + PWA completo)

- **Visual mobile novo** (`mobile.css`, só abaixo de 900px): cabeçalho escuro em camadas com anel e faixa de alerta que se movem ao rolar,
  indicadores em "tijolos" escalonados com números grandes (o primeiro de grupos ímpares ocupa a largura toda), cartões com cantos assimétricos
  e sombras profundas, botões e ações com sombra "carimbo" que afunda ao toque, folhas (pop-ups) com faixa de alerta, login com hero e cartão sobreposto.
- **Menu flutuante** (dock): ícones; a aba ativa vira uma pílula âmbar com o nome; some ao rolar para baixo e volta ao subir; some com o teclado aberto.
- **Sem rolagem lateral**: kanbans viram **abas com indicador deslizante** (uma coluna por vez, contagem em cada aba e alerta quando há ação sua);
  botões de tela viram **ladrilhos** (grade 2 colunas); abas de página em grade; gráficos com rótulos abreviados e fontes menores no celular.
- **Microinterações** (`mobile-ui.js`): cartões aparecem em cascata ao rolar, números contam de 0 ao valor na primeira exibição,
  ondas ao toque nos botões, vibração leve, quique no ícone ativo, anel pulsante no botão flutuante.
- **PWA**: barra de status translúcida (conteúdo vai até o topo), imagens de abertura para 11 modelos de iPhone, `prefer_related_applications=false`,
  cache do Chart.js e service worker `v2` (aumente a versão em `sw.js` para forçar atualização).
- `Respeita "reduzir movimento"` do aparelho: animações desligadas.

# Rodada 8 (instalação + alinhamento)

- **Instalação**: manifesto simplificado e com identidade própria (`id: frotactrl-app`, `start_url: ./index.html`), service worker `v3`,
  nova página **`instalar.html`** de diagnóstico no próprio celular (HTTPS, navegador/webview, modo computador, manifesto, ícones, service worker,
  convite do navegador, relatório copiável) e links para ela na tela de login e no aviso de instalação.
- **Indicadores da Gestão** alinhados: cartões da mesma linha com a mesma altura, número no topo e rótulo na base. Removido o escalonamento
  e também o recuo alternado de cartões em listas e na frota, para tudo ficar na mesma linha.
