// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/// Turns whatever an employee was given into the address of their company's
/// API — or a reason it cannot be one (CW-060).
///
/// One build of the app serves every company, so the server is chosen at first
/// launch rather than compiled in. HR hands out one link, and it reaches the
/// app in one of four shapes, all accepted here:
///
/// - `https://hr.example.co.th/app` — the install page's own address, which is
///   what HR's QR code holds (the console's "Mobile app" page);
/// - `cwork://connect?server=…` — the "open the app" button on that page;
/// - `https://hr.example.co.th` or `https://hr.example.co.th/api/v1`;
/// - `hr.example.co.th`, typed by hand.
///
/// The address must be HTTPS. Passwords and national IDs travel over it, and a
/// company network is exactly where somebody can listen. Plain HTTP is allowed
/// only in a debug build, for a developer's own machine.
library;

/// Why an input is not a usable server address.
enum ServerAddressProblem {
  /// Nothing was entered.
  empty,

  /// Not something that can be read as a web address.
  invalid,

  /// A plain `http://` address, in a build that refuses one.
  insecure,
}

/// The outcome of [parseServerAddress]: an API base URL, or a problem.
class ServerAddress {
  const ServerAddress._(this.apiBaseUrl, this.problem);

  /// e.g. `https://hr.example.co.th/api/v1`, with no trailing slash.
  final String? apiBaseUrl;
  final ServerAddressProblem? problem;

  bool get isValid => apiBaseUrl != null;

  /// The host, for asking "connect to hr.example.co.th?" in words a person
  /// recognises. Null when the address is not valid.
  String? get host => apiBaseUrl == null ? null : Uri.parse(apiBaseUrl!).host;

  @override
  String toString() => apiBaseUrl ?? 'ServerAddress(${problem!.name})';
}

/// The API's path on a Cwork server, when the address does not name one.
const String defaultApiPath = '/api/v1';

/// Reads [input] as a server address. [allowInsecure] is for debug builds only.
ServerAddress parseServerAddress(String input, {required bool allowInsecure}) {
  final String trimmed = input.trim();
  if (trimmed.isEmpty) return const ServerAddress._(null, ServerAddressProblem.empty);

  // Typed without a scheme: HTTPS, never a guess at HTTP. Checked by hand
  // because `hr.example.co.th:8443` would otherwise parse as a URI whose
  // *scheme* is the host name.
  final bool hasScheme = RegExp(r'^[a-z][a-z0-9+.-]*://', caseSensitive: false).hasMatch(trimmed);
  final Uri? uri = Uri.tryParse(hasScheme ? trimmed : 'https://$trimmed');
  if (uri == null) return const ServerAddress._(null, ServerAddressProblem.invalid);

  // The install page's "open the app" button.
  if (uri.scheme == 'cwork') {
    final String? server = uri.queryParameters['server'];
    if (uri.host != 'connect' || server == null || server.startsWith('cwork:')) {
      return const ServerAddress._(null, ServerAddressProblem.invalid);
    }
    return parseServerAddress(server, allowInsecure: allowInsecure);
  }

  if (uri.scheme != 'https' && uri.scheme != 'http') {
    return const ServerAddress._(null, ServerAddressProblem.invalid);
  }
  if (uri.host.isEmpty || !_plausibleHost(uri.host)) {
    return const ServerAddress._(null, ServerAddressProblem.invalid);
  }
  // `https://hr.example.co.th@elsewhere.com` goes to elsewhere.com, and an
  // email address typed into the field reads the same way. Neither is an
  // address HR would give out.
  if (uri.userInfo.isNotEmpty) {
    return const ServerAddress._(null, ServerAddressProblem.invalid);
  }
  if (uri.scheme == 'http' && !allowInsecure) {
    return const ServerAddress._(null, ServerAddressProblem.insecure);
  }

  // The install page says where the API is when it is not at the usual path.
  final String? api = uri.queryParameters['api'];
  if (api != null && api.isNotEmpty && !api.startsWith('cwork:')) {
    return parseServerAddress(api, allowInsecure: allowInsecure);
  }

  final String origin = '${uri.scheme}://${uri.host}${uri.hasPort ? ':${uri.port}' : ''}';
  String path = uri.path.replaceAll(RegExp(r'/+$'), '');
  // The install page, or the console's root: the API is at its usual path.
  if (path.isEmpty || path == '/app') path = defaultApiPath;

  return ServerAddress._('$origin$path', null);
}

/// A host name or an IP address — enough to refuse a stray word or a sentence
/// pasted into the field, without second-guessing a company's own naming.
bool _plausibleHost(String host) {
  if (host.contains(' ')) return false;
  if (host == 'localhost') return true;
  return host.contains('.') || host.contains(':');
}
