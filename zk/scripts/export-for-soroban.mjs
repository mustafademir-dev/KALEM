/**
 * snarkjs çıktısını Soroban'ın beklediği bayt düzenine çevirir.
 *
 * Soroban host'unun BLS12-381 kodlaması (soroban-sdk crypto::bls12_381):
 *   G1 (96 bayt)  : be48(X) || be48(Y)
 *   G2 (192 bayt) : be48(X_c1) || be48(X_c0) || be48(Y_c1) || be48(Y_c0)
 *
 * ⚠ G2'de **c1 önce** gelir. snarkjs JSON'u ise [c0, c1] sırasıyla verir.
 * Sıra ters çevrilmezse kanıt sessizce geçersiz görünür — hata mesajı
 * alınmaz, `pairing_check` sadece `false` döner ve sebebini bulmak saatler
 * alır. Bu dosyadaki tek gerçek incelik budur.
 *
 * Çıktı: build/soroban_artifacts.json — Rust testlerine ve deploy
 * betiklerine gömülmeye hazır hex dizeleri.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const ARTIFACTS = join(ROOT, 'artifacts');
const OUT = join(ROOT, 'out');

/** Ondalık dizeyi 48 baytlık big-endian hex'e çevirir (Fp elemanı). */
function fp(decimalString) {
  const hex = BigInt(decimalString).toString(16).padStart(96, '0');
  if (hex.length !== 96) {
    throw new Error(`Fp elemanı 48 bayta sığmadı: ${decimalString}`);
  }
  return hex;
}

/** Ondalık dizeyi 32 baytlık big-endian hex'e çevirir (Fr elemanı / açık girdi). */
function fr(decimalString) {
  const hex = BigInt(decimalString).toString(16).padStart(64, '0');
  if (hex.length !== 64) {
    throw new Error(`Fr elemanı 32 bayta sığmadı: ${decimalString}`);
  }
  return hex;
}

/**
 * snarkjs G1 noktası → 96 bayt hex.
 * Girdi [x, y, z] biçimindedir; snarkjs afin nokta verir (z = 1).
 */
function g1(point) {
  if (point.length >= 3 && BigInt(point[2]) !== 1n) {
    throw new Error(`G1 noktası afin değil (z=${point[2]}) — dönüşüm yanlış olurdu`);
  }
  return fp(point[0]) + fp(point[1]);
}

/**
 * snarkjs G2 noktası → 192 bayt hex.
 * Girdi [[x_c0, x_c1], [y_c0, y_c1], [z_c0, z_c1]] biçimindedir.
 * Çıktıda c1 ÖNCE yazılır.
 */
function g2(point) {
  if (point.length >= 3 && (BigInt(point[2][0]) !== 1n || BigInt(point[2][1]) !== 0n)) {
    throw new Error(`G2 noktası afin değil — dönüşüm yanlış olurdu`);
  }
  const [x, y] = point;
  return fp(x[1]) + fp(x[0]) + fp(y[1]) + fp(y[0]);
}

function main() {
  const vk = JSON.parse(readFileSync(join(ARTIFACTS, 'verification_key.json'), 'utf8'));

  if (vk.curve !== 'bls12381') {
    throw new Error(`Beklenen eğri bls12381, bulunan: ${vk.curve}`);
  }
  if (vk.protocol !== 'groth16') {
    throw new Error(`Beklenen protokol groth16, bulunan: ${vk.protocol}`);
  }

  const artifacts = {
    curve: vk.curve,
    nPublic: vk.nPublic,
    vk: {
      alpha1: g1(vk.vk_alpha_1),
      beta2: g2(vk.vk_beta_2),
      gamma2: g2(vk.vk_gamma_2),
      delta2: g2(vk.vk_delta_2),
      ic: vk.IC.map(g1),
    },
  };

  // Kanıt varsa onu da çevir (demo.mjs çalıştırıldıysa mevcuttur).
  try {
    const proof = JSON.parse(readFileSync(join(OUT, 'proof.json'), 'utf8'));
    const publicSignals = JSON.parse(readFileSync(join(OUT, 'public.json'), 'utf8'));

    artifacts.proof = {
      a: g1(proof.pi_a),
      b: g2(proof.pi_b),
      c: g1(proof.pi_c),
    };
    artifacts.publicSignals = publicSignals.map(fr);
    artifacts.publicSignalsDecimal = publicSignals;
  } catch {
    console.log('(kanıt bulunamadı — önce scripts/demo.mjs çalıştırın)');
  }

  if (artifacts.vk.ic.length !== vk.nPublic + 1) {
    throw new Error(
      `IC uzunluğu tutarsız: ${artifacts.vk.ic.length} ≠ nPublic+1 (${vk.nPublic + 1})`,
    );
  }

  const outPath = join(BUILD, 'soroban_artifacts.json');
  writeFileSync(outPath, JSON.stringify(artifacts, null, 2));

  console.log(`Eğri              : ${artifacts.curve}`);
  console.log(`Açık girdi sayısı : ${artifacts.nPublic}`);
  console.log(`IC uzunluğu       : ${artifacts.vk.ic.length}`);
  console.log(`alpha1 (96 bayt)  : ${artifacts.vk.alpha1.slice(0, 24)}…`);
  console.log(`beta2  (192 bayt) : ${artifacts.vk.beta2.slice(0, 24)}…`);
  if (artifacts.proof) {
    console.log(`pi_a   (96 bayt)  : ${artifacts.proof.a.slice(0, 24)}…`);
    console.log(`Açık sinyaller    : ${artifacts.publicSignals.length} adet`);
  }
  console.log(`\nYazıldı: ${outPath}`);
}

main();
