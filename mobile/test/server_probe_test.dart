// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import 'dart:typed_data';

import 'package:cwork/core/config/server.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';

/// Answers every request the same way, and remembers what was asked.
class _Server implements HttpClientAdapter {
  _Server({this.status = 200, this.body = '', this.contentType = 'application/json', this.error});

  final int status;
  final String body;
  final String contentType;
  final DioException Function(RequestOptions)? error;
  final List<Uri> asked = <Uri>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    asked.add(options.uri);
    final DioException Function(RequestOptions)? fail = error;
    if (fail != null) throw fail(options);
    return ResponseBody.fromString(
      body,
      status,
      headers: <String, List<String>>{
        Headers.contentTypeHeader: <String>[contentType],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

Future<ServerProbeProblem?> _probe(_Server server) {
  final Dio dio = Dio(BaseOptions(validateStatus: (_) => true))..httpClientAdapter = server;
  return probeServer('https://hr.example.co.th/api/v1', dio: dio);
}

/// A server is saved only once it has answered the way a Cwork server does
/// (CW-060), so a typo never leaves the app pointed at somebody else's site.
void main() {
  test('asks the public /config, which works before anyone signs in', () async {
    final _Server server = _Server(body: '{"assistantEnabled":false,"demo":false}');

    expect(await _probe(server), isNull);
    expect(server.asked.single.toString(), 'https://hr.example.co.th/api/v1/config');
  });

  test('a web page that is not Cwork', () async {
    expect(
      await _probe(_Server(body: '<html>Welcome</html>', contentType: 'text/html')),
      ServerProbeProblem.notCwork,
    );
  });

  test('some other JSON API', () async {
    expect(await _probe(_Server(body: '{"status":"ok"}')), ServerProbeProblem.notCwork);
  });

  test('a server with nothing at that path', () async {
    expect(
      await _probe(_Server(status: 404, body: '{"assistantEnabled":false}')),
      ServerProbeProblem.notCwork,
    );
  });

  test('no answer at all', () async {
    expect(
      await _probe(
        _Server(
          error: (RequestOptions options) =>
              DioException.connectionError(requestOptions: options, reason: 'Failed host lookup'),
        ),
      ),
      ServerProbeProblem.unreachable,
    );
  });

  test('a certificate the phone does not trust', () async {
    expect(
      await _probe(
        _Server(
          error: (RequestOptions options) => DioException.badCertificate(requestOptions: options),
        ),
      ),
      ServerProbeProblem.untrustedCertificate,
    );
    expect(
      await _probe(
        _Server(
          error: (RequestOptions options) => DioException.connectionError(
            requestOptions: options,
            reason: 'HandshakeException',
            error: 'HandshakeException: CERTIFICATE_VERIFY_FAILED: self signed certificate',
          ),
        ),
      ),
      ServerProbeProblem.untrustedCertificate,
    );
  });
}
