import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Clipboard from 'expo-clipboard';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import StatusStep from '../components/StatusStep.js';
import WebQrScanner from '../components/WebQrScanner.js';
import BackButton from '../components/BackButton.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { createWallet, loadWallet } from '../services/wallet.service.js';
import { readDtlBalance, awaitInnerTransactionConfirmation } from '../services/stellar-read.service.js';
import { createPaymentTransaction } from '../services/transaction.service.js';
import { submitTransaction, getGibDocument, ApiError } from '../services/api.service.js';
import { parseQrPayload, getSampleQrPayload, QrPayloadError } from '../utils/qrPayload.js';
import { formatDtl, shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

/** @typedef {'scan'|'confirm'|'processing'|'result'} StageId */

export default function PaymentScreen() {
  const [stage, setStage] = useState('booting');
  const [wallet, setWallet] = useState(null);
  const [scanError, setScanError] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [webScanStatus, setWebScanStatus] = useState('starting');
  const [webScannerKey, setWebScannerKey] = useState(0);
  const scanLockRef = useRef(false);

  const [qrData, setQrData] = useState(null);
  const [balanceBefore, setBalanceBefore] = useState(undefined); // undefined = yükleniyor, null = alınamadı

  const [steps, setSteps] = useState({ sign: 'pending', submit: 'pending', confirm: 'pending' });
  const [result, setResult] = useState(null); // { ok, txHash, message }

  useEffect(() => {
    (async () => {
      let w = await loadWallet();
      if (!w) w = await createWallet();
      setWallet(w);
      setStage('scan');
    })();
  }, []);

  const handleQrResolved = useCallback(async (raw) => {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    try {
      const parsed = parseQrPayload(raw);
      setQrData(parsed);
      setScanError(null);
      setStage('confirm');
      setBalanceBefore(undefined);
      try {
        const bal = await readDtlBalance(wallet.stellarAddress);
        setBalanceBefore(bal);
      } catch {
        setBalanceBefore(null);
      }
    } catch (err) {
      setScanError(err instanceof QrPayloadError ? err.message : 'QR kodu okunamadı.');
      scanLockRef.current = false;
    }
  }, [wallet]);

  const handleBarcodeScanned = useCallback(
    ({ data }) => {
      handleQrResolved(data);
    },
    [handleQrResolved]
  );

  const handleUseSampleQr = useCallback(() => {
    scanLockRef.current = false;
    handleQrResolved(getSampleQrPayload());
  }, [handleQrResolved]);

  const handleRetryWebCamera = useCallback(() => {
    setWebScanStatus('starting');
    setWebScannerKey((k) => k + 1);
  }, []);

  const handleCancelConfirm = useCallback(() => {
    scanLockRef.current = false;
    setQrData(null);
    setScanError(null);
    setStage('scan');
  }, []);

  const handleConfirmPayment = useCallback(async () => {
    setStage('processing');
    setSteps({ sign: 'active', submit: 'pending', confirm: 'pending' });
    setResult(null);

    let innerTxHash;
    try {
      const built = await createPaymentTransaction({
        senderAddress: wallet.stellarAddress,
        merchantStellarAddress: qrData.stellarAddress,
        totalAmount: qrData.totalAmount,
      });
      innerTxHash = built.innerTxHash;
      setSteps((s) => ({ ...s, sign: 'done', submit: 'active' }));

      await submitTransaction({
        signedXdr: built.signedXdr,
        idempotencyKey: built.idempotencyKey,
        merchantId: qrData.merchantId,
        totalAmount: qrData.totalAmount,
        cartItems: qrData.cartItems,
      });
      setSteps((s) => ({ ...s, submit: 'done', confirm: 'active' }));

      const confirmation = await awaitInnerTransactionConfirmation(wallet.stellarAddress, innerTxHash);

      if (confirmation.status === 'success') {
        setSteps((s) => ({ ...s, confirm: 'done' }));
        setResult({ ok: true, txHash: confirmation.txHash });
      } else if (confirmation.status === 'timeout') {
        setSteps((s) => ({ ...s, confirm: 'done' }));
        setResult({
          ok: true,
          txHash: null,
          message: 'İşlem ağa iletildi; zincir onayı beklenenden uzun sürüyor. Kısa süre sonra işlem geçmişinde görünecektir.',
        });
      } else {
        setSteps((s) => ({ ...s, confirm: 'error' }));
        setResult({ ok: false, message: 'İşlem zincirde başarısız oldu.' });
      }
    } catch (err) {
      setSteps((s) => ({
        sign: s.sign === 'active' ? 'error' : s.sign,
        submit: s.submit === 'active' ? 'error' : s.submit,
        confirm: s.confirm === 'active' ? 'error' : s.confirm,
      }));
      setResult({ ok: false, message: describeError(err) });
    } finally {
      setStage('result');
    }
  }, [wallet, qrData]);

  const handleReset = useCallback(() => {
    scanLockRef.current = false;
    setQrData(null);
    setBalanceBefore(undefined);
    setSteps({ sign: 'pending', submit: 'pending', confirm: 'pending' });
    setResult(null);
    setStage('scan');
  }, []);

  if (stage === 'booting' || !wallet) {
    return (
      <Screen>
        <View style={styles.centerFill}>
          <Text style={[type.body, { color: colors.textMuted }]}>Cüzdan hazırlanıyor…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      {stage === 'scan' && (
        <ScanStage
          permission={permission}
          requestPermission={requestPermission}
          onScanned={handleBarcodeScanned}
          onUseSample={handleUseSampleQr}
          error={scanError}
          webScanStatus={webScanStatus}
          onWebStatusChange={setWebScanStatus}
          onRetryWebCamera={handleRetryWebCamera}
          webScannerKey={webScannerKey}
        />
      )}
      {stage === 'confirm' && (
        <ConfirmStage
          qrData={qrData}
          balanceBefore={balanceBefore}
          onConfirm={handleConfirmPayment}
          onCancel={handleCancelConfirm}
        />
      )}
      {stage === 'processing' && <ProcessingStage steps={steps} />}
      {stage === 'result' && (
        <ResultStage
          result={result}
          qrData={qrData}
          onDone={handleReset}
          senderAddress={wallet.stellarAddress}
        />
      )}
    </Screen>
  );
}

function ScanStage({
  permission,
  requestPermission,
  onScanned,
  onUseSample,
  error,
  webScanStatus,
  onWebStatusChange,
  onRetryWebCamera,
  webScannerKey,
}) {
  const isWeb = Platform.OS === 'web';
  const canUseNativeCamera = !isWeb && permission && permission.granted;

  return (
    <View style={styles.fill}>
      <View style={styles.header}>
        <BackButton style={{ marginBottom: spacing.sm }} />
        <Text style={[type.h1, { color: colors.textPrimary }]}>Ödeme Yap</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Esnafın QR kodunu çerçeve içine hizalayın
        </Text>
      </View>

      <View style={styles.cameraWrap}>
        {isWeb ? (
          <View style={styles.cameraFrame}>
            <WebQrScanner key={webScannerKey} onScanned={onScanned} onStatusChange={onWebStatusChange} />
            {webScanStatus === 'streaming' && <View style={styles.scanCorner} pointerEvents="none" />}
            {webScanStatus !== 'streaming' && (
              <View style={[StyleSheet.absoluteFill, styles.webStatusOverlay]}>
                <View style={styles.permissionCard}>
                  {webScanStatus === 'starting' && (
                    <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Kamera başlatılıyor…
                    </Text>
                  )}
                  {webScanStatus === 'denied' && (
                    <>
                      <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                        Kamera izni verilmedi. Tarayıcı adres çubuğundan izin verip tekrar deneyin.
                      </Text>
                      <Button label="Tekrar Dene" onPress={onRetryWebCamera} style={{ marginTop: spacing.md }} />
                    </>
                  )}
                  {webScanStatus === 'unsupported' && (
                    <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
                      Bu tarayıcı kamera erişimini desteklemiyor — Demo QR'ı kullanabilirsiniz.
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : permission && !permission.granted ? (
          <View style={styles.permissionCard}>
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              QR kodu okutmak için kamera izni gerekiyor.
            </Text>
            <Button label="Kameraya İzin Ver" onPress={requestPermission} style={{ marginTop: spacing.md }} />
          </View>
        ) : canUseNativeCamera ? (
          <View style={styles.cameraFrame}>
            <CameraView
              style={StyleSheet.absoluteFill}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={onScanned}
            />
            <View style={styles.scanCorner} pointerEvents="none" />
          </View>
        ) : (
          <View style={styles.permissionCard}>
            <Text style={[type.body, { color: colors.textSecondary, textAlign: 'center' }]}>
              Kamera hazırlanıyor…
            </Text>
          </View>
        )}
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={[type.captionMedium, { color: colors.danger }]}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Pressable onPress={onUseSample} style={styles.sampleLink}>
          <Text style={[type.captionMedium, { color: colors.accent }]}>Demo QR ile dene →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function ConfirmStage({ qrData, balanceBefore, onConfirm, onCancel }) {
  const insufficientFunds =
    balanceBefore != null && BigInt(balanceBefore) < BigInt(qrData.totalAmount);
  const balanceAfter =
    balanceBefore != null ? (BigInt(balanceBefore) - BigInt(qrData.totalAmount)).toString() : null;

  return (
    <ScrollView contentContainerStyle={styles.confirmScroll}>
      <View style={styles.header}>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Ödemeyi Onayla</Text>
      </View>

      <View style={[styles.card, insufficientFunds && styles.cardDanger]}>
        <Text style={[type.caption, { color: colors.textMuted }]}>ESNAF</Text>
        <Text style={[type.h2, { color: colors.textPrimary, marginTop: 2 }]}>{qrData.businessName}</Text>

        <View style={styles.divider} />

        <Text style={[type.caption, { color: colors.textMuted }]}>TUTAR</Text>
        <Text style={styles.amount}>{formatDtl(qrData.totalAmount)}</Text>

        {qrData.cartItems?.length > 0 && (
          <View style={styles.cartList}>
            {qrData.cartItems.map((item, idx) => (
              <View key={idx} style={styles.cartRow}>
                <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {item.quantity > 1 ? `${item.quantity}× ` : ''}
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{formatDtl(item.price)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.balanceRow}>
          <Text style={[type.caption, { color: colors.textMuted }]}>Cüzdan bakiyeniz</Text>
          <Text style={[type.captionMedium, { color: colors.textSecondary }]}>
            {balanceBefore === undefined ? 'Yükleniyor…' : balanceBefore === null ? 'Alınamadı' : formatDtl(balanceBefore)}
          </Text>
        </View>
        {balanceAfter !== null && (
          <View style={styles.balanceRow}>
            <Text style={[type.caption, { color: colors.textMuted }]}>İşlem sonrası</Text>
            <Text
              style={[
                type.captionMedium,
                { color: insufficientFunds ? colors.danger : colors.textSecondary },
              ]}
            >
              {formatDtl(balanceAfter)}
            </Text>
          </View>
        )}

        {qrData.isStale && (
          <Text style={[type.caption, { color: colors.warning, marginTop: spacing.sm }]}>
            Bu QR kodu bir süre önce üretilmiş — tutarı esnafla teyit edin.
          </Text>
        )}
        {insufficientFunds && (
          <Text style={[type.captionMedium, { color: colors.danger, marginTop: spacing.sm }]}>
            Bakiyeniz bu ödeme için yetersiz.
          </Text>
        )}
      </View>

      <View style={styles.confirmActions}>
        <Button label="İmzala ve Öde" onPress={onConfirm} disabled={insufficientFunds || balanceBefore === undefined} />
        <Button label="Vazgeç" variant="secondary" onPress={onCancel} style={{ marginTop: spacing.sm }} />
      </View>
    </ScrollView>
  );
}

function ProcessingStage({ steps }) {
  return (
    <View style={styles.centerFill}>
      <View style={styles.processingCard}>
        <Text style={[type.h2, { color: colors.textPrimary, marginBottom: spacing.md }]}>
          Ödeme işleniyor
        </Text>
        <StatusStep label="Cihazda imzalanıyor" state={steps.sign} />
        <StatusStep label="Ağa iletiliyor" state={steps.submit} />
        <StatusStep label="Zincirde onaylanıyor" state={steps.confirm} />
      </View>
    </View>
  );
}

function ResultStage({ result, qrData, onDone, senderAddress }) {
  const isSuccess = result?.ok;
  const [gibState, setGibState] = useState({ status: 'idle', document: null, error: null });

  const handleCopyHash = useCallback(async () => {
    if (!result?.txHash) return;
    await Clipboard.setStringAsync(result.txHash);
  }, [result]);

  const handleShowGib = useCallback(async () => {
    if (!result?.txHash) return;
    setGibState({ status: 'loading', document: null, error: null });
    try {
      const document = await getGibDocument(result.txHash, { senderAddress });
      setGibState({ status: 'loaded', document, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Bu işlem için e-belge henüz üretilmedi — birkaç saniye sonra tekrar deneyin.'
          : 'e-Belge alınamadı.';
      setGibState({ status: 'error', document: null, error: message });
    }
  }, [result, senderAddress]);

  return (
    <View style={styles.centerFill}>
      <View style={styles.resultCard}>
        <View
          style={[
            styles.resultBadge,
            { backgroundColor: isSuccess ? colors.successBg : colors.dangerBg },
          ]}
        >
          <Text style={{ fontSize: 32 }}>{isSuccess ? '✓' : '✕'}</Text>
        </View>

        <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
          {isSuccess ? 'Ödeme Tamamlandı' : 'Ödeme Başarısız'}
        </Text>

        {isSuccess && qrData && (
          <Text style={[styles.amount, { marginTop: spacing.xs }]}>{formatDtl(qrData.totalAmount)}</Text>
        )}
        {isSuccess && qrData && (
          <Text style={[type.body, { color: colors.textSecondary, marginTop: 2 }]}>{qrData.businessName}</Text>
        )}

        {result?.message && (
          <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.sm, textAlign: 'center' }]}>
            {result.message}
          </Text>
        )}

        {result?.txHash && (
          <Pressable onPress={handleCopyHash} style={styles.hashChip}>
            <Text style={[type.mono, { color: colors.textSecondary }]}>{shortenMiddle(result.txHash, 10, 10)}</Text>
            <Text style={[type.micro, { color: colors.accent, marginTop: 2 }]}>DOKUN: KOPYALA</Text>
          </Pressable>
        )}
        {result?.txHash && (
          <Pressable onPress={() => Linking.openURL(stellarExpertTxUrl(result.txHash))}>
            <Text style={[type.captionMedium, { color: colors.accent, marginTop: spacing.xs }]}>
              Stellar Expert'te görüntüle ↗
            </Text>
          </Pressable>
        )}

        {isSuccess && result?.txHash && gibState.status !== 'loaded' && (
          <Button
            label="e-Belge Görüntüle"
            variant="secondary"
            onPress={handleShowGib}
            loading={gibState.status === 'loading'}
            style={{ marginTop: spacing.md, minWidth: 220 }}
          />
        )}
        {gibState.status === 'error' && (
          <Text style={[type.caption, { color: colors.danger, marginTop: spacing.sm, textAlign: 'center' }]}>
            {gibState.error}
          </Text>
        )}
        {gibState.status === 'loaded' && (
          <View style={{ marginTop: spacing.md, width: '100%' }}>
            <GibReceiptCard document={gibState.document} />
          </View>
        )}

        <Button label="Ana Ekrana Dön" onPress={onDone} style={{ marginTop: spacing.xl, minWidth: 220 }} />
      </View>
    </View>
  );
}

function describeError(err) {
  if (err instanceof ApiError) {
    if (err.code === 'NETWORK_ERROR') return err.message;
    if (err.status === 409) return 'Bu ödeme zaten işleniyor — lütfen bekleyin.';
    if (err.status === 401 || err.status === 403) return 'Ödeme yetkilendirilemedi.';
    return err.message ?? 'İşlem gönderilirken bir hata oluştu.';
  }
  return err?.message ?? 'Beklenmeyen bir hata oluştu.';
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cameraWrap: { flex: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  cameraFrame: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 360,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  scanCorner: {
    position: 'absolute',
    top: '18%',
    left: '18%',
    right: '18%',
    bottom: '18%',
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: radii.md,
  },
  webStatusOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  permissionCard: {
    width: '100%',
    maxWidth: 360,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    ...cardShadow,
  },
  errorBanner: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.dangerBg,
  },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
  sampleLink: { padding: spacing.sm },
  confirmScroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginTop: spacing.md,
    ...cardShadow,
  },
  cardDanger: { borderColor: colors.danger },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  amount: { fontFamily: 'Inter_800ExtraBold', fontSize: 36, color: colors.accent, marginTop: 4 },
  cartList: { marginTop: spacing.sm, gap: 4 },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  confirmActions: { marginTop: spacing.lg },
  processingCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  resultCard: { alignItems: 'center', width: '100%', maxWidth: 360 },
  resultBadge: {
    width: 72,
    height: 72,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hashChip: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
});
