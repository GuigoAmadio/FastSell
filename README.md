# FastSell

Monorepo com firmware ESP32, API de autenticação e app Flutter (iOS/Android).

## Estrutura

```
FastSell/
  platformio.ini   # firmware INMP441 / ESP32-S3
  src/             # firmware
  api/             # NestJS + Prisma + PostgreSQL + Redis
  mobile/          # Flutter (área do cliente)
  docker-compose.yml
```

## Pré-requisitos

- Docker Desktop (Postgres + Redis)
- Node.js 20+
- Flutter 3.35+
- (opcional) PlatformIO para o firmware

## 1. Infra local

```bash
docker compose up -d
```

Sobe PostgreSQL em `127.0.0.1:15432` (porta dedicada para não conflitar com Postgres local nas 5432/5433) e Redis em `localhost:6379`.

## App: web vs Android

### Chrome / Edge (web)
Funciona para testar telas e login. Biometria **não** funciona no browser.

```bash
cd mobile
flutter run -d chrome
```

A API é `http://127.0.0.1:3000` automaticamente na web.

### Emulador Android
1. Instale o [Android Studio](https://developer.android.com/studio).
2. Abra **More Actions → Virtual Device Manager → Create Device** (ex.: Pixel 6 + system image recente).
3. Aceite as licenças e confirme o SDK:

```bash
flutter doctor --android-licenses
flutter doctor
```

4. Suba o emulador e rode o app:

```bash
flutter emulators
flutter emulators --launch <id_do_avd>
flutter devices
flutter run -d android
```

No emulador Android a API usa `http://10.0.2.2:3000` (apontando para o `localhost` do PC).

### Windows desktop
```bash
flutter run -d windows
```


## 2. API

```bash
cd api
cp .env.example .env   # se ainda não tiver .env
npm install
npx prisma generate
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

API em `http://localhost:3000`.

### Usuários do seed (só para desenvolvimento)

| Conta | E-mail | Senha | Papel |
|-------|--------|-------|-------|
| Cliente | `demo@fastsell.app` | `Senha@123` | CUSTOMER |
| Administrador | `admin@fastsell.app` | `Admin@123` | ADMIN |

O seed também cria um **catálogo de demonstração** (18 produtos, marcas fictícias, imagens ilustrativas geradas localmente em `api/uploads/products`). Não cria pedidos nem avaliações.

Sem SMTP/Twilio configurados, e-mails e SMS são impressos no console da API.
Fotos ficam em `api/uploads` por padrão; com `STORAGE_DRIVER=s3` e as variáveis `S3_*` vão para um bucket S3/R2/MinIO.
Sem `MELHOR_ENVIO_TOKEN` + `STORE_ORIGIN_CEP`, a cotação de frete responde 503 `SHIPPING_NOT_CONFIGURED` (nenhum valor é inventado).

### Testes

```bash
npm test             # unitários
npm run test:e2e     # HTTP real + Postgres + Redis (precisa do docker compose rodando)
```

Os testes e2e gravam no banco de `DATABASE_URL`. Para não misturar com o catálogo de desenvolvimento, use um banco separado:

```bash
DATABASE_URL="postgresql://fastsell:fastsell@127.0.0.1:15432/fastsell_test?schema=public" npx prisma migrate deploy
DATABASE_URL="postgresql://fastsell:fastsell@127.0.0.1:15432/fastsell_test?schema=public" npm run test:e2e
```

### Endpoints principais

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/auth/register` | Cadastro |
| POST | `/auth/login` | Login (pode retornar `requires2fa`) |
| POST | `/auth/2fa/verify` | Validar OTP (SMS/TOTP) |
| POST | `/auth/2fa/setup` | Iniciar 2FA (JWT) |
| POST | `/auth/2fa/confirm` | Confirmar 2FA (JWT) |
| POST | `/auth/2fa/disable` | Desativar 2FA (JWT) |
| POST | `/auth/forgot-password` | Enviar link (expira em 24h) |
| POST | `/auth/reset-password` | Nova senha forte |
| POST | `/auth/refresh` | Renovar access token |
| POST | `/auth/logout` | Revogar refresh token |
| GET | `/me` | Perfil |
| PATCH | `/me` | Editar nome/telefone/CPF (CPF com dígitos verificadores) |
| POST | `/me/photo` | Foto de perfil PNG/JPG até 5MB |
| PATCH | `/me/settings` | Ligar/desligar biometria no perfil |
| GET | `/reset-password?token=` | Página do link do e-mail (abre o app) |

#### Sprint 3

| Método | Rota | História |
|--------|------|----------|
| GET/PATCH | `/me/notification-preferences` | US08 |
| POST | `/me/account/deletion-request` → `/me/account/deletion-confirm` | US09 |
| GET | `/products?q=&categoryIds=&brandIds=&minPrice=&maxPrice=&inStock=&sort=&page=` | US10 |
| GET | `/categories`, `/brands` | US10 |
| GET | `/products/:idOuSlug`, `/products/:id/stock` | US11 / US31 |
| GET/POST | `/products/:id/reviews`, `GET /products/:id/reviews/eligibility` | US12 |
| GET/PUT/DELETE | `/me/favorites`, `/me/favorites/ids`, `/me/favorites/:productId` | US13 |
| GET/POST/PATCH/DELETE | `/me/cart`, `/me/cart/items/:id`, `POST /me/cart/validate` | US14 |
| POST | `/me/cart/shipping-quote` | US15 |
| POST/GET | `/me/orders/checkout`, `/me/orders`, `/me/orders/:id` | checkout mínimo |
| * | `/admin/products` (lista, inclui desativados), `/admin/variants/:id`, `/admin/categories`, `/admin/brands`, `/admin/notifications/promotions` | US31 (ADMIN) |
| GET | `/audit`, `/audit/stats` | agora só ADMIN |

Preços sempre em centavos (`priceCents`). Detalhes e decisões: [`docs/SPRINT03.md`](docs/SPRINT03.md).

### Regras de segurança (Sprint 1)

- **Biometria:** só no aparelho; destrava o refresh token salvo no Keystore/Keychain.
- **2FA:** OTP 6 dígitos, TTL 5 min, bloqueio após 3 erros.
- **Lockout login:** 5 falhas → bloqueio 15 min + e-mail de alerta.
- **Senha forte:** mín. 8 caracteres, número e símbolo.

## 3. App Flutter

```bash
cd mobile
flutter pub get
```

### URL da API

Por padrão o app usa `http://10.0.2.2:3000` (emulador Android).

- Emulador Android: `10.0.2.2`
- iOS Simulator / desktop: `localhost`
- Celular físico: IP da sua máquina na Wi-Fi

```bash
# exemplo emulador Android
flutter run

# exemplo iOS simulator
flutter run --dart-define=API_BASE_URL=http://127.0.0.1:3000

# exemplo device físico
flutter run --dart-define=API_BASE_URL=http://192.168.0.10:3000
```

### Telas

- Splash com tentativa biométrica (fallback automático para senha)
- Login / cadastro
- Modal OTP 2FA
- Esqueci senha / nova senha (deep link `fastsell://reset-password`)
- Área logada com abas: Loja (busca e filtros), Favoritos, Carrinho (frete e checkout) e Conta
- Página do produto: galeria com zoom, variações, estoque e avaliações
- Meus pedidos / avaliar compra
- Configurações: biometria, 2FA, notificações, sessões, excluir conta
- Painel administrativo (só conta ADMIN): produtos, variações, estoque, fotos, categorias e marcas

Biometria real só funciona em device/simulador com Face ID / digital. Em emulador sem biometria, o fluxo cai no login por senha.

## 4. Firmware

```bash
pio run -t upload
pio device monitor
```

Ver [`src/main.cpp`](src/main.cpp) e [`platformio.ini`](platformio.ini).

## Próximos passos

- Comunicação BLE/Wi-Fi com o ESP32
- Templates de e-mail em produção (Resend/SES) e SMS (Twilio)
- Pagamento (US18/US19) e push via FCM (US23)
- Ver pendências da sprint em [`docs/SPRINT03.md`](docs/SPRINT03.md)
