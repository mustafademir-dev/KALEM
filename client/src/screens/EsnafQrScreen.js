import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Screen from '../components/Screen.js';
import Button from '../components/Button.js';
import BackButton from '../components/BackButton.js';
import Icon from '../components/Icon.js';
import Amount from '../components/Amount.js';
import { InlineNotice, MerchantAvatar, PulseDot, StatusBadge } from '../components/StateViews.js';
import GibReceiptCard from '../components/GibReceiptCard.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { useNavigation } from '../navigation/Navigator.js';
import { getCurrentLedger, findNewPayment } from '../services/merchant-chain.service.js';
import { getGibDocument, acknowledgePaymentSeen, ApiError } from '../services/api.service.js';
import { shortenMiddle, stellarExpertTxUrl } from '../utils/format.js';

const POLL_INTERVAL_MS = 3000;
/** Bu kadar ardışık başarısız turdan sonra esnafa "zinciri okuyamıyorum" uyarısı gösterilir. */
const FAILURES_BEFORE_WARNING = 3;

export default function EsnafQrScreen({ params }) {
  const { payload, totalAmount, stellarAddress, session } = params;
  const { navigate, reset } = useNavigation();

  const [payment, setPayment] = useState(null); // { from, amount, txHash }
  const [gibState, setGibState] = useState({ status: 'idle', document: null, error: null });
  const [networkWarning, setNetworkWarning] = useState(false);
  const sinceLedgerRef = useRef(null);
  const stoppedRef = useRef(false);
  const failureCountRef = useRef(0);

  useEffect(() => {
    stoppedRef.current = false;

    poll();

    async function poll() {
      if (stoppedRef.current) return;
      try {
        // Başlangıç ledger'ı yoksa (ilk tur ya da önceki denemede ağ hatası)
        // HER TURDA yeniden denenir. Eskiden bu yalnızca bir kez denenir, hata
        // alınca poll() kalıcı olarak dururdu: ağ bir anlığına koptuysa ekran
        // ödeme gelse bile sonsuza kadar "Ödeme bekleniyor…" gösteriyordu.
        if (sinceLedgerRef.current == null) {
          sinceLedgerRef.current = (await getCurrentLedger()) - 1; // -1: aynı ledger'daki ödemeyi de kaçırma
        }
        const found = await findNewPayment(stellarAddress, {
          sinceLedger: sinceLedgerRef.current,
          expectedTotal: totalAmount,
        });
        failureCountRef.current = 0;
        setNetworkWarning(false);
        if (found) {
          setPayment(found);
          // Canlı işlem akışı 9. adımı: "esnaf ekranında göründü" — ekran bunu
          // gerçekten gösterdiği anda bildirilir. Sonucu beklenmez; başarısızlık
          // esnafın ekranını etkilemez.
          if (found.txHash && session?.apiKey) {
            acknowledgePaymentSeen(found.txHash, { apiKey: session.apiKey, detectedLedger: found.ledger });
          }
          return; // bulununca polling'i durdur
        }
      } catch {
        // Ağ hatası — bir sonraki turda tekrar denenir. Üst üste birkaç tur
        // başarısızsa esnafa sessiz kalmak yerine durumu söyle: ekran "ödeme
        // bekleniyor" gösterirken aslında zinciri hiç okuyamıyor olabilir.
        failureCountRef.current += 1;
        if (failureCountRef.current >= FAILURES_BEFORE_WARNING) setNetworkWarning(true);
      }
      if (!stoppedRef.current) setTimeout(poll, POLL_INTERVAL_MS);
    }

    return () => {
      stoppedRef.current = true;
    };
  }, [stellarAddress, totalAmount]);

  const handleNewPayment = useCallback(() => {
    navigate('MerchantAmountEntry', { session: params.session ?? null, stellarAddress });
  }, [navigate, params.session, stellarAddress]);

  const handleShowGib = useCallback(async () => {
    if (!payment?.txHash || !session?.apiKey) return;
    setGibState({ status: 'loading', document: null, error: null });
    try {
      const document = await getGibDocument(payment.txHash, { apiKey: session.apiKey });
      setGibState({ status: 'loaded', document, error: null });
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 404
          ? 'Bu işlem için e-belge henüz üretilmedi — birkaç saniye sonra tekrar deneyin.'
          : 'e-Belge alınamadı.';
      setGibState({ status: 'error', document: null, error: message });
    }
  }, [payment, session]);

  if (payment) {
    return (
      <PaymentReceivedView
        payment={payment}
        canShowGib={Boolean(payment.txHash && session?.apiKey)}
        gibState={gibState}
        onShowGib={handleShowGib}
        onNewPayment={handleNewPayment}
      />
    );
  }

  return (
    <WaitingView
      payload={payload}
      totalAmount={totalAmount}
      businessName={session?.businessName}
      networkWarning={networkWarning}
    />
  );
}

/** Ödeme bekleme görünümü — yalnızca sunum; polling/mantık üst bileşendedir. */
export function WaitingView({ payload, totalAmount, businessName, networkWarning }) {
  return (
    <Screen>
      <View style={styles.topBar}>
        <BackButton />
      </View>
      <View style={styles.centerFill}>
        {businessName ? (
          <View style={styles.merchantChip}>
            <MerchantAvatar name={businessName} size={24} />
            <Text style={[type.captionMedium, { color: colors.textSecondary }]} numberOfLines={1}>
              {businessName}
            </Text>
          </View>
        ) : null}

        <Text style={[type.micro, { color: colors.textMuted, marginTop: spacing.md }]}>TAHSİL EDİLECEK TUTAR</Text>
        <Amount stroops={totalAmount} size={40} style={{ marginTop: 2 }} />

        <View style={styles.qrCard}>
          <View style={[styles.qrCorner, styles.qrTL]} />
          <View style={[styles.qrCorner, styles.qrTR]} />
          <View style={[styles.qrCorner, styles.qrBL]} />
          <View style={[styles.qrCorner, styles.qrBR]} />
          <QRCode value={payload} size={232} backgroundColor={colors.white} color={colors.textPrimary} />
        </View>

        <View style={styles.waitingRow}>
          <PulseDot />
          <Text style={[type.bodyMedium, { color: colors.textSecondary }]}>Ödeme bekleniyor…</Text>
        </View>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 2, textAlign: 'center' }]}>
          Müşteri bu kodu KALEM uygulamasıyla okutmalı
        </Text>

        {networkWarning && (
          <InlineNotice tone="warning" style={{ marginTop: spacing.md }}>
            Zincir şu an okunamıyor; ödeme yapılsa bile bu ekranda görünmeyebilir. İnternet bağlantınızı kontrol edin —
            bağlantı gelince kontrol kendiliğinden sürer.
          </InlineNotice>
        )}
      </View>
    </Screen>
  );
}

/** Ödeme alındı görünümü — yalnızca sunum. */
export function PaymentReceivedView({ payment, canShowGib, gibState, onShowGib, onNewPayment }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.receivedScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.receivedCard}>
          <StatusBadge tone="success" />
          <Text style={[type.h1, { color: colors.textPrimary, marginTop: spacing.md }]}>Ödeme Alındı</Text>
          <Amount stroops={payment.amount} size={38} align="center" style={{ marginTop: spacing.xs }} />

          <View style={styles.detailCard}>
            <View style={styles.detailRow}>
              <Text style={[type.caption, { color: colors.textMuted }]}>Gönderen</Text>
              <Text style={[type.mono, { color: colors.textSecondary }]}>{shortenMiddle(payment.from)}</Text>
            </View>
            {payment.txHash ? (
              <>
                <View style={styles.hairline} />
                <Pressable
                  onPress={() => Linking.openURL(stellarExpertTxUrl(payment.txHash))}
                  style={styles.detailRow}
                  accessibilityRole="link"
                >
                  <Text style={[type.caption, { color: colors.textMuted }]}>İşlem no</Text>
                  <View style={styles.linkInline}>
                    <Text style={[type.mono, { color: colors.accent }]}>{shortenMiddle(payment.txHash, 8, 8)}</Text>
                    <Icon name="external" size={13} color={colors.accent} />
                  </View>
                </Pressable>
              </>
            ) : null}
          </View>

          {canShowGib && gibState.status !== 'loaded' && (
            <Button
              label="e-Belge Görüntüle"
              variant="secondary"
              icon="receipt"
              onPress={onShowGib}
              loading={gibState.status === 'loading'}
              style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
            />
          )}
          {gibState.status === 'error' && (
            <InlineNotice
              tone="warning"
              style={{ marginTop: spacing.md, alignSelf: 'stretch' }}
              actionLabel="Tekrar dene"
              onAction={onShowGib}
            >
              {gibState.error}
            </InlineNotice>
          )}
          {gibState.status === 'loaded' && (
            <View style={{ marginTop: spacing.md, width: '100%', alignItems: 'center' }}>
              <GibReceiptCard document={gibState.document} />
            </View>
          )}

          <Button label="Yeni Ödeme Al" icon="qr" onPress={onNewPayment} style={{ marginTop: spacing.lg, alignSelf: 'stretch' }} />
        </View>
      </ScrollView>
    </Screen>
  );
}

const QR_CORNER = 22;

const styles = StyleSheet.create({
  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  merchantChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: '90%',
  },
  qrCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    ...cardShadow,
  },
  qrCorner: { position: 'absolute', width: QR_CORNER, height: QR_CORNER, borderColor: colors.accent },
  qrTL: { top: 8, left: 8, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 8 },
  qrTR: { top: 8, right: 8, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 8 },
  qrBL: { bottom: 8, left: 8, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 8 },
  qrBR: { bottom: 8, right: 8, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 8 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.md },
  receivedScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  receivedCard: { width: '100%', maxWidth: 360, alignItems: 'center' },
  detailCard: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  hairline: { height: 1, backgroundColor: colors.border },
  linkInline: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
