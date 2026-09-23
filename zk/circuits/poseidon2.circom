pragma circom 2.1.6;
include "poseidon.circom";

// Devre DIŞINDA Poseidon hesaplayabilmek için yardımcı devre.
// Merkle ağacını kuran taraf (kurum) ve taahhüdünü hesaplayan vatandaş,
// ana devrenin kullandığı hash'in BİREBİR AYNISINI üretmek zorundadır.
// circomlib'in JS tarafı BN254 alanında çalıştığı için burada aynı derlenmiş
// devreyi kullanıyoruz — alan tutarlılığı böylece garanti altına alınır.
template Poseidon2() {
    signal input a;
    signal input b;
    signal output out;
    component p = Poseidon(2);
    p.inputs[0] <== a;
    p.inputs[1] <== b;
    out <== p.out;
}
component main = Poseidon2();
