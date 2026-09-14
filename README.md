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

## Conta master ("administrador") e cadastro de usuários

O perfil **"administrador"** não é mais um perfil operacional — é a conta
**master**, reservada para quem mantém o site (o "desenvolvedor"):

- A **primeira conta** criada em toda a plataforma vira administrador
  master automaticamente, com **acesso irrestrito a qualquer tela**
  (`requireAuth` deixa essa conta passar por qualquer checagem de perfil).
  Ela abre em `administrador.html`, um hub com atalhos para todos os
  painéis.
- Essa conta **nunca aparece na lista de usuários** e não pode ser criada
  por ninguém pela interface — só existe pela primeira conta cadastrada,
  ou editando o campo `tipo` diretamente no Firestore para quem precisar
  assumir esse papel depois.
- Qualquer autocadastro **seguinte**, feito pela própria pessoa na tela de
  login, entra sempre com o perfil **Solicitante** — sem escolha.

Todas as funções administrativas do dia a dia agora pertencem ao
**Gestão de Frota**, na aba **Cadastros** do próprio painel dele:
- Criar/editar/excluir **Plantas** e **Setores**
- Editar os **Parâmetros de recorrência**
- **Cadastrar** colaboradores internos ou fornecedores externos (com
  perfil e senha temporária já definidos), **trocar o perfil** de
  qualquer usuário, **bloquear/desbloquear** e **excluir** o acesso de
  alguém

Sobre "excluir" usuário: isso remove o perfil da pessoa no Firestore — ela
é barrada no próximo carregamento da página (`requireAuth` verifica se o
documento ainda existe). O login (conta no Firebase Authentication) não é
apagado automaticamente junto, porque isso exige o Admin SDK (backend),
fora do escopo de um app 100% estático — para remover de vez o login,
apague a conta manualmente em Authentication no console do Firebase.
"Bloquear" é o controle recomendado para o dia a dia; "Excluir" é para
remover de vez do quadro de usuários.

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

Segue o fluxograma definido pelo usuário:

```
Registrado → Em triagem (Gestão revisa criticidade/descrição) → Fornecedor
acionado → Atendimento programado (data/hora fica visível pra todos) →
Em avaliação técnica (começa a contar o tempo de manutenção) → Diagnóstico
   ├─ Contratual (sem mau uso) → Aguardando autorização → Em execução/teste
   │                              → Liberado = Concluído (sem papelada extra)
   └─ Mau uso indicado (valor + evidências obrigatórios)
        → Aguardando validação (Manutenção Magius — sem acesso a valores)
             ├─ Confirmado → Aguardando ciência (Aprovador só dá OK,
             │     não recusa) → Aguardando autorização → Em execução/teste
             │     → Liberado (fornecedor anexa orçamento final) →
             │     Aguardando ordem de compra (Gestão anexa) →
             │     Aguardando NF (Fornecedor anexa) → Concluído
             └─ Não confirmado OU inconclusivo → Diagnóstico contestado
                   → volta pro Fornecedor dar um NOVO diagnóstico → volta
                   pra Manutenção validar de novo — repete até as duas
                   partes chegarem a um acordo (confirmado ou não).
                   Se o fornecedor desistir do mau uso, o valor original
                   inteiro vira "custo evitado" nos indicadores.
```

Cada transição grava, no array `historico` do chamado: status, timestamp,
autor, **perfil**, observação, **e os dados específicos preenchidos
naquela etapa** (`historico[].dados`) — isso alimenta tanto o log de
auditoria quanto os blocos "Etapas do chamado" na tela de detalhe, que
mostram exatamente o que cada pessoa preencheu, separado por seção.

**Regras de negócio específicas desse fluxo:**
- Diagnóstico de mau uso: valor **obrigatório** e ao menos 1 anexo
  **obrigatório**. Sem mau uso: campo de valor fica desabilitado e anexos
  são opcionais.
- Manutenção Magius **nunca vê valores** — nem no card da fila, nem no
  parecer, nem no detalhe do chamado (o bloco Financeiro é escondido pra
  esse perfil).
- Só o **fornecedor** redefine o valor em caso de nova rodada de
  diagnóstico — a Gestão de Frota não decide mais contestação.
- Fluxo contratual não passa por aprovador/ordem de compra/NF — liberar a
  máquina já encerra o chamado.

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
