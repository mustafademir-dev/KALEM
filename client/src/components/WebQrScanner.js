/**
 * Web QR Tarayıcı
 *
 * `expo-camera`'nın `CameraView`'i web'de kamera ÖNİZLEMESİNİ gösterebilir
 * ama barkod ÇÖZÜMLEMESİ web'de çalışmaz — tarayıcılarda `expo-camera`'nın
 * dayandığı native barkod dedektörü yoktur (yalnızca iOS/Android'de vardır).
 * Bu yüzden web'de kendi `getUserMedia` + `<video>`/`<canvas>` + `jsQR`
 * döngümüzü kullanıyoruz — yalnızca `Platform.OS === 'web'` dalında monte
 * edilir (bkz. PaymentScreen.js).
 *
 * `status` üst bileşene `onStatusChange` ile bildirilir ki üst bileşen
 * native yoldaki izin kartıyla AYNI görsel dili kullanabilsin.
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import jsQR from 'jsqr';

const SCAN_INTERVAL_MS = 200;
/** getUserMedia izin isteği hiç yanıtlanmazsa (bazı ortamlarda promise hiç
 * çözülmez/reddedilmez) sonsuza kadar "başlatılıyor" durumunda kilitli
 * kalmamak için üst sınır. */
const PERMISSION_TIMEOUT_MS = 10000;

/** @typedef {'starting'|'streaming'|'denied'|'unsupported'} WebScanStatus */

export default function WebQrScanner({ onScanned, onStatusChange }) {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator?.mediaDevices?.getUserMedia) {
        onStatusChange('unsupported');
        return;
      }
      try {
        const stream = await Promise.race([
          navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('CAMERA_PERMISSION_TIMEOUT')), PERMISSION_TIMEOUT_MS)
          ),
        ]);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.srcObject = stream;
        containerRef.current?.appendChild(video);
        videoRef.current = video;
        await video.play();

        canvasRef.current = document.createElement('canvas');
        onStatusChange('streaming');

        intervalRef.current = setInterval(decodeFrame, SCAN_INTERVAL_MS);
      } catch {
        if (!cancelled) onStatusChange('denied');
      }
    }

    function decodeFrame() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < video.HAVE_CURRENT_DATA) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, width, height);

      let imageData;
      try {
        imageData = ctx.getImageData(0, 0, width, height);
      } catch {
        return;
      }

      const result = jsQR(imageData.data, width, height, { inversionAttempts: 'dontInvert' });
      if (result?.data) {
        onScanned({ data: result.data });
      }
    }

    start();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      videoRef.current?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <View ref={containerRef} style={StyleSheet.absoluteFill} />;
}
