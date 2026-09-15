# MarMa HRIS — Mobile App

Flutter app for employees: clock in/out, leave, payslips, and the HR assistant.

## Running

The app talks to the [`backend/`](../backend) API. Point it at your server with
`--dart-define` so a build is pinned to the API it was built against:

```bash
flutter pub get

# Android emulator (10.0.2.2 is the emulator's route to your host machine)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# iOS simulator / physical device on the same network
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1
```

Sign in with a seeded account (see the backend's `npm run db:seed` output), e.g.
`dev2@marma.example` / `MarMaHris2026!`.

## Checks

```bash
flutter analyze    # must be clean
flutter test
dart format --line-length 100 lib test
```

## Architecture

```
lib/
├── core/            Cross-cutting: config, HTTP, secure storage, theme, navigation
└── features/<name>/
    ├── domain/      Plain models — no Flutter imports
    ├── data/        Repositories: the only place that talks to the API
    ├── application/ Riverpod providers and controllers
    └── presentation/ Widgets
```

**State management** is Riverpod, deliberately without code generation: one less
build step for contributors, and these providers are simple enough that the
generator would not earn its keep. Models are hand-written for the same reason.

**Repositories are the only layer that knows about HTTP.** Widgets read
providers; providers call repositories. That boundary is what makes the offline
queue possible without every screen knowing about it.

## Two things worth knowing

**Offline clock-in.** A punch captured without a network is written to a durable
local queue with the instant it was captured and a client-generated id, then
flushed on reconnect. The server treats a replay of the same id as the original
punch, so a flaky connection can never turn one clock-in into three — and the
employee is credited with the time they actually arrived, not the time their
phone found signal. See `features/attendance/data/punch_queue.dart`.

**A missing GPS fix never blocks a punch.** If location is off, denied, or the
fix times out, the punch is still recorded with a note explaining why, and the
server flags it for HR. Refusing to clock someone in because their phone could
not see a satellite is worse than a flagged record.

## Permissions

| Platform | Permission | Why |
|---|---|---|
| Android | `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION` | Verify a punch against the worksite geofence |
| Android | `INTERNET`, `ACCESS_NETWORK_STATE` | API calls; detect reconnect to flush the queue |
| iOS | `NSLocationWhenInUseUsageDescription` | Same — location is requested only while clocking in |

Access and refresh tokens are stored in the platform keystore
(Android EncryptedSharedPreferences / iOS Keychain), never in SharedPreferences.

## Not yet built

Push notifications (the backend stores device tokens and has the
`NotificationsService` seam, but no FCM/APNs dispatcher ships by default),
expense-claim submission, and attendance-correction requests. All three have
working API endpoints — see [`docs/api.md`](../docs/api.md).
