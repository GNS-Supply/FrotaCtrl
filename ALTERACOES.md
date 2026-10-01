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
