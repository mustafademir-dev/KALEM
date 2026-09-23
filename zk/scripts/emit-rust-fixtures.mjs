/**
 * `build/soroban_artifacts.json` içeriğini Rust test sabitlerine çevirir.
 *
 * Neden dosya okumak yerine kod üretiyoruz: kontrat crate'i `#![no_std]`
 * derlenir; test anında dosya sistemine gitmek hem std bağımlılığı getirir
 * hem de testi çalışma dizinine bağımlı kılar. Üretilen sabitler repoda
 * görünür durur, böylece testin neyi doğruladığı okunabilir kalır.
 *
 * Çıktı: contracts/support-verifier/src/fixtures.rs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const TARGET = join(
  ROOT,
  '..',
  'contracts',
  'support-verifier',
  'src',
  'fixtures.rs',
);

const a = JSON.parse(readFileSync(join(ROOT, 'build', 'soroban_artifacts.json'), 'utf8'));

if (!a.proof) {
  throw new Error('Kanıt yok — önce scripts/demo.mjs, sonra export-for-soroban.mjs');
}

const icConsts = a.vk.ic
  .map((hex, i) => `pub const IC${i}: &str =\n    "${hex}";`)
  .join('\n\n');

const sigConsts = a.publicSignals
  .map((hex, i) => `pub const PUBLIC_${i}: &str =\n    "${hex}";`)
  .join('\n\n');

const out = `//! Gerçek snarkjs çıktısından üretilmiş test verisi — ELLE DÜZENLENMEZ.
//!
//! Üreten: \`zk/scripts/emit-rust-fixtures.mjs\`
//! Kaynak : \`zk/build/soroban_artifacts.json\`
//!
//! Bu sabitler uydurma değildir: BLS12-381 üzerinde gerçekten üretilmiş bir
//! Groth16 kanıtı ve onun doğrulama anahtarıdır. Testin amacı, kontratın bu
//! kanıtı zincir üstünde doğrulayabildiğini göstermektir.
//!
//! Devre : zk/circuits/support_eligibility.circom (DEPTH = 20)
//! Eğri  : ${a.curve}
//! Açık girdi sayısı: ${a.nPublic}
//!
//! Açık sinyaller (ondalık, devredeki sırayla):
${a.publicSignalsDecimal.map((d, i) => `//!   [${i}] ${d}`).join('\n')}

#![allow(dead_code)]

// --- Doğrulama anahtarı ---

pub const ALPHA1: &str =
    "${a.vk.alpha1}";

pub const BETA2: &str =
    "${a.vk.beta2}";

pub const GAMMA2: &str =
    "${a.vk.gamma2}";

pub const DELTA2: &str =
    "${a.vk.delta2}";

${icConsts}

// --- Kanıt ---

pub const PROOF_A: &str =
    "${a.proof.a}";

pub const PROOF_B: &str =
    "${a.proof.b}";

pub const PROOF_C: &str =
    "${a.proof.c}";

// --- Açık sinyaller (32 bayt, big-endian) ---

${sigConsts}
`;

writeFileSync(TARGET, out);
console.log(`Yazıldı: ${TARGET}`);
console.log(`IC sayısı: ${a.vk.ic.length}, açık sinyal: ${a.publicSignals.length}`);
