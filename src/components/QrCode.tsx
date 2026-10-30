import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

import { utf8BinaryString } from '../lib/utf8';

const MARGIN = 2;

export function QrCode({ value, size }: { value: string; size: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(utf8BinaryString(value), 'Byte');
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) d += `M${c + MARGIN},${r + MARGIN}h1v1h-1z`;
      }
    }
    return { path: d, count: n + MARGIN * 2 };
  }, [value]);

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
      <Rect width={count} height={count} fill="#FFFFFF" />
      <Path d={path} fill="#000000" />
    </Svg>
  );
}

/** Escapes a value for the WIFI: QR payload format. */
function wifiEscape(s: string) {
  return s.replace(/([\\;,":])/g, '\\$1');
}

export function wifiPayload(ssid: string, password: string, security: 'WPA' | 'WEP' | 'nopass') {
  const pass = security === 'nopass' ? '' : `P:${wifiEscape(password)};`;
  return `WIFI:T:${security};S:${wifiEscape(ssid)};${pass};`;
}
