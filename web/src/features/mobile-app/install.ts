// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * How an employee gets from "HR gave me a QR code" to a phone that clocks in
 * (CW-060).
 *
 * One build of the app serves every company, so what HR hands out is not an app
 * but an address: the install page on this server. Opened in a phone's browser,
 * it offers the APK. Scanned or typed in the app, it connects the app to this
 * server. The app reads the same address, so a single QR code does both jobs.
 *
 * Kept free of React so the address rules can be tested on their own. They
 * mirror `mobile/lib/core/config/server_address.dart`, which reads them.
 */

/** Where every release, and the APK attached to it, is published. */
export const RELEASES_URL = 'https://github.com/SuruchBoss/Cwork/releases';

/** The version this console was built from, which is the server's release. */
export const APP_VERSION: string = __APP_VERSION__;

/**
 * The APK of one release. By version, not `latest`: 0.x releases are
 * pre-releases, which GitHub's `latest` link skips, and an employee should get
 * the app that matches their company's server rather than the newest one.
 */
export function androidApkUrl(version: string = APP_VERSION): string {
  return `${RELEASES_URL}/download/v${version}/cwork-android.apk`;
}

/** The API's path when the address does not name one; the app assumes it too. */
export const DEFAULT_API_PATH = '/api/v1';

export interface InstallLinks {
  /** The API the app should talk to, absolute, with no trailing slash. */
  apiBaseUrl: string;
  /** The install page. What HR's QR code and link hold. */
  installPageUrl: string;
  /** Opens the installed app, which asks the employee before it connects. */
  connectLink: string;
  /** The shortest thing an employee can type into the app instead. */
  typedAddress: string;
  /**
   * Whether the app can connect at all. It refuses anything but HTTPS, and it
   * reads the install page's own scheme first, so both must be HTTPS.
   */
  secure: boolean;
}

/**
 * The addresses for a console served at [origin] whose API is at [apiBase]
 * (`env.apiBaseUrl`: usually `/api/v1` on the same host, possibly elsewhere).
 */
export function installLinks(origin: string, apiBase: string): InstallLinks {
  const page = new URL(origin);
  const api = new URL(apiBase, `${page.origin}/`);
  const apiPath = api.pathname.replace(/\/+$/, '');
  const apiBaseUrl = `${api.origin}${apiPath}`;

  // The usual layout needs nothing but the host. Anything else says where the
  // API is, in a parameter the app looks for.
  const usual = api.origin === page.origin && apiPath === DEFAULT_API_PATH;

  return {
    apiBaseUrl,
    installPageUrl: usual
      ? `${page.origin}/app`
      : `${page.origin}/app?api=${encodeURIComponent(apiBaseUrl)}`,
    connectLink: `cwork://connect?server=${encodeURIComponent(apiBaseUrl)}`,
    typedAddress: usual ? page.host : apiBaseUrl,
    secure: page.protocol === 'https:' && api.protocol === 'https:',
  };
}

/** The links for the console this code is running in. */
export function currentInstallLinks(apiBase: string): InstallLinks {
  return installLinks(window.location.origin, apiBase);
}
