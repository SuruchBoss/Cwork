// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'package:cwork/core/config/server_address.dart';
import 'package:flutter_test/flutter_test.dart';

/// Everything HR can hand an employee has to arrive at the same API address
/// (CW-060): the QR code, the install page's button, and what they type.
void main() {
  String? api(String input, {bool allowInsecure = false}) =>
      parseServerAddress(input, allowInsecure: allowInsecure).apiBaseUrl;

  ServerAddressProblem? problem(String input, {bool allowInsecure = false}) =>
      parseServerAddress(input, allowInsecure: allowInsecure).problem;

  group('every shape HR hands out reaches the API', () {
    const String expected = 'https://hr.example.co.th/api/v1';

    test('the install page address — what the QR code holds', () {
      expect(api('https://hr.example.co.th/app'), expected);
      expect(api('https://hr.example.co.th/app/'), expected);
    });

    test('the install page button', () {
      expect(api('cwork://connect?server=https%3A%2F%2Fhr.example.co.th%2Fapi%2Fv1'), expected);
      expect(api('cwork://connect?server=https://hr.example.co.th/api/v1'), expected);
    });

    test('the console address, with or without the API path', () {
      expect(api('https://hr.example.co.th'), expected);
      expect(api('https://hr.example.co.th/'), expected);
      expect(api('https://hr.example.co.th/api/v1'), expected);
      expect(api('https://hr.example.co.th/api/v1/'), expected);
    });

    test('a host typed by hand, however it is typed', () {
      expect(api('hr.example.co.th'), expected);
      expect(api('  hr.example.co.th  '), expected);
      expect(api('HTTPS://hr.example.co.th'), expected);
      expect(api('hr.example.co.th/app'), expected);
    });

    test('a port is kept', () {
      expect(api('hr.example.co.th:8443'), 'https://hr.example.co.th:8443/api/v1');
      expect(api('https://hr.example.co.th:8443/app'), 'https://hr.example.co.th:8443/api/v1');
    });

    test('an API on its own host or path, as the install page says', () {
      expect(
        api('https://hr.example.co.th/app?api=https%3A%2F%2Fapi.example.co.th%2Fv1'),
        'https://api.example.co.th/v1',
      );
      expect(api('https://hr.example.co.th/hr/api/v1'), 'https://hr.example.co.th/hr/api/v1');
    });

    test('the host is what the employee is asked to confirm', () {
      final ServerAddress address =
          parseServerAddress('hr.example.co.th/app', allowInsecure: false);
      expect(address.host, 'hr.example.co.th');
    });
  });

  group('HTTPS only', () {
    test('plain HTTP is refused in a release build', () {
      expect(problem('http://hr.example.co.th'), ServerAddressProblem.insecure);
      expect(problem('http://hr.example.co.th/app'), ServerAddressProblem.insecure);
    });

    test('including when a link or the api parameter carries it', () {
      expect(
        problem('cwork://connect?server=http%3A%2F%2Fhr.example.co.th'),
        ServerAddressProblem.insecure,
      );
      expect(
        problem('https://hr.example.co.th/app?api=http%3A%2F%2Fhr.example.co.th%2Fapi%2Fv1'),
        ServerAddressProblem.insecure,
      );
    });

    test('a host typed without a scheme is HTTPS, never a guess at HTTP', () {
      expect(api('10.0.0.5:3000'), 'https://10.0.0.5:3000/api/v1');
    });

    test('a debug build may use a developer machine over HTTP', () {
      expect(api('http://10.0.2.2:3000', allowInsecure: true), 'http://10.0.2.2:3000/api/v1');
      expect(
        api('http://localhost:3000/api/v1', allowInsecure: true),
        'http://localhost:3000/api/v1',
      );
    });
  });

  group('what is not an address', () {
    test('nothing', () {
      expect(problem(''), ServerAddressProblem.empty);
      expect(problem('   '), ServerAddressProblem.empty);
    });

    test('a word or a sentence', () {
      expect(problem('cwork'), ServerAddressProblem.invalid);
      expect(problem('ask HR for it'), ServerAddressProblem.invalid);
    });

    test('another scheme', () {
      expect(problem('ftp://hr.example.co.th'), ServerAddressProblem.invalid);
      expect(problem('javascript:alert(1)'), ServerAddressProblem.invalid);
      expect(problem('mailto:hr@example.co.th'), ServerAddressProblem.invalid);
    });

    test('an email address, or a host dressed up in front of another one', () {
      expect(problem('hr@example.co.th'), ServerAddressProblem.invalid);
      expect(problem('https://hr.example.co.th@elsewhere.com'), ServerAddressProblem.invalid);
    });

    test('a cwork link that is not a connect link, or carries none', () {
      expect(problem('cwork://connect'), ServerAddressProblem.invalid);
      expect(problem('cwork://open?server=https://hr.example.co.th'), ServerAddressProblem.invalid);
      expect(
        problem('cwork://connect?server=cwork%3A%2F%2Fconnect%3Fserver%3Dhr.example.co.th'),
        ServerAddressProblem.invalid,
      );
    });
  });
}
