import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, type, cardShadow } from '../theme/index.js';
import { shortenMiddle } from '../utils/format.js';

/**
 * ÖKC fiş simülasyonu — `GET /transactions/:txHash/gib-document`'in
 * döndürdüğü UBL-TR JSON'unu (`document.ublContent`) okunabilir bir
 * fiş görünümünde gösterir. Süslü değil, kasıtlı olarak sade.
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
      <View style={styles.card}>
        <Text style={[type.body, { color: colors.textMuted, textAlign: 'center' }]}>
          Belge içeriği okunamadı.
        </Text>
      </View>
    );
  }

  const lines = Array.isArray(invoice.InvoiceLine) ? invoice.InvoiceLine : [invoice.InvoiceLine].filter(Boolean);
  const merchantName = invoice.AccountingSupplierParty?.Party?.PartyName?.Name ?? '—';

  return (
    <View style={styles.card}>
      <Text style={[type.micro, { color: colors.textMuted, textAlign: 'center' }]}>e-BELGE</Text>
      <Text style={[type.captionMedium, { color: colors.textMuted, textAlign: 'center', marginTop: 2 }]}>
        ÖKC Fiş Simülasyonu (PoC)
      </Text>

      <View style={styles.dashedDivider} />

      <Text style={[type.bodyMedium, { color: colors.textPrimary, textAlign: 'center' }]}>{merchantName}</Text>
      <Text style={[type.caption, { color: colors.textMuted, textAlign: 'center', marginTop: 2 }]}>
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
      <View style={[styles.row, { marginTop: spacing.xs }]}>
        <Text style={[type.bodyMedium, { color: colors.textPrimary }]}>Toplam</Text>
        <Text style={[type.h2, { color: colors.accent }]}>{invoice.LegalMonetaryTotal?.PayableAmount ?? '—'} TL</Text>
      </View>

      <View style={styles.dashedDivider} />

      <Text style={[type.micro, { color: colors.textMuted, textAlign: 'center' }]}>
        STELLAR TX: {shortenMiddle(document.txHash, 10, 10)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...cardShadow,
  },
  dashedDivider: {
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    marginVertical: spacing.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm, marginTop: 4 },
});
