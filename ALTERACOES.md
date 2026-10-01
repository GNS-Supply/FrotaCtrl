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
