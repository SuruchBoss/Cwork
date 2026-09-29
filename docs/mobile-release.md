# Releasing the mobile app

One Android app serves every company that runs Cwork (CW-060). It is not built
per company: the employee connects it to their company's server the first time
they open it, by scanning the QR code on the console's **Mobile app** page or
typing the address. So a release builds one APK, attaches it to the GitHub
release, and every company's install page links to the APK that matches its
server's version.

iPhone is not supported yet. Publishing an iOS app requires an Apple Developer
Program membership, and that decision is the owner's. The code is ready for it:
the camera permission and the `cwork://` link are already declared in
`ios/Runner/Info.plist`.

## Once: the release key

Android installs an update only when it is signed with the same key as the app
already on the phone. **Every release must be signed with one key, forever.** If
the key is lost, no later version can be installed as an update: every employee
would have to uninstall the app, losing any clock-in still queued on the phone,
and install it again.

Create the key once, on a trusted machine:

```bash
keytool -genkeypair -v \
  -keystore cwork-release.jks -alias cwork \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=Cwork, C=TH"
```

Keep `cwork-release.jks` and its passwords in two places that are not this
repository, such as a password manager and an offline copy. Note the key's
fingerprint so you can check a published APK against it later:

```bash
keytool -list -v -keystore cwork-release.jks -alias cwork | grep SHA256
```

Then add four repository secrets under **Settings → Secrets and variables →
Actions**:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 cwork-release.jks` (macOS: `base64 -i cwork-release.jks`) |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `cwork` |
| `ANDROID_KEY_PASSWORD` | the key password |

## Every release

Cut the release as usual, by adding a `## [x.y.z]` section to `CHANGELOG.md` and
bumping the version in `backend/package.json`, `web/package.json` and
`mobile/pubspec.yaml`. The **Release** workflow then:

1. tags `vx.y.z` and publishes the GitHub release;
2. builds the APK from that tag, with version name `x.y.z` and version code
   `x*1000000 + y*1000 + z`. The code always goes up, which Android requires
   before it installs an update;
3. fails if any of the four secrets is missing, rather than signing with a
   debug key;
4. checks the APK with [`mobile/tool/check-apk.sh`](../mobile/tool/check-apk.sh):
   the app id, HTTPS-only, backup off, the `cwork://connect` link, and the
   release signature;
5. attaches `cwork-android.apk` and its `.sha256` to the release.

The console's install page links to
`https://github.com/SuruchBoss/Cwork/releases/download/vx.y.z/cwork-android.apk`,
using the version the console was built from. Releases in 0.x are pre-releases,
so a `latest` link would not find them.

**If the Android job failed** (a missing secret, a flaky runner), fix the cause and
run the workflow again from **Actions → Release → Run workflow**. The tag and the
release already exist, so it only builds and attaches the APK. It does nothing
once the release has one.

Releases before the installable app (0.3.1 and earlier) get no APK. The workflow
says so and moves on.

## What an update keeps

An APK with the same app id (`com.cwork.app`), the same key and a higher
version code installs over the old one. The server address, the session and any
clock-in queued offline are kept in the app's own encrypted storage, and an
update leaves that storage as it was. So an employee stays signed in to the same
company, and a queued punch is still sent when the phone is back online.

Backup is off. Those three things are encrypted under a key that never leaves the
phone, so a restored copy could not be read anyway. A new phone connects and
signs in afresh.

## What an employee sees

1. HR shows the QR code from the console's **Mobile app** page, or sends its link.
2. The link opens the install page on the company's own server. The page offers
   the APK and shows the address to type.
3. Android asks once to allow installs from the browser. Play Protect may warn
   that the app comes from outside the Play Store, because it does.
4. The app opens on **Connect to your company**. The employee scans the same QR
   code, types the address, or taps **Open the app** on the install page. A link
   never connects on its own: the app shows which server it points to and asks
   first.
5. The app accepts only an HTTPS server that answers as Cwork, over a certificate
   the phone trusts. Anything else is refused, with a reason the employee can pass
   on to HR.

## Building a release APK yourself

For a maintainer who holds the key, put `mobile/android/key.properties` next to it
(the file is git-ignored):

```properties
storeFile=/absolute/path/to/cwork-release.jks
storePassword=…
keyAlias=cwork
keyPassword=…
```

```bash
cd mobile
flutter build apk --release --build-name=0.4.0 --build-number=4000
bash tool/check-apk.sh build/app/outputs/flutter-apk/app-release.apk --release
```

Without `key.properties`, `flutter build apk --release` signs with the debug key.
That is fine on your own phone and never fine to hand out. CI builds exactly this
on every commit, to catch a broken Android build before a release does.
