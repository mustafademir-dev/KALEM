import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import BrandMark from './BrandMark.js';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { shortenMiddle } from '../utils/format.js';

/**
 * ÖKC fiş simülasyonu — `GET /transactions/:txHash/gib-document`'in
 * döndürdüğü UBL-TR JSON'unu (`document.ublContent`) okunabilir bir
 * fiş görünümünde gösterir. Termal fiş hissi: marka başlığı, kesik çizgiler,
 * altta pürüzlü (kopuk) kenar.
 *
 * NOT: `document.totalAmountTL` ve UBL içindeki tutarlar backend'de
 * stroop değeri TL gibi kullanılarak hesaplanıyor (gib-simulator.service.js
 * — gerçek bir stroop→TL dönüşümü yok, PoC basitleştirmesi). Burada
 * backend'in ÜRETTİĞİ rakamlar OLDUĞU GİBİ gösterilir, client tarafında
 * ayrıca "düzeltilmez".
 */
export default function GibReceiptCard({ document }) {
  const invoice = document?.ublContent?.Invoice;
  if (!invoice) {
    return (
      <View style={[styles.card, styles.cardEmpty]}>
        <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
          Belge içeriği okunamadı.
        </Text>
      </View>
    );
  }

  const lines = Array.isArray(invoice.InvoiceLine) ? invoice.InvoiceLine : [invoice.InvoiceLine].filter(Boolean);
  const merchantName = invoice.AccountingSupplierParty?.Party?.PartyName?.Name ?? '—';

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.head}>
          <BrandMark size={26} wordmark />
        </View>
        <Text style={[type.micro, { color: colors.textMuted, marginTop: spacing.sm }]}>
          e-BELGE · FİŞ
        </Text>

        <View style={styles.dashedDivider} />

        <Text style={[type.h2, { color: colors.textPrimary }]}>{merchantName}</Text>
        <Text style={[type.caption, { color: colors.textMuted, marginTop: 2 }]}>
          VKN: {document.merchantTaxId ?? '—'}
        </Text>

        <View style={styles.dashedDivider} />

        <View style={styles.row}>
          <Text style={[type.caption, { color: colors.textMuted }]}>Belge No</Text>
          <Text style={[type.mono, { color: colors.textPrimary }]}>{invoice.ID ?? '—'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[type.caption, { color: colors.textMuted }]}>Tarih</Text>
          <Text style={[type.mono, { color: colors.textPrimary }]}>
            {invoice.IssueDate ?? '—'} {invoice.IssueTime ?? ''}
          </Text>
        </View>

        <View style={styles.dashedDivider} />

        {lines.map((line, idx) => (
          <View key={idx} style={styles.lineRow}>
            <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]} numberOfLines={2}>
              {line?.InvoicedQuantity > 1 ? `${line.InvoicedQuantity}× ` : ''}
              {line?.Item?.Name ?? 'Kalem'}
            </Text>
            <Text style={[type.captionMedium, { color: colors.textPrimary }]}>
              {line?.LineExtensionAmount ?? line?.Price?.PriceAmount ?? '—'} TL
            </Text>
          </View>
        ))}

        <View style={styles.dashedDivider} />

        <View style={styles.row}>
          <Text style={[type.caption, { color: colors.textMuted }]}>Matrah</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>
            {invoice.LegalMonetaryTotal?.TaxExclusiveAmount ?? '—'} TL
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={[type.caption, { color: colors.textMuted }]}>KDV (%20)</Text>
          <Text style={[type.caption, { color: colors.textSecondary }]}>{invoice.TaxTotal?.TaxAmount ?? '—'} TL</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={[type.bodyMedium, { color: colors.textPrimary }]}>Toplam</Text>
          <Text style={[type.h2, { color: colors.accent }]}>{invoice.LegalMonetaryTotal?.PayableAmount ?? '—'} TL</Text>
        </View>

        <View style={styles.dashedDivider} />

        <Text style={[type.micro, { color: colors.textMuted, textAlign: 'center' }]}>
          STELLAR TX: {shortenMiddle(document.txHash, 10, 10)}
        </Text>
      </View>
      <TornEdge />
    </View>
  );
}

/** Fişin alt kenarındaki testere dişi (kopuk kağıt) çizgisi. */
function TornEdge() {
  const teeth = 42;
  const w = 8;
  let d = `M0 0`;
  for (let i = 0; i < teeth; i += 1) d += ` L${i * w + w / 2} 7 L${(i + 1) * w} 0`;
  d += ' Z';
  return (
    <Svg width="100%" height={7} viewBox={`0 0 ${teeth * w} 7`} preserveAspectRatio="none" style={styles.torn}>
      <Path d={d} fill={colors.white} stroke={colors.border} strokeWidth={1} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: 360, ...cardShadow },
  card: {
    width: '100%',
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardEmpty: { borderRadius: radii.lg, borderBottomWidth: 1, maxWidth: 360 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  simPill: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.warningBg,
  },
  torn: { marginTop: -1 },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.accentMuted,
  },
});
