/**
 * Demo musluk (faucet) mint isteği için imzalanacak mesaj.
 *
 * DİKKAT: `orchestrator/src/utils/crypto.js` → `buildFaucetMintChallenge`
 * ile TAM BİREBİR eşleşmelidir — iki ayrı codebase, tek kaynak yok, bu
 * yüzden burada YENİDEN yazılmıştır.
 */
export function buildFaucetMintChallenge(address, timestamp) {
  return `KALEM-FAUCET-MINT:${address}:${timestamp}`;
}
