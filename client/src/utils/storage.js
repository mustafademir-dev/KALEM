/**
 * Platforma Göre Kalıcı Depolama
 *
 * Native'de (iOS/Android) gerçek `expo-secure-store` (Keychain/Keystore).
 * Web'de `expo-secure-store`'un kurulu sürümünün implementasyonu YOK
 * (`getValueWithKeyAsync is not a function` — gerçek tarayıcıda test
 * edilerek doğrulandı), bu yüzden web'de düz `window.localStorage`'a
 * düşülür (ŞİFRELENMEMİŞ — bkz. docs/ARCHITECTURE_DECISIONS.md §6.5).
 *
 * wallet.service.js (müşteri gizli anahtarı) ve merchant-auth.service.js
 * (esnaf API anahtarı) TARAFINDAN ORTAK kullanılır.
 */

import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const storage =
  Platform.OS === 'web'
    ? {
        getItemAsync: async (key) => window.localStorage.getItem(key),
        setItemAsync: async (key, value) => window.localStorage.setItem(key, value),
        deleteItemAsync: async (key) => window.localStorage.removeItem(key),
      }
    : SecureStore;

export default storage;

export function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(bytes).toString('base64');
}

export function base64ToBytes(base64) {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(base64, 'base64'));
}
