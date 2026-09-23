/**
 * Devre dışı Poseidon — BLS12-381 alanında.
 *
 * NEDEN BÖYLE: circomlibjs'in Poseidon'u BN254 skaler alanında çalışır.
 * Bizim devremiz BLS12-381'de derlendiği için (Soroban'ın yerleşik eşleşme
 * fonksiyonları o eğri içindir, CAP-0059) iki taraf farklı sonuç üretirdi:
 * Merkle kökü tutmaz, kanıt doğrulanmaz ve hatanın kaynağını bulmak çok zor
 * olurdu — çünkü her iki taraf da kendi içinde "doğru" çalışıyor görünürdü.
 *
 * Bu yüzden hash'i JS'te yeniden yazmak yerine, ana devrenin kullandığı
 * DERLENMİŞ devrenin ta kendisini çağırıyoruz (`poseidon2.wasm`). Alan
 * tutarlılığı böylece tanım gereği sağlanır; yanlış indirgenmiş bir sabit
 * ya da yanlış uygulanmış bir MDS matrisi riski ortadan kalkar.
 *
 * Bedeli hızdır: her hash bir witness hesabıdır. Demo ölçeğinde sorun değil;
 * üretimde alan-doğru sabitlerle yazılmış yerel bir Poseidon kullanılmalıdır.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
// `artifacts/` — `build/` DEĞİL. Bu dosyalar canlı kontratla eşleşmek
// zorunda olduğu için repoya girer; gerekçesi zk/.gitignore'da.
const WASM_PATH = join(HERE, '..', 'artifacts', 'poseidon2.wasm');
const BUILDER_PATH = join(HERE, '..', 'artifacts', 'poseidon2_witness_calculator.js');

let calculatorPromise = null;

/** Witness hesaplayıcı pahalıdır; bir kez kurulur ve yeniden kullanılır. */
function getCalculator() {
  if (!calculatorPromise) {
    calculatorPromise = (async () => {
      // Windows yollarında düz birleştirme geçersiz bir file:// URL'i üretir
      // (üç eğik çizgi ve sürücü harfi kodlaması gerekir) — pathToFileURL şart.
      const mod = await import(pathToFileURL(BUILDER_PATH).href);
      const builder = mod.default ?? mod;
      return builder(readFileSync(WASM_PATH));
    })();
  }
  return calculatorPromise;
}

/**
 * Poseidon(a, b) — iki alan elemanını hash'ler.
 *
 * @param {bigint|string|number} a
 * @param {bigint|string|number} b
 * @returns {Promise<bigint>}
 */
export async function poseidon2(a, b) {
  const wc = await getCalculator();
  const witness = await wc.calculateWitness(
    { a: BigInt(a).toString(), b: BigInt(b).toString() },
    true,
  );
  // Witness düzeni: [1, <açık çıktılar...>, <açık girdiler...>, <iç sinyaller...>]
  // 0. eleman her zaman sabit 1; 1. eleman tek açık çıktımız olan `out`.
  return BigInt(witness[1]);
}

/** BLS12-381 skaler alanının mertebesi (r). */
export const FIELD_ORDER =
  52435875175126190479447740508185965837690552500527637822603658699938581184513n;

/** Boş ağaç dallarını doldurmakta kullanılan sıfır yaprağı. */
export const ZERO_LEAF = 0n;
