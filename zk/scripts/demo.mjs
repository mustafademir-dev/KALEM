/**
 * KALEM — Sosyal Fon Hak Ediş İspatı, uçtan uca senaryo.
 *
 * Bu betik üç şeyi sırayla gösterir:
 *   1. Kurum hak sahipleri ağacını kurar ve yalnızca KÖKÜ yayımlar.
 *   2. Bir vatandaş kimliğini açıklamadan hak edişini kanıtlar.
 *   3. Aynı vatandaş aynı dönemde ikinci kez talep ederse AYNI nullifier
 *      çıkar (yakalanır); farklı dönemde FARKLI nullifier çıkar (geçerlidir).
 *
 * Hiçbir gerçek para hareket etmez — bkz. docs, "Seçenek A".
 *
 * Çalıştırma: node scripts/demo.mjs
 */

import { randomBytes } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as snarkjs from 'snarkjs';

import { poseidon2, FIELD_ORDER } from '../lib/poseidon.mjs';
import { buildTree, getProofPath, TREE_DEPTH } from '../lib/merkle.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BUILD = join(ROOT, 'build');
const ARTIFACTS = join(ROOT, 'artifacts');
const OUT = join(ROOT, 'out');

/** Alan elemanı olarak güvenli rastgele değer (248 bit < 255 bit alan). */
function randomFieldElement() {
  return BigInt('0x' + randomBytes(31).toString('hex')) % FIELD_ORDER;
}

/** Okunabilirlik için uzun sayıları kısaltır. */
function short(x) {
  const s = BigInt(x).toString();
  return s.length > 18 ? `${s.slice(0, 8)}…${s.slice(-6)}` : s;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  console.log('\n═══ 1. KURUM: hak sahipleri listesi oluşturuluyor ═══\n');

  // Kurum hak edişi kendi yöntemleriyle (gelir, hane, sosyal inceleme)
  // off-chain değerlendirir. Buraya yalnızca SONUÇ girer: hak eden
  // kişilerin cihazlarında ürettiği taahhütler.
  const CITIZEN_COUNT = 8;
  const citizens = [];
  for (let i = 0; i < CITIZEN_COUNT; i++) {
    const nullifier = randomFieldElement();
    const secret = randomFieldElement();
    const commitment = await poseidon2(nullifier, secret);
    citizens.push({ nullifier, secret, commitment });
  }

  const tree = await buildTree(citizens.map((c) => c.commitment));
  console.log(`Hak sahibi sayısı      : ${CITIZEN_COUNT}`);
  console.log(`Ağaç derinliği         : ${TREE_DEPTH} (kapasite ${2 ** TREE_DEPTH})`);
  console.log(`YAYIMLANAN KÖK         : ${tree.root}`);
  console.log(
    '\nDikkat: kök tek bir sayıdır. Kaç kişi olduğunu, kimler olduğunu,\n' +
      'gelirlerini — hiçbirini açık etmez.',
  );

  console.log('\n═══ 2. VATANDAŞ: hak ediş kanıtı üretiliyor ═══\n');

  const CLAIMER_INDEX = 3;
  const claimer = citizens[CLAIMER_INDEX];
  const PERIOD = 202603n; // 2026, 3. çeyrek

  // Kanıtı belirli bir talebe bağlayan açık girdi (öne geçme koruması).
  //
  // Değer, kontratın `recipient_binding(adres)` ucundan gelir — bağlayıcı
  // kuralı (sha256(XDR(adres)) ve üst 3 bitin sıfırlanması) YALNIZCA
  // kontratta tanımlıdır ve burada yeniden yazılmaz. İki yerde tanımlı bir
  // kural, er ya da geç ayrışır.
  //
  // Kullanım: node scripts/demo.mjs --recipient <64 haneli hex>
  const recipientArg = process.argv.indexOf('--recipient');
  const RECIPIENT =
    recipientArg !== -1 && process.argv[recipientArg + 1]
      ? BigInt('0x' + process.argv[recipientArg + 1].replace(/^0x/, ''))
      : 424242n;

  const { pathElements, pathIndices } = getProofPath(tree, CLAIMER_INDEX);

  const input = {
    root: tree.root.toString(),
    period: PERIOD.toString(),
    recipient: RECIPIENT.toString(),
    nullifier: claimer.nullifier.toString(),
    secret: claimer.secret.toString(),
    pathElements: pathElements.map(String),
    pathIndices: pathIndices.map(String),
  };

  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    join(ARTIFACTS, 'support_eligibility.wasm'),
    join(ARTIFACTS, 'se_final.zkey'),
  );
  const proveMs = Date.now() - t0;

  console.log(`Kanıt üretim süresi    : ${proveMs} ms`);
  console.log(`Kanıt boyutu           : ${JSON.stringify(proof).length} bayt`);
  console.log('\nAÇIK sinyaller (herkesin gördüğü):');
  console.log(`  nullifierHash        : ${publicSignals[0]}`);
  console.log(`  root                 : ${short(publicSignals[1])}`);
  console.log(`  period               : ${publicSignals[2]}`);
  console.log(`  recipient            : ${publicSignals[3]}`);
  console.log(`    (hex)              : ${RECIPIENT.toString(16).padStart(64, '0')}`);
  console.log('\nGİZLİ kalanlar (kanıtta YOK):');
  console.log(`  nullifier            : ${short(claimer.nullifier)}  ← açıklanmadı`);
  console.log(`  secret               : ${short(claimer.secret)}  ← açıklanmadı`);
  console.log(`  listedeki sıra       : ${CLAIMER_INDEX}  ← açıklanmadı`);

  console.log('\n═══ 3. DOĞRULAMA ═══\n');

  const vKey = JSON.parse(
    (await import('node:fs')).readFileSync(join(ARTIFACTS, 'verification_key.json'), 'utf8'),
  );
  const ok = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  console.log(`Kanıt geçerli mi       : ${ok ? '✅ EVET' : '❌ HAYIR'}`);
  if (!ok) process.exitCode = 1;

  // --- Sahte kanıt denemesi: listede olmayan biri ---
  console.log('\n═══ 4. SALDIRI: listede olmayan biri talep ederse ═══\n');
  const outsider = {
    nullifier: randomFieldElement(),
    secret: randomFieldElement(),
  };
  try {
    await snarkjs.groth16.fullProve(
      {
        ...input,
        nullifier: outsider.nullifier.toString(),
        secret: outsider.secret.toString(),
      },
      join(ARTIFACTS, 'support_eligibility.wasm'),
      join(ARTIFACTS, 'se_final.zkey'),
    );
    console.log('❌ BEKLENMEDİK: listede olmayan biri kanıt üretebildi!');
    process.exitCode = 1;
  } catch (err) {
    console.log('✅ Kanıt ÜRETİLEMEDİ — Merkle kısıtı sağlanamadı.');
    console.log(`   (${String(err.message).split('\n')[0]})`);
  }

  // --- Çifte talep ---
  console.log('\n═══ 5. ÇİFTE TALEP ENGELİ ═══\n');
  const sameAgain = await poseidon2(claimer.nullifier, PERIOD);
  const nextPeriod = await poseidon2(claimer.nullifier, 202604n);
  console.log(`Aynı kişi, aynı dönem  : ${short(sameAgain)}`);
  console.log(`  → ilk talepteki değer: ${short(publicSignals[0])}`);
  console.log(
    `  → ${sameAgain === BigInt(publicSignals[0]) ? '✅ AYNI — kontrat reddeder' : '❌ farklı'}`,
  );
  console.log(`\nAynı kişi, sonraki dönem: ${short(nextPeriod)}`);
  console.log(
    `  → ${nextPeriod !== sameAgain ? '✅ FARKLI — yeni dönemde talep edebilir' : '❌ aynı'}`,
  );

  writeFileSync(join(OUT, 'proof.json'), JSON.stringify(proof, null, 2));
  writeFileSync(join(OUT, 'public.json'), JSON.stringify(publicSignals, null, 2));
  console.log(`\nKanıt ve açık sinyaller yazıldı: zk/out/\n`);
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error('HATA:', err);
    process.exit(1);
  },
);
