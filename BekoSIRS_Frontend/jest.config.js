module.exports = {
    preset: "jest-expo",
    // Expo tabanli React Native testleri ayni native mock katmanlarini paylastigi icin
    // seri calisma tercih ediyoruz; bu sayede CI ve yerel ortamda rastgele timeout'lari onluyoruz.
    maxWorkers: 1,
    // Agir ekran testleri async effect'ler calistirdigi icin varsayilan 5 saniye dar kaliyor.
    // Daha yuksek timeout, yalnizca yavas render senaryolarinda sahte negatifleri azaltir.
    testTimeout: 30000,
    transformIgnorePatterns: [
        "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg)"
    ]
};
