import React, { useCallback, useState } from 'react';
import { Platform, View } from 'react-native';
import Button from './Button.js';
import { InlineNotice } from './StateViews.js';
import { spacing } from '../theme/index.js';
import { saveReceipt } from '../services/receipt-download.service.js';
import { receiptFilename, receiptToText } from '../utils/receiptArchive.js';

/**
 * Fiş ekranlarının altındaki eylem çubuğu — hem müşteri hem esnaf fişinde AYNI
 * bileşen kullanılır.
 *
 * Web'de dosya indirilir, telefonda sistem paylaşım sayfası açılır (kullanıcı
 * fişi kendi e-posta/mesaj uygulamasıyla gönderebilir). Düğme etiketi bu yüzden
 * platforma göre değişir — "İndir" yazıp paylaşım sayfası açmak yanıltıcı olurdu.
 *
 * @param {object} props
 * @param {object} props.document - `GET /transactions/:txHash/gib-document` yanıtı.
 * @param {string} props.txHash
 * @param {string} [props.paidAt] - Dosya adındaki tarih için ISO değer.
 * @param {string} [props.warning] - Varsa metne de yazılır (ör. eski/hatalı tutarlı belge).
 */
export default function ReceiptActions({ document, txHash, paidAt, warning }) {
  const [state, setState] = useState({ status: 'idle', message: null });
  const isWeb = Platform.OS === 'web';

  const handleSave = useCallback(async () => {
    setState({ status: 'working', message: null });
    try {
      const result = await saveReceipt({
        text: receiptToText(document, { warning }),
        filename: receiptFilename({ txHash, paidAt: paidAt ?? document?.createdAt }),
      });
      setState({
        status: 'done',
        message: result.method === 'download' ? 'Fiş cihazınıza indirildi.' : null,
      });
    } catch {
      setState({ status: 'error', message: 'Fiş kaydedilemedi — tekrar deneyin.' });
    }
  }, [document, txHash, paidAt, warning]);

  return (
    <View style={{ alignSelf: 'stretch', marginTop: spacing.md }}>
      <Button
        label={isWeb ? 'Fişi İndir' : 'Fişi Paylaş'}
        icon={isWeb ? 'download' : 'external'}
        variant="secondary"
        loading={state.status === 'working'}
        onPress={handleSave}
      />
      {state.message && (
        <InlineNotice
          tone={state.status === 'error' ? 'danger' : 'success'}
          style={{ alignSelf: 'stretch', marginTop: spacing.sm }}
        >
          {state.message}
        </InlineNotice>
      )}
    </View>
  );
}
