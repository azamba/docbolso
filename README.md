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

## Assinatura dos releases

O Gradle assina com a chave de debug, que é pública. Os APKs publicados nos releases são
reassinados com a chave própria do projeto, que fica fora do repositório:

```sh
KD=~/.android-keys
~/Android/Sdk/build-tools/36.1.0/apksigner sign \
  --ks $KD/docbolso-release.jks --ks-key-alias docbolso \
  --ks-pass file:$KD/docbolso-release.password \
  --out docbolso-vX.Y.Z.apk android/app/build/outputs/apk/release/app-release.apk
```

Certificado (SHA-256):
`ee15ce4653dd5fc92682cdeacfeeb9d9b2b3391a6728572a3ae73ac7da4682e4`

Um APK com outra assinatura não instala por cima do app, então perder essa chave
significa que os usuários terão de desinstalar (e perder os dados) para atualizar.
Antes de cada release, aumente `version` no `app.json` e o `versionCode`.

## Desenvolvimento

```sh
npx expo run:android   # build de desenvolvimento com recarga ao vivo
npx tsc --noEmit && npx expo lint
```

## Atenção

Desinstalar o app ou limpar os dados apaga tudo. Use **Ajustes › Backup** para exportar um
arquivo `.docbolso` criptografado (`src/lib/backup.ts`). Ele abre com o código de recuperação
mostrado na mesma tela.
