/**
 * Esnaf kaydı sırasında adres sahipliğini kanıtlamak için imzalanacak mesaj.
 *
 * DİKKAT: `orchestrator/src/utils/crypto.js` → `buildMerchantOwnershipChallenge`
 * ile TAM BİREBİR eşleşmelidir (bkz. `utils/faucetChallenge.js` ile aynı desen).
 */
export function buildMerchantOwnershipChallenge(taxId, stellarAddress) {
  return `KALEM-MERCHANT-REGISTER:${taxId}:${stellarAddress}`;
}
