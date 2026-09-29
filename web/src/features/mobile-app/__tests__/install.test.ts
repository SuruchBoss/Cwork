// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import { androidApkUrl, installLinks } from '../install';

/**
 * What HR hands out has to be something the app reads back to the same API.
 * The app's side of these rules is `mobile/test/server_address_test.dart`.
 */
describe('install links (CW-060)', () => {
  it('needs only the host when the API is where it usually is', () => {
    const links = installLinks('https://hr.example.co.th', '/api/v1');

    expect(links.apiBaseUrl).toBe('https://hr.example.co.th/api/v1');
    expect(links.installPageUrl).toBe('https://hr.example.co.th/app');
    expect(links.typedAddress).toBe('hr.example.co.th');
    expect(links.secure).toBe(true);
  });

  it('keeps a port', () => {
    const links = installLinks('https://hr.example.co.th:8443', '/api/v1');

    expect(links.installPageUrl).toBe('https://hr.example.co.th:8443/app');
    expect(links.typedAddress).toBe('hr.example.co.th:8443');
  });

  it('says where the API is when it is somewhere else', () => {
    const links = installLinks('https://hr.example.co.th', 'https://api.example.co.th/v1/');

    expect(links.apiBaseUrl).toBe('https://api.example.co.th/v1');
    expect(links.installPageUrl).toBe(
      'https://hr.example.co.th/app?api=https%3A%2F%2Fapi.example.co.th%2Fv1',
    );
    expect(links.typedAddress).toBe('https://api.example.co.th/v1');
  });

  it('and when it is at another path on the same host', () => {
    const links = installLinks('https://hr.example.co.th', '/hr/api/v1');

    expect(links.installPageUrl).toBe(
      'https://hr.example.co.th/app?api=https%3A%2F%2Fhr.example.co.th%2Fhr%2Fapi%2Fv1',
    );
  });

  it('opens the app with the API address, which the app asks about before using', () => {
    expect(installLinks('https://hr.example.co.th', '/api/v1').connectLink).toBe(
      'cwork://connect?server=https%3A%2F%2Fhr.example.co.th%2Fapi%2Fv1',
    );
  });

  it('is not secure when either the page or the API is plain HTTP', () => {
    // The app refuses both: it reads the page's scheme before the API's.
    expect(installLinks('http://hr.example.co.th', '/api/v1').secure).toBe(false);
    expect(installLinks('https://hr.example.co.th', 'http://api.example.co.th/v1').secure).toBe(
      false,
    );
  });

  it('links the APK of the release, by version, never "latest"', () => {
    expect(androidApkUrl('0.4.0')).toBe(
      'https://github.com/SuruchBoss/Cwork/releases/download/v0.4.0/cwork-android.apk',
    );
    expect(androidApkUrl()).toMatch(/\/download\/v\d+\.\d+\.\d+\/cwork-android\.apk$/);
  });
});
