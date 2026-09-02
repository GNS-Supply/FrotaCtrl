# FrotaCTRL

Plataforma de gestão de frota — chamados de manutenção, mau uso, custos e
recorrência. HTML + CSS + JavaScript puro (sem build), Firebase (Auth,
Firestore, Storage), pronta para GitHub Pages. Todos os arquivos ficam na
raiz do repositório.

Esta versão segue o direcionamento funcional "Plataforma de Gestão de
Frota" (Magius/MGPress): 6 perfis, cadastro mestre de equipamentos,
workflow completo com validação de mau uso, aprovação financeira,
recorrência e 4 dashboards.

## Estrutura de arquivos

```
index.html / auth.js          → login e cadastro (6 perfis)
solicitante.html / .js         → abre chamados a partir do equipamento cadastrado
gestao-frota.html / .js        → triagem, aciona fornecedor, autoriza, cadastro de equipamentos
fornecedor.html / .js          → atendimento, diagnóstico, execução, liberação, faturamento
manutencao.html / .js          → validação de mau uso (parecer técnico)
aprovador.html / .js           → aprovação financeira
administrador.html / .js       → plantas, setores, parâmetros de recorrência, usuários
chamado.html / .js             → detalhe completo (timeline, financeiro, pareceres)
dashboard.html / .js           → indicadores: operacional, mau uso, financeiro, recorrência
app.js                         → constantes e utilitários compartilhados
firebase-config.js             → suas credenciais do Firebase (edite este arquivo)
style.css                      → visual do app
firestore.rules / storage.rules → regras de segurança (colar no console do Firebase)
```

## Setup (Firebase)

1. Crie um projeto em https://console.firebase.google.com
2. **Authentication** → ative o provedor E-mail/senha
3. **Firestore Database** → crie em modo produção
4. **Storage** → ative
5. **Configurações do projeto → Seus apps** → registre um app Web, copie o
   `firebaseConfig` e cole em `firebase-config.js`
6. Cole `firestore.rules` e `storage.rules` nas respectivas abas "Regras"
   do console e publique
7. **Authentication → Settings → Authorized domains**: adicione o domínio
   do GitHub Pages
8. Suba os arquivos para a raiz do repositório e ative GitHub Pages em
   Settings → Pages → Deploy from branch → `main` → `/ (root)`

**Primeiro uso**: a primeira pessoa a criar uma conta na tela de login vira
automaticamente **Administrador master**, com permissões totais — veja
"Cadastro de usuários" abaixo. Depois, como Administrador, cadastre ao
menos uma Planta e um Setor; como Gestão de Frota, cadastre os
equipamentos antes de pedir para o Solicitante abrir chamados.

## Cadastro de usuários

O cadastro é **interno** — não é uma tela pública de "crie sua conta e
escolha seu perfil":

- A **primeira conta** criada em toda a plataforma vira Administrador
  **master** automaticamente (permissões totais, não pode ser bloqueado
  ou ter o perfil alterado por outro admin).
- Qualquer autocadastro **seguinte**, feito pela própria pessoa na tela de
  login, entra sempre com o perfil **Solicitante** — sem escolha. Um
  Administrador ajusta o perfil depois, se for o caso.
- **Administradores** cadastram colaboradores internos (Gestão de Frota,
  Manutenção Magius, Aprovador, outros Administradores) e fornecedores
  externos diretamente pelo painel **Administrador → Usuários**, já
  definindo o perfil e uma senha temporária.
- Administradores também podem **trocar o perfil** de qualquer usuário
  (exceto o master) e **bloquear/desbloquear** acessos a qualquer momento
  — uma conta bloqueada é deslogada automaticamente na próxima tentativa
  de uso.

## Perfis e responsabilidades

| Perfil | Faz |
|---|---|
| **Solicitante** | Abre chamado (seleciona equipamento, não digita), anexa fotos, acompanha |
| **Gestão de Frota** | Triagem, aciona fornecedor, decide contestação de mau uso, autoriza execução, cadastra equipamentos |
| **Fornecedor** | Programa atendimento, avalia tecnicamente, emite diagnóstico (indica mau uso ou não), executa, testa, libera, fatura |
| **Manutenção Magius** | Valida os casos de mau uso apontados pelo fornecedor e emite parecer (confirmado / não confirmado / inconclusivo) com justificativa obrigatória |
| **Aprovador** | Aprova, reprova ou pede esclarecimento sobre o valor validado nos casos de mau uso confirmado |
| **Administrador** | Cadastra plantas/setores, define os parâmetros de recorrência, vê todos os usuários |

## Fluxo implementado

```
Registrado → Em triagem → Fornecedor acionado → Atendimento programado
→ Em avaliação técnica → Diagnóstico
   ├─ Contratual (sem mau uso) → Aguardando autorização → Em manutenção
   │                              → Em teste → Liberado → Faturamento → Concluído
   └─ Mau uso indicado → Aguardando validação (Manutenção Magius)
        ├─ Confirmado → Aguardando aprovação (Aprovador)
        │     ├─ Aprovado → Aguardando autorização → (segue fluxo acima)
        │     ├─ Reprovado → (encerra)
        │     └─ Esclarecimento → volta para Aguardando documentação
        ├─ Não confirmado → Mau uso contestado → Gestão de Frota decide:
        │     "aceitar contestação" (vira contratual, registra custo evitado)
        │     ou "reabrir avaliação"
        └─ Inconclusivo → Aguardando documentação → fornecedor complementa → Aguardando validação novamente
```

Cada transição grava, no array `historico` do chamado: status, timestamp,
autor, **perfil** e observação — servindo como log de auditoria.

## Recorrência

O nível de recorrência (Normal / Atenção / Alta) é **calculado
dinamicamente** por equipamento a partir da quantidade de chamados dentro
da janela de dias configurada em **Administrador → Parâmetros** (não é um
job em segundo plano — é recalculado toda vez que a tela é aberta, o que é
suficiente para o volume de uma frota).

## O que foi simplificado em relação ao PDF (e por quê)

- **Notificações por e-mail**: não implementadas. O app é 100% estático
  (GitHub Pages + Firebase client-side); enviar e-mail em cada mudança de
  status exige um backend (Firebase Cloud Functions, que é um plano pago
  do Firebase e sai do escopo "hospedar no GitHub"). Hoje a atualização é
  em tempo real na tela (Firestore `onSnapshot`), mas não fora do app.
- **QR Code na abertura do chamado**: não implementado (o PDF já marca
  como "Evolução futura", fase 2).
- **Alçadas de aprovação automáticas por valor**: existe um único perfil
  Aprovador; o PDF também descreve isso como parametrizável a evoluir.
- **Categorias de avaria e status operacionais**: estão fixos no código
  (`app.js`), não editáveis pelo Administrador ainda — plantas, setores e
  parâmetros de recorrência já são editáveis.
- **Plano de ação por recorrência**: o PDF marca como Fase 2; não incluído.

Tudo isso está isolado e é possível evoluir depois sem redesenhar o
modelo de dados atual.
