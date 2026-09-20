/**
 * Tek bir fişin cihaza indirilmesi / paylaşılması.
 *
 * `report-download.service.js` (gün sonu CSV) ile AYNI kalıp, tek farkla:
 * orada dosya sunucudan indirilir, burada fiş belgesi zaten ekranda yüklü
 * olduğu için metin İSTEMCİDE üretilir (`utils/receiptArchive.js#receiptToText`)
 * — ek bir sunucu isteği yapılmaz.
 *
 * - Web: Blob olarak indirilir.
 * - iOS/Android: yeni bağımlılık eklemeden sistem paylaşım sayfası açılır —
 *   kullanıcı fişi kendi e-posta/mesaj uygulamasıyla gönderebilir.
 *   (DİKKAT: bu yol gerçek cihazda HENÜZ DOĞRULANMADI — gün sonu CSV'sinde de
 *   aynı not geçerli.)
 *
 * NOT: "e-posta ile fiş gönderimi" bilinçli olarak SUNUCUDA yapılmaz. Sunucu
 * mail atsaydı müşteriden e-posta adresi toplamak (KVKK), bir sağlayıcı hesabı
 * ve alan adı doğrulaması gerekirdi. Bu yolda gönderimi kullanıcı kendi
 * uygulamasıyla yapar; sistem kişisel veri toplamaz.
 */

import { Platform, Share } from 'react-native';

/**
 * @param {object} params
 * @param {string} params.text - Fişin düz metni (`receiptToText` çıktısı).
 * @param {string} params.filename - "SİMÜLASYON" ibaresi içeren dosya adı.
 * @returns {Promise<{filename: string, method: 'download'|'share'}>}
 * @throws {Error} Tarayıcı/sistem indirmeyi reddederse (çağıran yakalar).
 */
export async function saveReceipt({ text, filename }) {
  if (Platform.OS === 'web') {
    // UTF-8 BOM: Windows Not Defteri gibi eski araçlar BOM'suz dosyayı ANSI
    // sanıp Türkçe karakterleri bozabiliyor (gün sonu CSV'sinde aynı önlem var).
    const blob = new Blob(['﻿', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { filename, method: 'download' };
  }

  await Share.share({ title: filename, message: text });
  return { filename, method: 'share' };
}
