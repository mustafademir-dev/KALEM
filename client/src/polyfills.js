/**
 * React Native / Expo ortamında Node çekirdek API'lerine bağımlı olan
 * @stellar/stellar-sdk ve tweetnacl için gereken polyfill'ler.
 * App.js'in EN ÜSTÜNDE, başka hiçbir import'tan önce yüklenmelidir.
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

if (typeof global.Buffer === 'undefined') {
  global.Buffer = Buffer;
}
