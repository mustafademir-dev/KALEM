import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '../Button.js';
import Icon from '../Icon.js';
import { InlineNotice } from '../StateViews.js';
import { DaySummaryCard } from './SummaryCards.js';
import { TAB_BAR_CLEARANCE } from './MerchantTabBar.js';
import { colors, radii, spacing, type } from '../../theme/index.js';
import { getMerchantTransactions, ApiError } from '../../services/api.service.js';
import { downloadDailyReport } from '../../services/report-download.service.js';
import { formatTrDate, istanbulToday, shiftDate } from '../../utils/dates.js';

/** Gün Sonu: gün seç → o günün özetini gör → muhasebeci için CSV indir (SİMÜLASYON damgalı). */
export default function ReportTab({ session }) {
  const today = istanbulToday();
  const [date, setDate] = useState(today);
  const [summary, setSummary] = useState({ status: 'loading', data: null });
  const [download, setDownload] = useState({ status: 'idle', message: null });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSummary({ status: 'loading', data: null });
    setDownload({ status: 'idle', message: null });
    getMerchantTransactions(session.merchantId, session.apiKey, { date, limit: 1 })
      .then((page) => {
        if (!cancelled) setSummary({ status: 'ready', data: page.summary ?? null });
      })
      .catch(() => {
        if (!cancelled) setSummary({ status: 'error', data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [session, date]);

  const handleDownload = useCallback(async () => {
    setDownload({ status: 'loading', message: null });
    try {
      const result = await downloadDailyReport({ merchantId: session.merchantId, apiKey: session.apiKey, date });
      if (aliveRef.current) {
        setDownload({
          status: 'done',
          message:
            result.method === 'download'
              ? `${result.filename} indirildi.`
              : 'Paylaşım ekranı açıldı — raporu muhasebecinize gönderebilirsiniz.',
        });
      }
    } catch (err) {
      if (aliveRef.current) {
        setDownload({
          status: 'error',
          message: err instanceof ApiError ? err.message : 'Rapor indirilemedi.',
        });
      }
    }
  }, [session, date]);

  const isToday = date === today;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[type.h1, { color: colors.textPrimary }]}>Gün Sonu</Text>
      <Text style={[type.body, { color: colors.textSecondary, marginTop: 4 }]}>
        Seçtiğiniz günün belgelerini muhasebeciniz için tek dosyada indirin
      </Text>

      <View style={styles.dateBar}>
        <Pressable
          onPress={() => setDate((d) => shiftDate(d, -1))}
          accessibilityRole="button"
          accessibilityLabel="Önceki gün"
          hitSlop={8}
          style={styles.dateArrow}
        >
          <Icon name="chevronLeft" size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text style={[type.h2, { color: colors.textPrimary }]}>{formatTrDate(date)}</Text>
          {isToday ? (
            <Text style={[type.captionMedium, { color: colors.accent }]}>Bugün</Text>
          ) : (
            <Pressable onPress={() => setDate(today)} hitSlop={8}>
              <Text style={[type.captionMedium, { color: colors.accent }]}>Bugüne dön</Text>
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => setDate((d) => shiftDate(d, 1))}
          disabled={isToday}
          accessibilityRole="button"
          accessibilityLabel="Sonraki gün"
          hitSlop={8}
          style={[styles.dateArrow, isToday && { opacity: 0.3 }]}
        >
          <Icon name="chevronRight" size={22} color={colors.textPrimary} />
        </Pressable>
      </View>

      <View style={{ marginTop: spacing.md }}>
        <DaySummaryCard title="Günün Özeti" summary={summary.data} loading={summary.status === 'loading'} />
      </View>

      {summary.status === 'error' && (
        <InlineNotice tone="danger" style={{ marginTop: spacing.md }}>
          Bu günün özeti alınamadı. İnternet bağlantınızı kontrol edip başka bir gün seçerek yeniden deneyin.
        </InlineNotice>
      )}

      {/* ZORUNLU damga: rapor bir simülasyondur, mali değeri yoktur */}
      <InlineNotice tone="warning" icon="info" style={{ marginTop: spacing.md }}>
        SİMÜLASYON — mali değeri yoktur. GİB ile gerçek bir entegrasyon yoktur; bu rapor resmi bir Z raporu ya da
        fatura değildir.
      </InlineNotice>

      <Button
        label="CSV İndir"
        icon="download"
        onPress={handleDownload}
        loading={download.status === 'loading'}
        disabled={summary.status === 'loading'}
        style={{ marginTop: spacing.md }}
      />
      <Text style={[type.caption, { color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' }]}>
        Excel ile açılır · her belge, matrah, KDV, komisyon ve net kazanç
      </Text>

      {download.status === 'done' && (
        <InlineNotice tone="success" style={{ marginTop: spacing.md }}>
          {download.message}
        </InlineNotice>
      )}
      {download.status === 'error' && (
        <InlineNotice tone="danger" style={{ marginTop: spacing.md }} actionLabel="Tekrar dene" onAction={handleDownload}>
          {download.message}
        </InlineNotice>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: TAB_BAR_CLEARANCE },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
    padding: spacing.xs,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateArrow: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCardAlt,
  },
});
