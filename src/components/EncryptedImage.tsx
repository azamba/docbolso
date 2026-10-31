import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, type ImageStyle, type StyleProp, Text, View } from 'react-native';

import { loadImage } from '../lib/vault';

interface Props {
  id: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
}

export function EncryptedImage({ id, style, resizeMode = 'cover' }: Props) {
  // Tagged with the id it belongs to, so a changed id shows the spinner again.
  const [loaded, setLoaded] = useState<{ id: string; uri: string | null } | null>(null);
  const uri = loaded?.id === id ? loaded.uri : null;
  const failed = loaded?.id === id && loaded.uri === null;

  useEffect(() => {
    let alive = true;
    loadImage(id)
      .then((u) => alive && setLoaded({ id, uri: u }))
      .catch(() => alive && setLoaded({ id, uri: null }));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!uri) {
    return (
      <View
        style={[style, { alignItems: 'center', justifyContent: 'center' }]}
        accessibilityLabel={failed ? 'Foto não pôde ser aberta' : 'Carregando foto'}
      >
        {failed ? <Text style={{ fontSize: 20, color: '#98A2B3' }}>⚠︎</Text> : <ActivityIndicator />}
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}
