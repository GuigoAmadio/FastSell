# FastSell · Sprint 3

Revisão das US 03, 04, 06 e 08, catálogo para as US 11 e 13 (com a nova US 31) e implementação das US 09, 10, 12, 14 e 15.

Card da US 31: [`historias/US31_Catalogo_Base.pdf`](historias/US31_Catalogo_Base.pdf) (gerado por `historias/gerar_us31_pdf.py`).

---

## Ponto de partida

O FastSell tinha só a parte de conta: login, 2FA, recuperação de senha, bloqueio, perfil, endereços, sessões e auditoria. Isso rodava em NestJS + Prisma/PostgreSQL + Redis na API e Flutter no app.

**Não existia nenhuma tabela de produto, pedido, carrinho, favorito, avaliação ou preferência de notificação.** Por isso as US 11 e 13 não tinham onde se apoiar. A US 31 cria essa base.

Decisões combinadas antes de começar:
- **Checkout mínimo.** O carrinho vira um pedido `CONFIRMED`, sem cobrança, porque pagamento é das US 18/19. Esse pedido é a prova de compra da US 12 e o histórico fiscal da US 09.
- **Catálogo.** Vem de um seed de demonstração. O cadastro e a edição de produtos ficam numa API restrita ao papel ADMIN.
- **Frete.** Feito com o Melhor Envio. Sem credencial, a API responde que o frete está indisponível.

---

## Por história

### US 03 · Recuperação de senha
- **Antes:** o link já expirava em 24h e a senha forte já era exigida. Mas:
  - pedir um link novo não invalidava os anteriores;
  - o botão do e-mail apontava para `/reset-password`, rota que não existia (404);
  - app e API tinham regras de senha diferentes: a API exigia letra minúscula e o app aceitava menos símbolos.
- **Feito:**
  - só o link mais recente vale, e cada token é usado uma vez só (consumo atômico);
  - criada a página `/reset-password`, que abre o app;
  - template de e-mail com nome escapado e prazo vindo da config;
  - limite de 5 pedidos por hora por conta;
  - regra de senha única nos dois lados: 8+ caracteres, letra, número e símbolo;
  - a tela de nova senha avisa quando o link chega sem token.
- **Arquivos:** `auth.service.ts`, `reset-page.controller.ts`, `mail.service.ts`, `common/validators.ts`, `dto/auth.dto.ts`, `reset_password_screen.dart`, `register_screen.dart`, `core/validators.dart`.
- **Critérios:** expiração em 24h ✔ · senha forte ✔ (testados).

### US 04 · Bloqueio por tentativas
- **Antes:**
  - o bloqueio vivia só no Redis: um restart liberava a conta;
  - o contador por IP era gravado, mas nunca bloqueava nada;
  - tentativas com e-mail inexistente não contavam;
  - uma falha de SMTP transformava o 401 em 500;
  - qualquer cliente podia forjar o IP pelo `X-Forwarded-For`.
- **Feito:**
  - `User.lockedUntil` persiste o bloqueio no banco;
  - bloqueio por IP com limite próprio (`LOGIN_IP_MAX_ATTEMPTS`, padrão 20) que conta também e-mails inexistentes;
  - envio do alerta protegido contra falha de SMTP;
  - `X-Forwarded-For` só é usado com `TRUST_PROXY=1`;
  - redefinir a senha libera a conta.
  - O bloqueio do 2FA (3 erros de OTP) continua separado e não foi alterado.
- **Arquivos:** `auth.service.ts`, `auth.controller.ts`, migration da sprint.
- **Critérios:** 15 min após 5 falhas seguidas ✔ · e-mail de alerta ✔. O alerta sai pelo SMTP quando ele está configurado; sem SMTP vai para o log.

### US 06 · Perfil e CPF
- **Antes:**
  - o CPF só conferia se tinha 11 dígitos, então `111.111.111-11` passava;
  - o app exigia CPF e telefone até para trocar só o nome;
  - o upload de foto confiava no tipo informado pelo cliente, e um tipo inválido devolvia 500.
- **Feito:**
  - CPF validado pelos dígitos verificadores, com a mesma regra no app e na API (aceita com ou sem máscara e grava só os dígitos);
  - telefone validado (DDD e celular com 9) e convertido para E.164 no SMS;
  - campo vazio apaga o dado, e o app envia só os campos alterados;
  - a foto tem a assinatura PNG/JPG conferida e a foto antiga é apagada;
  - **armazenamento em nuvem:** com `STORAGE_DRIVER=s3` as fotos vão para um bucket S3 ou compatível (AWS, Cloudflare R2, MinIO); sem isso ficam em `api/uploads`. Vale para avatar, produtos e avaliações.
- **Arquivos:** `common/validators.ts`, `dto/auth.dto.ts`, `common/uploads.ts`, `storage/storage.service.ts`, `profile_screen.dart`, `core/validators.dart`, `core/input_masks.dart`, `core/image_upload.dart`.
- **Critérios:** foto PNG/JPG até 5MB ✔ · máscaras + validação real de CPF e telefone ✔ · upload para bucket ✔ (testado contra um servidor S3 local; com uma conta real é só preencher o `.env`).
- **Configurar o bucket:** leitura pública dos objetos (bucket policy `s3:GetObject`) e CORS liberando GET para o endereço do app web.

### US 08 · Preferências de notificação
- **Antes:** não existia.
- **Feito:**
  - tabela `NotificationPreference` com 5 campos independentes: os canais E-mail, Push e SMS e as categorias Pedidos e Promoções;
  - PATCH parcial: marcar uma opção não mexe nas outras;
  - fila BullMQ sobre o Redis que o projeto já usa;
  - uma mensagem só sai por um canal quando **o canal e a categoria** estão ligados. A regra é reconferida no momento do envio, e cada decisão fica registrada em `NotificationDelivery`;
  - padrões: Pedidos ligado, Promoções desligado (opt-in), SMS desligado;
  - alertas de segurança ignoram as preferências e sempre vão por e-mail;
  - tela com checkboxes no app.
- **Arquivos:** `src/notifications/*`, `notification_preferences_screen.dart`.
- **Critério:** checkboxes independentes ✔ (persistência e envio condicional testados).
- **Limitações:**
  - push é registrado como `SKIPPED_UNAVAILABLE`, porque o FCM é a US 23;
  - sem SMTP ou Twilio, e-mail e SMS ficam como `DEV_LOGGED` (só vão para o log, não são entregues);
  - o único produtor de notificações hoje é a confirmação de pedido. A rota admin de promoções serve para testar a categoria Promoções.

### US 31 · Catálogo base (nova)
- **Card:** `historias/US31_Catalogo_Base.pdf`, no mesmo formato das outras histórias.
- **Objetivo funcional:** uma única fonte de dados de produto, que as telas de detalhes (US 11) e de favoritos (US 13) consultam pelo mesmo identificador.
- **Relação com US 11 e 13:** a US 11 lê do catálogo fotos, ficha técnica, variações e estoque; a US 13 grava o ID do produto na lista do usuário e reabre os detalhes por esse ID. Nenhuma das duas funciona sem a US 31.
- **Dependências resolvidas:** o projeto não tinha tabela de produtos, identificação de itens, variações nem estoque, então não havia como abrir um produto pelo ID nem associar um favorito a algo existente.
- **Justificativa do escopo:** as US 11 e 13 descrevem telas, não a origem dos dados. A US 31 cobre só o que as duas compartilham (estrutura e identificação dos produtos), sem repetir galeria, zoom ou o botão de coração.
- **Numeração:** o PDF original vai até a US 30; a US 31 entra na seção Catálogo e Produtos sem alterar a numeração existente.
- **Feito:**
  - tabelas `Category`, `Brand`, `Product` (UUID + slug), `ProductVariant` (SKU único, cor, tamanho, estoque ≥ 0) e `ProductImage`;
  - formato único de "cartão de produto", usado na busca, nos favoritos e no carrinho;
  - CRUD admin. "Excluir" um produto o desativa, para não quebrar pedidos e favoritos;
  - papel `ADMIN` no usuário;
  - seed com 18 produtos de marcas fictícias e imagens ilustrativas geradas localmente.
- **Arquivos:** `src/catalog/*`, `common/roles.ts`, `prisma/seed.ts`, `prisma/seed-images.ts`, migration, `mobile/lib/features/admin/*`.
- **Imagens:** o upload do admin grava o arquivo em `api/uploads/products` e registra o endereço relativo (`/uploads/products/...`) na tabela `ProductImage`. É o mesmo armazenamento local da foto de perfil (US 06); trocar para S3/Cloud Storage muda só a função `saveImage`.
- **Painel administrativo no app** (aparece em Conta só para o papel ADMIN):
  - lista de produtos com busca e filtro Todos / Ativos / Desativados, estoque total e variações;
  - criar e editar produto: dados, preço, categoria e marca (com criação na hora), ficha técnica e embalagem para o frete;
  - variações: adicionar cor/tamanho com SKU sugerido automaticamente, editar estoque, ativar/desativar;
  - fotos: enviar e remover (a primeira é a capa);
  - desativar e reativar o produto.

### US 11 · Detalhes do produto
- **Feito:**
  - página com galeria em carrossel, miniaturas e tela cheia com zoom (pinça e toque duplo);
  - ficha técnica, descrição, seleção de cor e tamanho (tamanho sem estoque fica desabilitado) e SKU;
  - indicador de estoque: em estoque, últimas unidades ou esgotado;
  - média e distribuição das avaliações;
  - abre pelo ID ou pelo slug.
- **Layout responsivo:** em telas de 900 px ou mais, a página segue o padrão das grandes lojas: miniaturas na vertical, foto grande à esquerda com zoom ao passar o mouse, e à direita um quadro de compra com preço, opções, estoque, "Comprar agora" e "Adicionar ao carrinho". Ficha técnica, descrição e avaliações ficam abaixo. No celular continua o layout em coluna.
- **"Tempo real":** o app consulta `/products/:id/stock` a cada 15 s enquanto a tela está aberta, e a resposta não é cacheada. Escolhi polling em vez de WebSocket para não subir infraestrutura nova.
- **Arquivos:** `catalog.service.ts`, `product_detail_screen.dart`, `widgets/product_gallery.dart`.

### US 13 · Favoritos
- **Feito:**
  - `PUT` e `DELETE /me/favorites/:productId`, idempotentes (dois toques seguidos não duplicam);
  - lista por usuário;
  - o coração aparece em todo cartão e na página do produto, com estado compartilhado: muda na hora e volta atrás se a API falhar;
  - aba Favoritos que abre os detalhes pelo mesmo ID;
  - produto desativado aparece como "Indisponível" em vez de sumir.
- **Arquivos:** `src/favorites/*`, `favorites_controller.dart`, `favorites_screen.dart`, `widgets/favorite_button.dart`.

### US 09 · Exclusão de conta (LGPD)
- **Feito em duas etapas:** a senha gera um token de 10 min, e uma confirmação final consome esse token.
  - O token só vale para quem o pediu, então ninguém exclui a conta de outra pessoa.
  - O e-mail de confirmação vai para o endereço original.
- **Anonimização:** a linha do usuário é mantida porque os pedidos apontam para ela, mas perde e-mail, nome, CPF, telefone, foto, 2FA e senha utilizável.
- **O que é apagado ou desvinculado:**
  - endereços, favoritos, carrinho, sessões, tokens e preferências;
  - nas tentativas de login, o e-mail e o IP;
  - nas avaliações, o autor (vira "Cliente") e as fotos;
  - nas cópias da tabela de auditoria, os campos pessoais.
- **O que é mantido:** o snapshot fiscal do pedido (nome, CPF, endereço, itens e valores), com base na LGPD art. 16, I. O e-mail de contato do pedido é removido.
- **Arquivos:** `src/account/*`, `delete_account_screen.dart`.
- **Para validar com o professor:** se a nota e o texto das avaliações devem continuar públicos (hoje continuam, sem autor). O prazo de guarda fiscal também não está automatizado.

### US 10 · Busca com filtros
- **Feito no próprio PostgreSQL**, sem Elasticsearch:
  - coluna `searchText` normalizada (sem acento, minúscula) com índice GIN `pg_trgm`;
  - cada palavra casa por trecho ou por similaridade, o que tolera erro de digitação ("mochla" encontra "mochila");
  - filtros combináveis: várias categorias, várias marcas, faixa de preço e "só com estoque";
  - ordenação por relevância, menor preço e maior preço;
  - paginação com total.
- **No app:** busca com debounce, sheet de filtros, menu de ordenação e rolagem infinita.
- **Desempenho:** medido no teste e2e com 5.000 produtos extras no banco, 30 buscas pela API. Ficou em **p95 ≈ 50 ms e máximo ≈ 60 ms**, bem abaixo de 1 s. A medição foi feita localmente; produção depende do hardware.
- **Arquivos:** `catalog.service.ts`, `catalog_screen.dart`.

### US 12 · Avaliações
- **Feito:**
  - tabela `Review` vinculada ao **item do pedido** (1 avaliação por compra), mais `ReviewPhoto` com até 3 fotos PNG/JPG de até 5 MB, com a assinatura do arquivo conferida;
  - a permissão é decidida no backend a partir dos pedidos reais do usuário;
  - campos extras como `orderItemId` são recusados;
  - a média é recalculada em transação como Σ(estrelas × quantidade) / total e aparece na página do produto e nos cartões;
  - app: botão "Avaliar" só para quem pode, formulário com estrelas, comentário e fotos, e lista com "compra verificada".
- **Arquivos:** `src/reviews/*`, `review_form_screen.dart`, `orders.dart`.
- **Observação:** nenhuma avaliação ou compra é criada pelo seed.

### US 14 · Carrinho
- **Feito:**
  - carrinho persistido por usuário. Preço e estoque vêm sempre do catálogo, e o carrinho guarda só a variação e a quantidade;
  - no app, o +/− e a remoção atualizam o subtotal e o total na hora (cálculo local) e depois confirmam com a API;
  - acima do estoque, o app mostra um alerta e a API responde 409 com a quantidade disponível;
  - validação de estoque antes do checkout;
  - o checkout baixa o estoque de forma atômica: duas compras simultâneas da última unidade não passam (testado).
- **Arquivos:** `src/cart/*`, `src/orders/*`, `cart_controller.dart`, `cart_screen.dart`.

### US 15 · Frete e prazo
- **Feito:**
  - cotação pelo Melhor Envio (`/api/v2/me/shipment/calculate`), com o peso e as dimensões cadastrados no produto;
  - a opção mais barata é marcada como **econômica** e a mais rápida como **expressa**, com prazo em dias úteis;
  - validação de CEP;
  - erros tratados: rede (502), token inválido ou ausente (503) e CEP sem cobertura (400);
  - o checkout recota no servidor, então nunca aceita o preço que vem do app;
  - no carrinho: campo de CEP com máscara e opções de frete.
- **Sem credencial:** a API responde 503 `SHIPPING_NOT_CONFIGURED`, o app avisa e o pedido pode ser fechado sem frete.
- **Validado no sandbox:** com token de teste do Melhor Envio (escopo `shipping-calculate`), a cotação real funcionou no app, com opções, preços e prazos vindos da transportadora.
- **Token:** fica só no `api/.env` de cada máquina (fora do Git). Cada integrante cria o seu no sandbox ou recebe por mensagem privada.
- **Arquivos:** `src/shipping/*`, `cart_screen.dart`.

### Ajustes fora das histórias (encontrados no caminho)
- `GET /audit` era aberto a qualquer usuário logado e expunha dados pessoais de terceiros. Agora é só ADMIN, e o teste existente foi atualizado.
- O trigger de auditoria gravava a hora local do servidor; agora grava em UTC. Em Postgres fora de UTC, os testes de auditoria falhavam.
- `npm run start:prod` procurava `dist/main`, mas o build gerava `dist/src/main`. Corrigido no `tsconfig.build.json`.
- A tela de Sessões quebrava porque a API devolve `{ sessions: [...] }` e o app esperava uma lista.

---

## Testes

| Suite | Resultado |
|-------|-----------|
| API · unitários (`npm test`) | **47/47 aprovados** (CPF, telefone, senha, busca, regra de notificação, frete com provedor simulado, média) |
| API · e2e (`npm run test:e2e`, Postgres 16 + Redis 7 reais) | **71/71 aprovados**: os 10 originais + 61 novos (incluindo painel admin e fotos em S3 contra um servidor S3 local, o moto) |
| `tsc --noEmit` e `nest build` | sem erros |
| ESLint nos arquivos alterados | sem erros (o projeto já tinha 36 erros de formatação em arquivos não tocados; 1 deles continua em `auth.controller.ts`) |
| Migration | aplicada do zero; `prisma migrate diff` entre banco e schema = vazio |
| App · `flutter analyze` (Flutter 3.47.7, Windows) | **0 erros**. Os 4 avisos `info` que apareceram foram corrigidos depois |
| App · `flutter test` | **10/10 testes novos aprovados**. O `widget_test.dart` original falhava porque procurava o texto exato "FastSell" (a tela de login mostra "Entrar no FastSell"); corrigido para `textContaining`, mas ainda sem uma nova execução |
| App rodando no Edge com a API | vitrine com os 18 produtos e imagens ✔ · cotação de frete real no sandbox do Melhor Envio ✔ |

Cenários e2e cobertos:
- CPF válido e inválido;
- link de redefinição expirado e reutilizado;
- bloqueio por conta e por IP, persistência e fim do bloqueio;
- preferências persistidas e respeitadas na fila;
- detalhes e estoque do produto;
- favoritos (idempotência e isolamento entre usuários);
- busca com filtros combinados, ordenação, paginação e desempenho;
- avaliação negada a quem não comprou (inclusive forjando a API);
- upload e exibição de fotos;
- média das avaliações;
- carrinho: subtotais, estoque excedido e corrida pela última unidade;
- CEP inválido e frete não configurado;
- exclusão de conta com preservação fiscal e sem vazamento na auditoria.

---

## Como rodar

```bash
docker compose up -d                 # Postgres :15432 e Redis :6379

cd api
cp .env.example .env                 # ajuste SMTP, Twilio e Melhor Envio se tiver
npm install
npx prisma generate                # npm 11+ não roda o postinstall do Prisma sozinho
npx prisma migrate deploy
npx prisma db seed                   # contas demo/admin + catálogo de demonstração
npm run start:dev                    # http://localhost:3000

cd ../mobile
flutter pub get
flutter run -d edge                  # ou chrome; emulador Android usa 10.0.2.2:3000
```

Configuração externa opcional:
- `SMTP_*` para enviar e-mails de verdade;
- `TWILIO_*` para SMS;
- `MELHOR_ENVIO_TOKEN` + `STORE_ORIGIN_CEP` (+ `MELHOR_ENVIO_ENV=sandbox|production`) para o frete.

Para os testes e2e, use um banco separado (veja o README).

---

## Pendências

| O quê | Por quê | Impacto | Próximo passo |
|-------|---------|---------|---------------|
| Teste manual completo do app | Feito em parte (vitrine e frete) | Perfil, carrinho, checkout, avaliação com foto, notificações, exclusão, painel admin e o novo layout do produto ainda sem passe manual | Seguir o roteiro de testes antes da apresentação |
| Frete em produção | Só o sandbox foi usado | Valores de teste, não preços oficiais | Token da conta real com `MELHOR_ENVIO_ENV=production` |
| Push (canal da US 08) | FCM é a US 23 | Preferência salva, mas nada é enviado por push | Integrar FCM e trocar o `SKIPPED_UNAVAILABLE` |
| Pagamento | US 18/19 | Pedido nasce `CONFIRMED` sem cobrança | Fazer o pedido nascer `PENDING_PAYMENT` quando houver gateway |
| Bucket real (US 06) | Sem conta AWS/R2 nesta entrega | Por padrão as fotos ficam em disco | Criar o bucket, preencher `S3_*` no `.env` e `STORAGE_DRIVER=s3` |
| Prazo de guarda fiscal (US 09) | Precisa de definição jurídica | Pedidos ficam guardados indefinidamente | Definir o prazo com o orientador e criar uma rotina de expurgo |
