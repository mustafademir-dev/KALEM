import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
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
import Icon from '../components/Icon.js';
import TestnetBadge from '../components/TestnetBadge.js';
import Amount from '../components/Amount.js';
import { InlineNotice, MerchantAvatar, Skeleton, StatusBadge } from '../components/StateViews.js';
import StatusStep from '../components/StatusStep.js';
import WebQrScanner from '../components/WebQrScanner.js';
import BackButton from '../components/BackButton.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { createWallet, loadWallet } from '../services/wallet.service.js';
import { recordReceipt } from '../services/receipt-archive.service.js';
import ReceiptActions from '../components/ReceiptActions.js';
import { useNavigation } from '../navigation/Navigator.js';
import { readDtlBalance, awaitInnerTransactionConfirmation } from '../services/stellar-read.service.js';
import { createPaymentTransaction } from '../services/transaction.service.js';
import { submitTransaction, getGibDocument, ApiError } from '../services/api.service.js';
import { parseQrPayload, getSampleQrPayload, QrPayloadError } from '../utils/qrPayload.js';
import { formatTl, shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

/** @typedef {'scan'|'confirm'|'processing'|'result'} StageId */

export default function PaymentScreen() {
  const { goBack } = useNavigation();
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
  const [result, setResult] = useState(null); // { ok, txHash, message, innerTxHash? }
  const [rechecking, setRechecking] = useState(false);

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

      const submitted = await submitTransaction({
        signedXdr: built.signedXdr,
        idempotencyKey: built.idempotencyKey,
        merchantId: qrData.merchantId,
        totalAmount: qrData.totalAmount,
        cartItems: qrData.cartItems,
      });
      setSteps((s) => ({ ...s, submit: 'done', confirm: 'active' }));

      // Sunucu, Horizon'un senkron cevabını (işlem ledger'a yazıldıktan sonra
      // döner) yanıtla birlikte iletir — bu durumda ayrıca Horizon'u yoklamaya
      // gerek yok (0,2-2,7 sn kazanç). Eski biçimde (txHash yok) yoklama sürer.
      const confirmation = submitted?.txHash
        ? { status: 'success', txHash: submitted.txHash, ledger: submitted.ledger }
        : await awaitInnerTransactionConfirmation(wallet.stellarAddress, innerTxHash);

      if (confirmation.status === 'success') {
        setSteps((s) => ({ ...s, confirm: 'done' }));
        setResult({ ok: true, txHash: confirmation.txHash });
        // Fiş arşivine yaz (cihazda). Bu çağrı hata FIRLATMAZ — depo dolu ya da
        // erişilemez olsa bile ödeme sonucu etkilenmez, yalnızca liste eksik kalır.
        await recordReceipt({
          stellarAddress: wallet.stellarAddress,
          txHash: confirmation.txHash,
          totalAmount: qrData.totalAmount,
          businessName: qrData.businessName,
        });
      } else if (confirmation.status === 'timeout') {
        setSteps((s) => ({ ...s, confirm: 'done' }));
        setResult({
          ok: true,
          txHash: null,
          // innerTxHash saklanır: kullanıcı "Durumu Kontrol Et" derse onay bu
          // hash ile yeniden aranır. Onaylanırsa fiş de o anda arşive yazılır —
          // aksi halde zaman aşımına uğrayan bir ödeme, sonradan zincirde
          // onaylansa bile Fişlerim'e hiç girmezdi.
          innerTxHash,
          message: 'İşlem ağa iletildi ama zincir onayı henüz görünmüyor. Aşağıdan durumu yeniden kontrol edebilirsiniz.',
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

  /**
   * Zaman aşımına uğramış bir ödemenin onayını yeniden arar. Onay bulunursa
   * ekran "tamamlandı"ya geçer VE fiş arşive yazılır; hâlâ yoksa kullanıcı
   * belirsizlikte bırakılmaz, durum açıkça söylenir.
   */
  const handleRecheck = useCallback(async () => {
    if (!result?.innerTxHash || !wallet || !qrData) return;
    setRechecking(true);
    try {
      const confirmation = await awaitInnerTransactionConfirmation(wallet.stellarAddress, result.innerTxHash, {
        timeoutMs: 15000,
      });
      if (confirmation.status === 'success') {
        setResult({ ok: true, txHash: confirmation.txHash });
        await recordReceipt({
          stellarAddress: wallet.stellarAddress,
          txHash: confirmation.txHash,
          totalAmount: qrData.totalAmount,
          businessName: qrData.businessName,
        });
      } else if (confirmation.status === 'failed') {
        setResult({ ok: false, message: 'İşlem zincirde başarısız oldu.' });
      } else {
        setResult((r) => ({
          ...r,
          message:
            'Zincir onayı hâlâ görünmüyor. Ödeme ağa iletildi; birkaç dakika sonra tekrar deneyin ya da esnafla teyit edin.',
        }));
      }
    } catch {
      setResult((r) => ({ ...r, message: 'Durum kontrol edilemedi — internet bağlantınızı kontrol edin.' }));
    } finally {
      setRechecking(false);
    }
  }, [result, wallet, qrData]);

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
      {stage === 'processing' && <ProcessingStage steps={steps} qrData={qrData} />}
      {stage === 'result' && (
        <ResultStage
          result={result}
          qrData={qrData}
          onDone={handleReset}
          onHome={goBack}
          onRecheck={handleRecheck}
          rechecking={rechecking}
          senderAddress={wallet.stellarAddress}
        />
      )}
    </Screen>
  );
}

export function ScanStage({
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
            {webScanStatus === 'streaming' && <Viewfinder />}
            {webScanStatus !== 'streaming' && (
              <View style={[StyleSheet.absoluteFill, styles.webStatusOverlay]}>
                <View style={styles.permissionCard}>
                  {webScanStatus === 'starting' && (
                    <>
                      <ActivityIndicator color={colors.accent} />
                      <Text style={[type.body, styles.centerText, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                        Kamera başlatılıyor…
                      </Text>
                    </>
                  )}
                  {webScanStatus === 'denied' && (
                    <>
                      <IconCircle name="camera" />
                      <Text style={[type.h2, styles.centerText, { color: colors.textPrimary, marginTop: spacing.sm }]}>
                        Kamera izni gerekli
                      </Text>
                      <Text style={[type.body, styles.centerText, { color: colors.textSecondary, marginTop: 4 }]}>
                        Tarayıcı adres çubuğundan izin verip tekrar deneyin.
                      </Text>
                      <Button label="Tekrar Dene" icon="refresh" onPress={onRetryWebCamera} style={{ marginTop: spacing.md }} />
                    </>
                  )}
                  {webScanStatus === 'unsupported' && (
                    <>
                      <IconCircle name="info" />
                      <Text style={[type.body, styles.centerText, { color: colors.textSecondary, marginTop: spacing.sm }]}>
                        Bu tarayıcı kamera erişimini desteklemiyor — Demo QR'ı kullanabilirsiniz.
                      </Text>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        ) : permission && !permission.granted ? (
          <View style={styles.permissionCard}>
            <IconCircle name="camera" />
            <Text style={[type.h2, styles.centerText, { color: colors.textPrimary, marginTop: spacing.sm }]}>
              Kamera izni gerekli
            </Text>
            <Text style={[type.body, styles.centerText, { color: colors.textSecondary, marginTop: 4 }]}>
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
            <Viewfinder />
          </View>
        ) : (
          <View style={styles.permissionCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.body, styles.centerText, { color: colors.textSecondary, marginTop: spacing.sm }]}>
              Kamera hazırlanıyor…
            </Text>
          </View>
        )}
      </View>

      {error ? <InlineNotice tone="danger" style={styles.errorBanner}>{error}</InlineNotice> : null}

      <View style={styles.footer}>
        <Text style={[type.caption, { color: colors.textMuted, marginBottom: spacing.xs }]}>
          Kamera kullanamıyor musunuz?
        </Text>
        <Button label="Demo QR ile dene" variant="secondary" icon="qr" onPress={onUseSample} style={styles.sampleButton} />
      </View>
    </View>
  );
}

/** Köşe işaretleri + yavaşça süpüren tarama çizgisi. Yalnızca görsel rehber. */
function Viewfinder() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, { toValue: 1, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(sweep, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const top = sweep.interpolate({ inputRange: [0, 1], outputRange: ['6%', '94%'] });

  return (
    <View style={styles.scanBox} pointerEvents="none">
      <View style={[styles.corner, styles.cornerTL]} />
      <View style={[styles.corner, styles.cornerTR]} />
      <View style={[styles.corner, styles.cornerBL]} />
      <View style={[styles.corner, styles.cornerBR]} />
      <Animated.View style={[styles.scanLine, { top }]} />
    </View>
  );
}

function IconCircle({ name }) {
  return (
    <View style={styles.iconCircle}>
      <Icon name={name} size={26} color={colors.accentStrong} />
    </View>
  );
}

export function ConfirmStage({ qrData, balanceBefore, onConfirm, onCancel }) {
  const insufficientFunds =
    balanceBefore != null && BigInt(balanceBefore) < BigInt(qrData.totalAmount);
  const balanceAfter =
    balanceBefore != null ? (BigInt(balanceBefore) - BigInt(qrData.totalAmount)).toString() : null;

  return (
    <ScrollView contentContainerStyle={styles.confirmScroll}>
      <View style={styles.header}>
        <Text style={[type.h1, { color: colors.textPrimary }]}>Ödemeyi Onayla</Text>
        <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
          Bilgileri kontrol edip onaylayın
        </Text>
        <TestnetBadge note style={{ marginTop: spacing.xs }} />
      </View>

      <View style={[styles.card, insufficientFunds && styles.cardDanger]}>
        <View style={styles.merchantRow}>
          <MerchantAvatar name={qrData.businessName} />
          <View style={{ flex: 1 }}>
            <Text style={[type.micro, { color: colors.textMuted }]}>ESNAF</Text>
            <Text style={[type.h2, { color: colors.textPrimary }]} numberOfLines={1}>
              {qrData.businessName}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <Text style={[type.micro, { color: colors.textMuted }]}>ÖDENECEK TUTAR</Text>
        <Amount stroops={qrData.totalAmount} size={40} style={{ marginTop: 2 }} />

        {qrData.cartItems?.length > 0 && (
          <View style={styles.cartList}>
            {qrData.cartItems.map((item, idx) => (
              <View key={idx} style={styles.cartRow}>
                <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
                  {item.quantity > 1 ? `${item.quantity}× ` : ''}
                  {item.name}
                </Text>
                <Text style={[type.caption, { color: colors.textSecondary }]}>{formatTl(item.price)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />

        <View style={styles.balanceRow}>
          <View style={styles.balanceLabel}>
            <Icon name="wallet" size={15} color={colors.textMuted} />
            <Text style={[type.caption, { color: colors.textMuted }]}>Cüzdan bakiyeniz</Text>
          </View>
          {balanceBefore === undefined ? (
            <Skeleton width={104} />
          ) : balanceBefore === null ? (
            <Text style={[type.captionMedium, { color: colors.textMuted }]}>Alınamadı</Text>
          ) : (
            <Text style={[type.captionMedium, { color: colors.textSecondary }]}>{formatTl(balanceBefore)}</Text>
          )}
        </View>
        <View style={styles.balanceRow}>
          <View style={styles.balanceLabel}>
            <Icon name="arrowRight" size={15} color={colors.textMuted} />
            <Text style={[type.caption, { color: colors.textMuted }]}>İşlem sonrası</Text>
          </View>
          {balanceBefore === undefined ? (
            <Skeleton width={104} />
          ) : balanceAfter !== null ? (
            <Text
              style={[
                type.captionMedium,
                { color: insufficientFunds ? colors.danger : colors.textSecondary },
              ]}
            >
              {formatTl(balanceAfter)}
            </Text>
          ) : (
            <Text style={[type.captionMedium, { color: colors.textMuted }]}>—</Text>
          )}
        </View>

        {qrData.isStale && (
          <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
            Bu QR kodu bir süre önce üretilmiş — tutarı esnafla teyit edin.
          </InlineNotice>
        )}
        {balanceBefore === null && (
          <InlineNotice tone="info" style={{ marginTop: spacing.md }}>
            Bakiyeniz okunamadı. Ödeme yine de denenebilir; yetersizse zincir reddeder.
          </InlineNotice>
        )}
        {insufficientFunds && (
          <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
            Bakiyeniz bu ödeme için yetersiz.
          </InlineNotice>
        )}
      </View>

      <View style={styles.confirmActions}>
        <Button
          label="İmzala ve Öde"
          icon="shield"
          onPress={onConfirm}
          disabled={insufficientFunds || balanceBefore === undefined}
        />
        <Button label="Vazgeç" variant="secondary" onPress={onCancel} style={{ marginTop: spacing.sm }} />
        <View style={styles.assurance}>
          <Icon name="shield" size={14} color={colors.textMuted} />
          <Text style={[type.caption, { color: colors.textMuted }]}>Cihazınızda imzalanır · Ağ ücreti sizden alınmaz</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const PROCESSING_STEPS = [
  { key: 'sign', label: 'Cihazda imzalanıyor', hint: 'Anahtarınız cihazdan çıkmaz' },
  { key: 'submit', label: 'Ağa iletiliyor', hint: 'Ağ ücretini KALEM üstlenir' },
  { key: 'confirm', label: 'Zincirde onaylanıyor', hint: 'Stellar ağı işlemi kesinleştiriyor' },
];

export function ProcessingStage({ steps, qrData }) {
  return (
    <View style={styles.centerFill}>
      <View style={styles.processingCard}>
        {qrData ? (
          <View style={styles.processingSummary}>
            <MerchantAvatar name={qrData.businessName} size={40} />
            <View style={{ flex: 1 }}>
              <Text style={[type.captionMedium, { color: colors.textMuted }]} numberOfLines={1}>
                {qrData.businessName}
              </Text>
              <Amount stroops={qrData.totalAmount} size={24} />
            </View>
          </View>
        ) : null}

        <Text style={[type.h2, { color: colors.textPrimary, marginBottom: spacing.md }]}>Ödeme işleniyor</Text>
        {PROCESSING_STEPS.map((step, index) => (
          <StatusStep
            key={step.key}
            label={step.label}
            state={steps[step.key]}
            hint={steps[step.key] === 'error' ? 'Bu adımda hata oluştu' : step.hint}
            isLast={index === PROCESSING_STEPS.length - 1}
          />
        ))}
      </View>
      <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.md, textAlign: 'center' }]}>
        Lütfen uygulamayı kapatmayın
      </Text>
    </View>
  );
}

export function ResultStage({ result, qrData, onDone, onHome, onRecheck, rechecking, senderAddress }) {
  const isSuccess = result?.ok;
  // Onay beklenirken süre aşımı: ödeme ağa iletildi ama zincir onayı görülemedi —
  // yeşil "tamamlandı" yerine dürüst bir "iletildi" durumu gösterilir.
  const isPending = isSuccess && !result?.txHash;
  const tone = !isSuccess ? 'danger' : isPending ? 'warning' : 'success';
  const [gibState, setGibState] = useState({ status: 'idle', document: null, error: null });
  const [copied, setCopied] = useState(false);

  const handleCopyHash = useCallback(async () => {
    if (!result?.txHash) return;
    await Clipboard.setStringAsync(result.txHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
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
    <ScrollView contentContainerStyle={styles.resultScroll} showsVerticalScrollIndicator={false}>
      <View style={styles.resultCard}>
        <StatusBadge tone={tone} />

        <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md, textAlign: 'center' }]}>
          {!isSuccess ? 'Ödeme Başarısız' : isPending ? 'Ödeme İletildi' : 'Ödeme Tamamlandı'}
        </Text>

        {isSuccess && qrData && (
          <Amount stroops={qrData.totalAmount} size={38} align="center" style={{ marginTop: spacing.xs }} />
        )}
        {isSuccess && qrData && (
          <Text style={[type.body, { color: colors.textSecondary, marginTop: 2, textAlign: 'center' }]}>
            {qrData.businessName}
          </Text>
        )}

        {isPending && (
          <Button
            label={rechecking ? 'Kontrol ediliyor…' : 'Durumu Kontrol Et'}
            icon="refresh"
            variant="secondary"
            loading={rechecking}
            onPress={onRecheck}
            style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
          />
        )}

        {result?.message && (
          <InlineNotice tone={isSuccess ? 'warning' : 'danger'} style={styles.resultNotice}>
            {result.message}
          </InlineNotice>
        )}

        {result?.txHash && (
          <View style={styles.hashCard}>
            <Pressable onPress={handleCopyHash} style={styles.hashRow} accessibilityRole="button" accessibilityLabel="İşlem numarasını kopyala">
              <View style={{ flex: 1 }}>
                <Text style={[type.micro, { color: colors.textMuted }]}>İŞLEM NO</Text>
                <Text style={[type.mono, { color: colors.textSecondary, marginTop: 2 }]}>
                  {shortenMiddle(result.txHash, 10, 10)}
                </Text>
              </View>
              <View style={styles.copyPill}>
                <Icon name={copied ? 'check' : 'copy'} size={14} color={copied ? colors.success : colors.accentStrong} />
                <Text style={[type.micro, { color: copied ? colors.success : colors.accentStrong }]}>
                  {copied ? 'KOPYALANDI' : 'KOPYALA'}
                </Text>
              </View>
            </Pressable>
            <View style={styles.hairline} />
            <Pressable
              onPress={() => Linking.openURL(stellarExpertTxUrl(result.txHash))}
              style={styles.linkRow}
              accessibilityRole="link"
            >
              <Text style={[type.captionMedium, { color: colors.accent }]}>Stellar Expert'te görüntüle</Text>
              <Icon name="external" size={14} color={colors.accent} />
            </Pressable>
          </View>
        )}

        {isSuccess && result?.txHash && gibState.status !== 'loaded' && (
          <Button
            label="e-Belge Görüntüle"
            variant="secondary"
            icon="receipt"
            onPress={handleShowGib}
            loading={gibState.status === 'loading'}
            style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
          />
        )}
        {gibState.status === 'error' && (
          <InlineNotice
            tone="warning"
            style={styles.resultNotice}
            actionLabel="Tekrar dene"
            onAction={handleShowGib}
          >
            {gibState.error}
          </InlineNotice>
        )}
        {gibState.status === 'loaded' && (
          <View style={{ marginTop: spacing.md, width: '100%', alignItems: 'center' }}>
            <GibReceiptCard document={gibState.document} />
            <ReceiptActions document={gibState.document} txHash={result.txHash} />
          </View>
        )}

        {/* "Ana Ekrana Dön" gerçekten ana ekrana döner (fiş arşivi ve bakiye orada tazelenir);
            tekrar ödeme yapmak isteyen için tarayıcıya dönen ayrı bir düğme var. */}
        <Button label="Ana Ekrana Dön" onPress={onHome} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} />
        <Button
          label="Yeni Ödeme"
          variant="secondary"
          icon="scan"
          onPress={onDone}
          style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}
        />
      </View>
    </ScrollView>
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

const CORNER = 30;
const CORNER_W = 4;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  centerText: { textAlign: 'center' },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  cameraWrap: { flex: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  cameraFrame: {
    width: '100%',
    aspectRatio: 1,
    maxWidth: 360,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  scanBox: { position: 'absolute', top: '16%', left: '16%', right: '16%', bottom: '16%' },
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: colors.accent },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderTopLeftRadius: 10 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderTopRightRadius: 10 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderBottomLeftRadius: 10 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderBottomRightRadius: 10 },
  scanLine: { position: 'absolute', left: 6, right: 6, height: 2, borderRadius: 1, backgroundColor: colors.accent, opacity: 0.85 },
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
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radii.pill,
    backgroundColor: colors.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  footer: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, alignItems: 'center' },
  sampleButton: { minHeight: 44, paddingHorizontal: spacing.lg },
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
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  cartList: {
    marginTop: spacing.sm,
    gap: 6,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgCardAlt,
  },
  cartRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, minHeight: 20 },
  balanceLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  confirmActions: { marginTop: spacing.lg },
  assurance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: spacing.md },
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
  processingSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  resultCard: { alignItems: 'center', width: '100%', maxWidth: 360 },
  resultNotice: { marginTop: spacing.md, alignSelf: 'stretch' },
  hashCard: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hashRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, paddingHorizontal: spacing.md },
  copyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.xs,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCardAlt,
  },
  hairline: { height: 1, backgroundColor: colors.border },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm },
});
