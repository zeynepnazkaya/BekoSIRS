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
import { notificationAPI } from '../../services/api';

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
      Alert.alert('Hata', 'Ayar güncellenemedi');
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

    if (diffMins < 1) return 'Az önce';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} saat önce`;
    if (diffDays < 7) return `${diffDays} gün önce`;
    return date.toLocaleDateString('tr-TR');
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

  const renderItem = ({ item }: { item: Notification }) => {
    const config = NotificationTypeConfig[item.notification_type] || NotificationTypeConfig.general;

    return (
      <TouchableOpacity
        style={[styles.card, !item.is_read && styles.unreadCard]}
        onPress={() => !item.is_read && handleMarkAsRead(item.id)}
        activeOpacity={0.7}
      >
        <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
          <FontAwesome name={config.icon as any} size={20} color="#fff" />
        </View>

        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={[styles.title, !item.is_read && styles.unreadTitle]} numberOfLines={1}>
              {item.title}
            </Text>
            {!item.is_read && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.message} numberOfLines={2}>
            {item.message}
          </Text>
          <View style={styles.footer}>
            <Text style={styles.time}>{formatDate(item.created_at)}</Text>
            {item.product_name && (
              <Text style={styles.productName} numberOfLines={1}>
                {item.product_name}
              </Text>
            )}
          </View>
        </View>
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
            <Text style={styles.settingsTitle}>Bildirim Ayarları</Text>
          </View>

          <View style={styles.settingsCard}>
            <Text style={styles.settingsCardTitle}>Bildirim Türleri</Text>
            <Text style={styles.settingsCardSubtitle}>
              Hangi bildirimler gönderilsin seçin
            </Text>

            {renderSettingsItem(
              'notify_service_updates',
              'wrench',
              'Servis Güncellemeleri',
              'Servis talepleriniz hakkında bildirimler'
            )}

            {renderSettingsItem(
              'notify_warranty_expiry',
              'shield',
              'Garanti Uyarıları',
              'Garanti süreniz dolmak üzereyken uyarı'
            )}

            {renderSettingsItem(
              'notify_price_drops',
              'tag',
              'Fiyat Düşüşleri',
              'İstek listenizdeki ürünlerde fiyat düşüşü'
            )}

            {renderSettingsItem(
              'notify_restock',
              'cube',
              'Stok Bildirimleri',
              'Stokta olmayan ürünler tekrar geldiğinde'
            )}

            {renderSettingsItem(
              'notify_recommendations',
              'lightbulb-o',
              'Ürün Önerileri',
              'Size özel ürün önerileri'
            )}

            {renderSettingsItem(
              'notify_general',
              'bell',
              'Genel Bildirimler',
              'Kampanya ve duyurular'
            )}
          </View>

          {savingSettings && (
            <View style={styles.savingOverlay}>
              <ActivityIndicator size="small" color="#000" />
              <Text style={styles.savingText}>Kaydediliyor...</Text>
            </View>
          )}
        </View>
      ) : (
        // Notifications List View
        <FlatList
          data={notifications}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            <View style={styles.header}>
              <View style={styles.titleRow}>
                <Text style={styles.headerTitle}>Bildirimler</Text>
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
                <TouchableOpacity
                  onPress={() => setShowSettings(true)}
                  style={styles.headerActionBtn}
                >
                  <FontAwesome name="cog" size={18} color="#000" />
                </TouchableOpacity>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FontAwesome name="bell-slash-o" size={80} color="#ccc" />
              <Text style={styles.emptyTitle}>Bildirim Yok</Text>
              <Text style={styles.emptyText}>
                Henüz herhangi bir bildiriminiz bulunmuyor
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
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadCard: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 3,
    borderLeftColor: '#000000',
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontWeight: '500',
    color: '#333',
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
    marginLeft: 8,
  },
  message: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  time: {
    fontSize: 11,
    color: '#999',
  },
  productName: {
    fontSize: 11,
    color: '#000000',
    fontWeight: '500',
    maxWidth: '50%',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
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
