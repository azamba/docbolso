# DocBolso

Documentos no bolso: CNH, RG, carteirinhas, notas e senha do Wi-Fi, tudo offline e criptografado.

- Expo SDK 58 + Expo Router (`src/app/`)
- Desbloqueio por biometria ou PIN (`src/lib/lock.tsx`)
- Cofre AES-256-GCM com a chave no Android Keystore (`src/lib/vault.ts`)

## Gerar o APK (Android, sem loja)

```sh
export ANDROID_HOME=$HOME/Android/Sdk
npx expo prebuild --platform android      # gera/atualiza a pasta android/
cd android && ./gradlew assembleRelease
```

O APK sai em `android/app/build/outputs/apk/release/app-release.apk`.

Instalar com o celular no USB (depuração USB ligada):

```sh
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

Ou copie o `.apk` para o celular e abra o arquivo (permita "instalar apps desconhecidos").

O APK é assinado com a chave de debug do template. Isso basta para uso pessoal, e as
atualizações instalam por cima sem perder dados enquanto a chave for a mesma.

## Desenvolvimento

```sh
npx expo run:android   # build de desenvolvimento com recarga ao vivo
npx tsc --noEmit && npx expo lint
```

## Atenção

Desinstalar o app ou limpar os dados apaga tudo. Não há backup.
