// Copyright 2026 Suruch Chakrapeesirisuk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from 'react';

/**
 * [text] as a QR code image (a data URL), or null while it is drawn.
 *
 * The encoder is loaded on demand: it is dead weight on every other screen.
 * Black on white with a quiet zone, whatever the theme: a phone camera reads
 * that, and a dark-mode inversion it may not.
 */
export function useQrCode(text: string, width: number): string | null {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    void (async () => {
      const { toDataURL } = await import('qrcode');
      const dataUrl = await toDataURL(text, { margin: 2, width, errorCorrectionLevel: 'M' });
      if (!cancelled) setImage(dataUrl);
    })();
    return () => {
      cancelled = true;
    };
  }, [text, width]);

  return image;
}
