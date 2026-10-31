import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EncryptedImage } from '../components/EncryptedImage';
import { useMaxBrightness } from '../lib/brightness';
import { useItem } from '../lib/store';

/** Full-screen photo viewer at max brightness, for showing a document to someone. */
export default function Viewer() {
  const { id, index } = useLocalSearchParams<{ id: string; index?: string }>();
  const item = useItem(id);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const initial = Number(index ?? 0);
  const [page, setPage] = useState(initial);

  useMaxBrightness();

  const images = item?.images ?? [];

  return (
    <View style={styles.root}>
      <FlatList
        data={images}
        horizontal
        pagingEnabled
        initialScrollIndex={Math.min(initial, Math.max(images.length - 1, 0))}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        keyExtractor={(img) => img.id}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item: img }) => (
          <Pressable onPress={() => router.back()}>
            <EncryptedImage id={img.id} resizeMode="contain" style={{ width, height }} />
          </Pressable>
        )}
      />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        {images.length > 1 && (
          <Text style={styles.counter}>
            {page + 1} / {images.length}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  counter: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
