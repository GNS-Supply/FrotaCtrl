# FrotaCtrl — Cloudinary aplicado na sua versão atualizada

Estas alterações foram aplicadas em cima do `FrotaCtrl-atualizado.zip` que
você enviou (com suas mudanças de layout), não na versão original. Suas
mudanças de layout/CSS/UI foram todas preservadas — nenhum arquivo de
estilo ou de lógica de tela foi tocado, só a parte de upload de anexos.

## O que mudou (igual à rodada anterior, só que em cima do seu layout novo)

- **`firebase-config.js`** — removida a inicialização do
  `firebase.storage()`; adicionado `CLOUDINARY_CONFIG` com `cloudName`
  (`ukjt4x0w`) e `uploadPreset` (`nuvem_frota_ctrl`).
- **`app.js`** — `enviarArquivo()` reescrita para enviar ao Cloudinary
  (`XMLHttpRequest` para `https://api.cloudinary.com/v1_1/ukjt4x0w/auto/upload`),
  mantendo timeout de 60s, progresso e erro traduzido. `enviarArquivos()`
  não mudou.
- **`diagnostico.js`** — teste de upload agora testa o Cloudinary em vez
  do Storage; teste de configuração valida `CLOUDINARY_CONFIG`.
- **10 HTMLs** — removida a tag `<script>` do `firebase-storage-compat.js`.
- **`README.md`** — seção de setup e anexos atualizada.

Detalhes de cada mudança (por quê, comportamento, etc.) são os mesmos da
entrega anterior — se quiser reler a explicação completa, foi na mensagem
de quando migramos o app pela primeira vez.

## Antes de subir

Confirmei que:
- O patch aplicou **sem nenhum conflito** com suas alterações de layout
- Todos os `.js` passam em `node --check`

Não testei upload real (sem acesso à API do Cloudinary neste ambiente) —
use a página `diagnostico.html` depois de publicar para confirmar.

## Como aplicar

**Opção A — arquivos individuais**: substitua, no seu repositório, os
arquivos com o mesmo nome pelos desta pasta.

**Opção B — patch**: na raiz do seu repositório local,
```
git apply mudancas.patch
```
