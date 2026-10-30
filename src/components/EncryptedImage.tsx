import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, type ImageStyle, type StyleProp, View } from 'react-native';

import { loadImage } from '../lib/vault';

interface Props {
  id: string;
  style?: StyleProp<ImageStyle>;
  resizeMode?: 'cover' | 'contain';
}

export function EncryptedImage({ id, style, resizeMode = 'cover' }: Props) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadImage(id)
      .then((u) => alive && setUri(u))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  if (!uri) {
    return (
      <View style={[style, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  }
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}
