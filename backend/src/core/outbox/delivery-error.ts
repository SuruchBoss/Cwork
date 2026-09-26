// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

/**
 * A failure that retrying cannot fix.
 *
 * The outbox retries by default, which is right for a relay that is down and
 * wrong for an address that does not exist: eight attempts over an hour, and
 * the eighth is refused for the same reason as the first. A handler that knows
 * the difference — an SMTP 5xx, an FCM `UNREGISTERED` — throws this, and the
 * dispatcher parks the event as a dead letter straight away.
 *
 * When in doubt, throw an ordinary error. Retrying something permanent wastes
 * an hour; giving up on something transient loses the message.
 */
export class PermanentDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentDeliveryError';
  }
}
