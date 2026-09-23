pragma circom 2.1.6;

include "poseidon.circom";

/*
 * KALEM — Sosyal Fon Hak Ediş İspatı
 * ===================================
 *
 * NE KANITLIYOR
 * -------------
 * "Yetkili kurumun yayımladığı hak sahipleri listesinde bir kaydım var, o
 *  kaydın sahibi benim, ve bu dönemde daha önce talepte bulunmadım."
 *
 * Kanıtı üreten kişi bunu yaparken kimliğini, gelirini, hane durumunu veya
 * listedeki hangi kayıt olduğunu AÇIKLAMAZ.
 *
 * NEDEN İMZA DEĞİL, MERKLE ÜYELİĞİ
 * ---------------------------------
 * İlk tasarım kurumun EdDSA ile imzaladığı bir belgeydi. Ancak circomlib'in
 * EdDSA'sı Baby Jubjub eğrisi üzerinde çalışır ve Baby Jubjub BN254'ün skaler
 * alanına özgü olarak tanımlanmıştır — BLS12-381 alanında karşılığı yoktur.
 * Soroban'ın yerleşik (host) eşleşme fonksiyonları ise BLS12-381 içindir
 * (CAP-0059) ve on-chain doğrulamayı ancak o eğri ile makul maliyete
 * indirebiliyoruz. Bu yüzden imza şeması yerine, kurumun hak sahipleri
 * kümesine ait bir Merkle kökü yayımladığı tasarıma geçildi. Aynı yapı
 * Stellar'ın kendi Privacy Pools prototipinde de kullanılmıştır.
 *
 * GERÇEK HAYATTA AKIŞ
 * -------------------
 * 1. Vatandaş cihazında iki gizli değer üretir: `nullifier` ve `secret`.
 * 2. Taahhüdünü hesaplar: Poseidon(nullifier, secret) — ve YALNIZCA bunu
 *    kuruma verir. Kurum gizli değerleri hiç görmez.
 * 3. Kurum hak edişi kendi bildiği yollarla (gelir, hane, sosyal inceleme)
 *    off-chain değerlendirir; hak edenlerin taahhütlerinden bir Merkle ağacı
 *    kurar ve KÖKÜ yayımlar.
 * 4. Vatandaş talep anında bu devreyi kullanarak kanıt üretir.
 *
 * Dikkat: hak ediş kriterinin kendisi bu devrede DEĞİLDİR. Devre "kurum beni
 * hak sahibi saydı" ifadesini kanıtlar, "gelirim şu eşiğin altında"yı değil.
 * Kriterin zincire taşınması ayrı bir tasarım kararıdır ve bilinçli olarak
 * kapsam dışı bırakılmıştır — bir sosyal yardım kriteri, tek bir eşik
 * sayısına indirgenemeyecek kadar karmaşıktır ve onu devreye gömmek gerçeğe
 * uygun olmayan bir basitleştirme olurdu.
 *
 * NULLIFIER — mahremiyet ve çifte talep engeli aynı anda
 * ------------------------------------------------------
 * nullifierHash = Poseidon(nullifier, period)
 *
 * Aynı kişi aynı dönemde ikinci kez talep ederse AYNI nullifierHash çıkar ve
 * kontrat reddeder. Farklı dönemde talep ederse FARKLI değer çıkar ve talep
 * geçerlidir. nullifierHash'ten kişiye geri gidilemez.
 *
 * Yani zincir "bu kişi bu dönemde bir kez talep etti" bilgisini tutar,
 * "bu kişi kim" bilgisini tutmaz. Denetlenebilirlik ile mahremiyetin aynı
 * anda sağlanabildiğinin somut örneği budur.
 *
 * BİLİNEN SAPMA — Poseidon sabitleri
 * -----------------------------------
 * circomlib'in Poseidon sabitleri BN254 skaler alanı için üretilmiştir
 * (bkz. poseidon_constants.circom başlığı). Burada BLS12-381 alanında
 * kullanılıyorlar. İki alanın boyutu çok yakındır (254 ve 255 bit), bu
 * nedenle tur sayıları uygundur; ancak bu KANONİK bir Poseidon-BLS12-381
 * örneklemesi DEĞİLDİR. Üretim kullanımında sabitler hedef alan için
 * yeniden üretilmelidir.
 */

// ---------------------------------------------------------------------------
// Merkle yolu doğrulayıcı
// ---------------------------------------------------------------------------

template MerkleProof(DEPTH) {
    signal input leaf;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];   // 0 = kardeş sağda, 1 = kardeş solda
    signal output root;

    component hashers[DEPTH];
    signal cur[DEPTH + 1];
    signal left[DEPTH];
    signal right[DEPTH];

    cur[0] <== leaf;

    for (var i = 0; i < DEPTH; i++) {
        // Yön biti gerçekten bit olmalı. Bu kısıt olmasaydı, saldırgan
        // pathIndices'e 0/1 dışında bir alan elemanı koyup aşağıdaki
        // seçiciyi keyfi bir karışıma zorlayabilir ve sahte bir yol
        // uydurabilirdi.
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        // Koşulsuz seçici (mux): idx=0 → (cur, kardeş), idx=1 → (kardeş, cur)
        left[i]  <== cur[i] + pathIndices[i] * (pathElements[i] - cur[i]);
        right[i] <== pathElements[i] + pathIndices[i] * (cur[i] - pathElements[i]);

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== left[i];
        hashers[i].inputs[1] <== right[i];
        cur[i + 1] <== hashers[i].out;
    }

    root <== cur[DEPTH];
}

// ---------------------------------------------------------------------------
// Ana devre
// ---------------------------------------------------------------------------

template SupportEligibility(DEPTH) {
    // --- Açık girdiler ---
    signal input root;        // kurumun yayımladığı hak sahipleri kökü
    signal input period;      // talep dönemi (ör. 202603)
    signal input recipient;   // kanıtı bu talebe bağlayan alan (aşağıya bak)

    // --- Gizli girdiler ---
    signal input nullifier;
    signal input secret;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];

    // --- Açık çıktı ---
    signal output nullifierHash;

    // 1. Taahhüt — kurumun ağaca koyduğu yaprak
    component commitmentHasher = Poseidon(2);
    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;

    // 2. Üyelik — taahhüt gerçekten yayımlanmış kökün altında mı
    component merkle = MerkleProof(DEPTH);
    merkle.leaf <== commitmentHasher.out;
    for (var i = 0; i < DEPTH; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    merkle.root === root;

    // 3. Dönem bazlı nullifier
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHasher.inputs[1] <== period;
    nullifierHash <== nullifierHasher.out;

    // 4. Talep sahibini kanıta bağla — öne geçme (front-running) koruması
    //
    // `recipient` devrenin mantığında kullanılmıyor; buradaki tek amacı
    // kanıtın AÇIK girdilerinden biri olmak. Groth16 kanıtı tüm açık
    // girdilere bağlıdır, dolayısıyla kanıt başka bir `recipient` ile
    // yeniden kullanılamaz: mempool'dan kanıtı kopyalayıp kendi adına
    // gönderen biri doğrulamayı geçemez.
    //
    // Karesini alıp bir sinyale bağlamak, derleyicinin kullanılmayan girdiyi
    // eleyip kısıt sisteminden düşürmesini engellemek içindir — bilinen ve
    // yaygın bir kalıptır.
    signal recipientBinding;
    recipientBinding <== recipient * recipient;
}

component main {public [root, period, recipient]} = SupportEligibility(20);
