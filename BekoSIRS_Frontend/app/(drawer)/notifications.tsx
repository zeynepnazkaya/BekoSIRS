import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Text,
  View,
  TouchableOpacity,
  RefreshControl,
  Switch,
  Alert,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import { notificationAPI } from '../../services';
import { useLanguage } from '../../context/LanguageContext';
import { t } from '../../i18n';

interface Notification {
  id: number;
  notification_type: 'price_drop' | 'restock' | 'service_update' | 'recommendation' | 'general';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  product_name?: string;
  related_product?: number;
  related_service_request?: number;
}

interface NotificationSettings {
  notify_service_updates: boolean;
  notify_price_drops: boolean;
  notify_restock: boolean;
  notify_recommendations: boolean;
  notify_warranty_expiry: boolean;
  notify_general: boolean;
}

const NotificationTypeConfig: Record<string, { icon: string; color: string }> = {
  price_drop: { icon: 'tag', color: '#FF9800' },
  restock: { icon: 'cube', color: '#4CAF50' },
  service_update: { icon: 'wrench', color: '#2196F3' },
  recommendation: { icon: 'lightbulb-o', color: '#9C27B0' },
  general: { icon: 'bell', color: '#607D8B' },
};

const NotificationsScreen = () => {
  const { language } = useLanguage();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<NotificationSettings>({
    notify_service_updates: true,
    notify_price_drops: true,
    notify_restock: true,
    notify_recommendations: true,
    notify_warranty_expiry: true,
    notify_general: true,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const fetchNotifications = useCallback(async () => {
    try {
      const [notifResponse, countResponse] = await Promise.all([
        notificationAPI.getNotifications(),
        notificationAPI.getUnreadCount(),
      ]);
      setNotifications(notifResponse.data.results || notifResponse.data || []);
      setUnreadCount(countResponse.data.unread_count);
    } catch (error) {
      console.error('Notifications fetch error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await notificationAPI.getSettings();
      setSettings(response.data);
    } catch (error) {
      console.error('Settings fetch error:', error);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchSettings();
  }, [fetchNotifications, fetchSettings]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await notificationAPI.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: true } : n
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Mark as read error:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await notificationAPI.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Mark all as read error:', error);
    }
  };

  const handleToggleSetting = async (key: keyof NotificationSettings) => {
    const newValue = !settings[key];
    const newSettings = { ...settings, [key]: newValue };
    setSettings(newSettings);

    setSavingSettings(true);
    try {
      await notificationAPI.updateSettings({ [key]: newValue });
    } catch (error) {
      // Rollback on error
      setSettings(settings);
      Alert.alert(t('common.error'), t('notifications.settingFailed'));
    } finally {
      setSavingSettings(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('notifications.justNow');
    if (diffMins < 60) return `${diffMins} ${t('notifications.minutesAgo')}`;
    if (diffHours < 24) return `${diffHours} ${t('notifications.hoursAgo')}`;
    if (diffDays < 7) return `${diffDays} ${t('notifications.daysAgo')}`;
    return date.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'en-US');
  };

  const renderSettingsItem = (
    key: keyof NotificationSettings,
    icon: string,
    title: string,
    description: string
  ) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <FontAwesome name={icon as any} size={18} color="#000" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={settings[key]}
        onValueChange={() => handleToggleSetting(key)}
        trackColor={{ false: '#E5E7EB', true: '#000' }}
        thumbColor="#fff"
        disabled={savingSettings}
      />
    </View>
  );

  const handleCardPress = (item: Notification) => {
    // Toggle expanded
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(item.id)) {
        next.delete(item.id);
      } else {
        next.add(item.id);
        // Mark as read when first opened
        if (!item.is_read) {
          handleMarkAsRead(item.id);
        }
      }
      return next;
    });
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const config = NotificationTypeConfig[item.notification_type] || NotificationTypeConfig.general;
    const isExpanded = expandedIds.has(item.id);

    return (
      <TouchableOpacity
        style={[
          styles.card,
          !item.is_read && styles.unreadCard,
          isExpanded && styles.expandedCard,
        ]}
        onPress={() => handleCardPress(item)}
        activeOpacity={0.85}
      >
        {/* Top row: icon + title + dot + chevron */}
        <View style={styles.cardTop}>
          <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
            <FontAwesome name={config.icon as any} size={20} color="#fff" />
          </View>

          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Text
                style={[styles.title, !item.is_read && styles.unreadTitle]}
                numberOfLines={isExpanded ? undefined : 1}
              >
                {item.title}
              </Text>
              <View style={styles.headerRight}>
                {!item.is_read && <View style={styles.unreadDot} />}
                <FontAwesome
                  name={isExpanded ? 'chevron-up' : 'chevron-down'}
                  size={11}
                  color="#aaa"
                  style={styles.chevron}
                />
              </View>
            </View>

            {/* Preview line when collapsed */}
            {!isExpanded && (
              <Text style={styles.message} numberOfLines={2}>
                {item.message}
              </Text>
            )}
          </View>
        </View>

        {/* Expanded detail section */}
        {isExpanded && (
          <View style={styles.expandedBody}>
            <Text style={styles.expandedMessage}>{item.message}</Text>

            <View style={styles.expandedMeta}>
              <View style={styles.metaRow}>
                <FontAwesome name="clock-o" size={12} color="#999" />
                <Text style={styles.metaText}>{formatDate(item.created_at)}</Text>
              </View>
              {item.product_name && (
                <View style={styles.metaRow}>
                  <FontAwesome name="cube" size={12} color="#999" />
                  <Text style={styles.metaText}>{item.product_name}</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <FontAwesome name="tag" size={12} color="#999" />
                <Text style={styles.metaText}>
                  {item.notification_type === 'general' && t('notifications.general')}
                  {item.notification_type === 'service_update' && t('notifications.serviceType')}
                  {item.notification_type === 'price_drop' && t('notifications.priceDrop')}
                  {item.notification_type === 'restock' && t('notifications.stock')}
                  {item.notification_type === 'recommendation' && t('notifications.suggestion')}
                </Text>
              </View>
            </View>

            {!item.is_read && (
              <TouchableOpacity
                style={styles.markReadBtn}
                onPress={() => handleMarkAsRead(item.id)}
              >
                <FontAwesome name="check" size={12} color="#fff" />
                <Text style={styles.markReadText}>{t('notifications.markAsRead')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Collapsed footer */}
        {!isExpanded && (
          <View style={styles.collapsedFooter}>
            <Text style={styles.time}>{formatDate(item.created_at)}</Text>
            {item.product_name && (
              <Text style={styles.productName} numberOfLines={1}>
                {item.product_name}
              </Text>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#000000" testID="loading-notifications" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {showSettings ? (
        // Settings View
        <View style={styles.settingsContainer}>
          <View style={styles.settingsHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setShowSettings(false)}
            >
              <FontAwesome name="arrow-left" size={20} color="#000" />
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>{t('notifications.settingsTitle')}</Text>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>{t('notifications.notificationTypes')}</Text>
            <Text style={styles.settingsCardSubtitle}>
              {t('notifications.settingsSubtitle')}
            </Text>

            {renderSettingsItem(
              'notify_service_updates',
              'wrench',
              t('notifications.serviceUpdates'),
              t('notifications.serviceUpdatesDesc')
            )}

            {renderSettingsItem(
              'notify_warranty_expiry',
              'shield',
              t('notifications.warrantyAlerts'),
              t('notifications.warrantyAlertsDesc')
            )}

            {renderSettingsItem(
              'notify_price_drops',
              'tag',
              t('notifications.priceDrops'),
              t('notifications.priceDropsDesc')
            )}

            {renderSettingsItem(
              'notify_restock',
              'cube',
              t('notifications.restockAlerts'),
              t('notifications.restockAlertsDesc')
            )}

            {renderSettingsItem(
              'notify_recommendations',
              'lightbulb-o',
              t('notifications.productSuggestions'),
              t('notifications.productSuggestionsDesc')
            )}

            {renderSettingsItem(
              'notify_general',
              'bell',
              t('notifications.generalNotifs'),
              t('notifications.generalNotifsDesc')
            )}
          </View>

          {savingSettings && (
            <View style={styles.savingOverlay}>
              <ActivityIndicator size="small" color="#000" />
              <Text style={styles.savingText}>{t('notifications.saving')}</Text>
            </View>
          )}
        </View>
      ) : (
        // Notifications List View
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={[styles.list, { flexGrow: 1 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle}>{t('notifications.title')}</Text>
                {unreadCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
              <View style={styles.headerActions}>
                {unreadCount > 0 && (
                  <TouchableOpacity onPress={handleMarkAllAsRead} style={styles.headerActionBtn}>
                    <FontAwesome name="check-circle-o" size={16} color="#000" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome name="bell-slash-o" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>{t('notifications.noNotifications')}</Text>
              <Text style={styles.emptyText}>
                {t('notifications.noNotificationsDesc')}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 15,
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  badge: {
    backgroundColor: '#f44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerActionBtn: {
    padding: 8,
  },
  markAllText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#EEF6FF',
    borderLeftWidth: 3,
    borderLeftColor: '#000000',
  },
  expandedCard: {
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 5,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
    flexShrink: 0,
  },
  chevron: {
    marginTop: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: '#222',
    flex: 1,
  },
  unreadTitle: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#000000',
  },
  message: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  collapsedFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    paddingLeft: 56,
  },
  time: {
    fontSize: 11,
    color: '#aaa',
  },
  productName: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '500',
    maxWidth: '50%',
  },
  // Expanded styles
  expandedBody: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  expandedMessage: {
    fontSize: 14,
    color: '#333',
    lineHeight: 21,
    marginBottom: 12,
  },
  expandedMeta: {
    backgroundColor: '#F8F9FA',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: '#666',
  },
  markReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#222',
    borderRadius: 8,
    paddingVertical: 9,
    gap: 6,
  },
  markReadText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  // Settings Styles
  settingsContainer: {
    flex: 1,
    padding: 16,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  backButton: {
    padding: 8,
    marginRight: 12,
  },
  settingsTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
  },
  settingsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  settingsCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  settingsCardSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 20,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#6B7280',
  },
  savingOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    gap: 8,
  },
  savingText: {
    fontSize: 14,
    color: '#666',
  },
});

export default NotificationsScreen;
