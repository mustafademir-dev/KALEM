/**
 * Hak sahipleri Merkle ağacı.
 *
 * Kurum (gerçekte SYDV/e-Devlet, burada simüle) hak eden kişilerin
 * taahhütlerinden sabit derinlikli bir ağaç kurar ve yalnızca KÖKÜ yayımlar.
 * Kök tek bir alan elemanıdır; kaç kişi olduğunu bile açık etmez (boş yerler
 * sıfır yapraklarıyla doldurulur).
 *
 * Ağaç sabit derinliklidir (devredeki DEPTH ile birebir aynı olmalıdır).
 * Derinlik devrede derleme zamanında sabitlenir; buradaki değerle ayrışırsa
 * kök tutmaz ve kanıt sessizce doğrulanmaz — bu yüzden tek kaynaktan
 * (`TREE_DEPTH`) okunur.
 */

import { poseidon2, ZERO_LEAF } from './poseidon.mjs';

/** Devredeki `SupportEligibility(20)` ile BİREBİR aynı olmak zorunda. */
export const TREE_DEPTH = 20;

/**
 * Her seviyedeki "boş alt ağaç" değerlerini önceden hesaplar.
 * zeros[0] = sıfır yaprak, zeros[i] = iki tane zeros[i-1]'in hash'i.
 */
async function computeZeros(depth) {
  const zeros = [ZERO_LEAF];
  for (let i = 1; i <= depth; i++) {
    zeros.push(await poseidon2(zeros[i - 1], zeros[i - 1]));
  }
  return zeros;
}

/**
 * Taahhüt listesinden sabit derinlikli bir Merkle ağacı kurar.
 *
 * @param {bigint[]} leaves - Hak sahiplerinin taahhütleri.
 * @param {number} [depth=TREE_DEPTH]
 * @returns {Promise<{root: bigint, layers: bigint[][], depth: number, zeros: bigint[]}>}
 */
export async function buildTree(leaves, depth = TREE_DEPTH) {
  const maxLeaves = 2 ** depth;
  if (leaves.length > maxLeaves) {
    throw new Error(`Ağaç kapasitesi aşıldı: ${leaves.length} > ${maxLeaves}`);
  }

  const zeros = await computeZeros(depth);
  const layers = [leaves.map((l) => BigInt(l))];

  for (let level = 0; level < depth; level++) {
    const current = layers[level];
    const next = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : zeros[level];
      next.push(await poseidon2(left, right));
    }
    // Tek düğüm bile kalmadıysa (boş ağaç) o seviyenin sıfır değeri kullanılır.
    layers.push(next.length > 0 ? next : [zeros[level + 1]]);
  }

  return { root: layers[depth][0], layers, depth, zeros };
}

/**
 * Bir yaprağın kökteki kanıt yolunu çıkarır.
 *
 * @returns {{pathElements: bigint[], pathIndices: number[]}}
 *   pathIndices[i]: 0 → kardeş sağda (biz soldayız), 1 → kardeş solda.
 */
export function getProofPath(tree, leafIndex) {
  if (leafIndex < 0 || leafIndex >= tree.layers[0].length) {
    throw new Error(`Geçersiz yaprak indeksi: ${leafIndex}`);
  }

  const pathElements = [];
  const pathIndices = [];
  let index = leafIndex;

  for (let level = 0; level < tree.depth; level++) {
    const layer = tree.layers[level];
    const isRightNode = index % 2 === 1;
    const siblingIndex = isRightNode ? index - 1 : index + 1;

    const sibling =
      siblingIndex < layer.length ? layer[siblingIndex] : tree.zeros[level];

    pathElements.push(sibling);
    // Devredeki seçici: idx=1 iken (kardeş, biz) sırasıyla hash'lenir.
    pathIndices.push(isRightNode ? 1 : 0);

    index = Math.floor(index / 2);
  }

  return { pathElements, pathIndices };
}
