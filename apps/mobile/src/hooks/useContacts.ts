import { useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { contactsApi } from '../api/client';

// Lazy-require expo-contacts only on native platforms
const ExpoContacts = Platform.OS !== 'web' ? require('expo-contacts') : null;

export interface AppContact {
  id: string;
  name: string;
  phone: string;
  profilePictureUrl?: string;
}

export interface DeviceContact {
  id: string;
  name: string;
  phone: string; // first phone number from device
}

interface UseContactsResult {
  onApp: AppContact[];
  notOnApp: DeviceContact[];
  loading: boolean;
  permissionDenied: boolean;
  sync: () => Promise<void>;
}

export function useContacts(): UseContactsResult {
  const [onApp, setOnApp] = useState<AppContact[]>([]);
  const [notOnApp, setNotOnApp] = useState<DeviceContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const sync = useCallback(async () => {
    // Web: device contacts API not available — show empty state silently
    if (Platform.OS === 'web') {
      setOnApp([]);
      setNotOnApp([]);
      setPermissionDenied(false);
      return;
    }

    setLoading(true);
    try {
      // 1. Request permission
      const { status } = await ExpoContacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);

      // 2. Read device contacts (phone numbers only — no names sent to server)
      const { data } = await ExpoContacts.getContactsAsync({
        fields: [ExpoContacts.Fields.PhoneNumbers, ExpoContacts.Fields.Name],
      });

      // 3. Extract all phone numbers (strip display names)
      const deviceMap = new Map<string, DeviceContact>(); // normalized phone → device contact
      for (const contact of data) {
        if (!contact.phoneNumbers?.length) continue;
        for (const pn of contact.phoneNumbers) {
          if (!pn.number) continue;
          const normalized = pn.number.replace(/\D/g, ''); // digits only
          if (normalized.length < 7) continue;
          if (!deviceMap.has(normalized)) {
            deviceMap.set(normalized, {
              id: contact.id || normalized,
              name: contact.name || normalized,
              phone: normalized,
            });
          }
        }
      }

      const allPhones = [...deviceMap.keys()];
      if (allPhones.length === 0) {
        setOnApp([]);
        setNotOnApp([...deviceMap.values()]);
        return;
      }

      // 4. Call backend sync (phones only — names never sent)
      const response = await contactsApi.sync(allPhones);
      const matched: AppContact[] = Array.isArray(response.data?.matched) ? response.data.matched : [];

      // 5. Compute which device contacts are NOT on app
      const matchedPhonesNormalized = new Set(
        matched.map((u) => u.phone.replace(/\D/g, '')),
      );
      const notOnAppContacts: DeviceContact[] = [];
      for (const [normalized, contact] of deviceMap.entries()) {
        // Check suffix match — e.g. device stores "9849394249" but server matched "919849394249"
        const isMatched = matchedPhonesNormalized.has(normalized) ||
          [...matchedPhonesNormalized].some(
            (p) => p.endsWith(normalized) || normalized.endsWith(p.slice(-10)),
          );
        if (!isMatched) {
          notOnAppContacts.push(contact);
        }
      }

      setOnApp(matched);
      setNotOnApp(notOnAppContacts);
    } catch (err) {
      console.warn('[useContacts] sync error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { onApp, notOnApp, loading, permissionDenied, sync };
}
