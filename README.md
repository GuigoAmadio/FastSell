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
npx prisma migrate deploy
npx prisma db seed
npm run start:dev
```

API em `http://localhost:3000`.

### Usuário demo

- E-mail: `demo@fastsell.app`
- Senha: `Senha@123`

Sem SMTP/Twilio configurados, e-mails e SMS OTP são impressos no console da API.

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
| PATCH | `/me/settings` | Ligar/desligar biometria no perfil |

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
- Home logada
- Configurações (toggle biometria)

Biometria real só funciona em device/simulador com Face ID / digital. Em emulador sem biometria, o fluxo cai no login por senha.

## 4. Firmware

```bash
pio run -t upload
pio device monitor
```

Ver [`src/main.cpp`](src/main.cpp) e [`platformio.ini`](platformio.ini).

## Próximos passos

- Comunicação BLE/Wi-Fi com o ESP32
- Fluxo completo de ativação 2FA na UI
- Templates de e-mail em produção (Resend/SES) e SMS (Twilio)
