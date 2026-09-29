# Cwork — Mobile App

Flutter app for employees: clock in/out, leave, payslips, and the HR assistant.

## Running

The app talks to the [`backend/`](../backend) API, and it is not built for one
server. One build serves every company: on first launch the employee connects
it to their company's server by scanning the QR code on the console's
**Mobile app** page or typing the address (CW-060). The address must be HTTPS,
and the server must answer as Cwork before it is saved.

A debug build also accepts plain HTTP, for your own machine. To skip the
connect screen, preset a server with `--dart-define`:

```bash
flutter pub get

# Android emulator (10.0.2.2 is the emulator's route to your host machine)
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1

# iOS simulator / physical device on the same network
flutter run --dart-define=API_BASE_URL=http://192.168.1.10:3000/api/v1

# Or run with no preset, and type http://10.0.2.2:3000 on the connect screen
flutter run
```

Sign in with a seeded account, e.g. `dev2@cwork.example`, using the password the
backend's `npm run db:seed` printed (or the `SEED_PASSWORD` you gave it).

## Releases

Employees install the APK attached to each GitHub release. The release workflow
builds it and signs it with the one release key. See
[`docs/mobile-release.md`](../docs/mobile-release.md) for the key, the secrets,
and what an update keeps. CI builds the same APK on every commit and checks it
with `tool/check-apk.sh`.

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
| Android | `CAMERA` | Scan HR's QR code to connect. Asked for only when the employee taps **Scan QR code** |
| iOS | `NSCameraUsageDescription` | Same |

Access and refresh tokens, the server address and the offline punch queue are
stored in the platform keystore (Android EncryptedSharedPreferences / iOS
Keychain), never in SharedPreferences. Android backup and device-to-device
transfer are off, because a copy restored on another phone could not decrypt
them.

## Links

`cwork://connect?server=<API address>` opens the app from the install page's
**Open the app** button. It never connects on its own: the app shows the server
it points to and asks the employee first, and says which company they would be
signed out of. The app also refuses to change company while punches are still
queued for the current one.

## Not yet built

Push notifications (the backend stores device tokens and has the
`NotificationsService` seam, but no FCM/APNs dispatcher ships by default),
expense-claim submission, and attendance-correction requests. All three have
working API endpoints — see [`docs/api.md`](../docs/api.md).
