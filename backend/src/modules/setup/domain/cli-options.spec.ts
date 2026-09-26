// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { missingAnswers, parseCliOptions } from './cli-options';

describe('db:init arguments', () => {
  const parse = (...argv: string[]) => parseCliOptions(argv);

  it('reads a value flag in both spellings', () => {
    expect(parse('--name', 'Acme')).toEqual({
      ok: true,
      options: { help: false, web: false, name: 'Acme' },
    });
    expect(parse('--name=Acme')).toEqual({
      ok: true,
      options: { help: false, web: false, name: 'Acme' },
    });
  });

  it('keeps an equals sign that belongs to the value', () => {
    const result = parse('--password=a=b=c');
    expect(result.ok && result.options.password).toBe('a=b=c');
  });

  it('refuses a flag it does not know rather than ignoring a typo', () => {
    const result = parse('--emial', 'a@b.com');
    expect(result).toEqual({
      ok: false,
      error: 'Unknown option "--emial". Run with --help to see the options.',
    });
  });

  it('refuses a value flag with nothing after it', () => {
    expect(parse('--email')).toEqual({ ok: false, error: '--email needs a value.' });
    expect(parse('--email', '--web')).toEqual({ ok: false, error: '--email needs a value.' });
  });

  it('refuses answers passed alongside --web, which would be thrown away', () => {
    const result = parse('--web', '--email', 'a@b.com');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain('--email');
  });

  it('takes --web on its own', () => {
    expect(parse('--web')).toEqual({ ok: true, options: { help: false, web: true } });
  });

  it('takes --help in either spelling', () => {
    expect(parse('-h').ok && parse('-h')).toMatchObject({ options: { help: true } });
    expect(parse('--help').ok && parse('--help')).toMatchObject({ options: { help: true } });
  });

  it('parses nothing into nothing', () => {
    expect(parse()).toEqual({ ok: true, options: { help: false, web: false } });
  });
});

describe('missingAnswers', () => {
  it('names everything setup cannot invent', () => {
    expect(missingAnswers({ help: false, web: false })).toEqual([
      'name',
      'timezone',
      'email',
      'password',
    ]);
  });

  it('does not ask for the organisation code — it is derived from the name', () => {
    expect(missingAnswers({ help: false, web: false })).not.toContain('code');
  });

  it('treats an answer of whitespace as no answer', () => {
    const outstanding = missingAnswers({
      help: false,
      web: false,
      name: '   ',
      timezone: 'Asia/Bangkok',
      email: 'a@b.com',
      password: 'a long enough passphrase',
    });
    expect(outstanding).toEqual(['name']);
  });

  it('is empty once every answer is supplied', () => {
    expect(
      missingAnswers({
        help: false,
        web: false,
        name: 'Acme',
        timezone: 'Asia/Bangkok',
        email: 'a@b.com',
        password: 'a long enough passphrase',
      }),
    ).toEqual([]);
  });
});
