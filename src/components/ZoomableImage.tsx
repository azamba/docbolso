import {
  GestureDetector,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { EncryptedImage } from './EncryptedImage';

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

interface Props {
  id: string;
  width: number;
  height: number;
  /** Shows the photo turned 90°, filling a portrait screen with a landscape document. */
  rotated: boolean;
  /** Called when the photo starts or stops being zoomed in (the pager must not swipe meanwhile). */
  onZoomChange: (zoomed: boolean) => void;
  onSingleTap: () => void;
}

/** A full-screen encrypted photo with pinch, pan and double-tap zoom. */
export function ZoomableImage({ id, width, height, rotated, onZoomChange, onSingleTap }: Props) {
  const scale = useSharedValue(1);
  const startScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const zoomed = useDerivedValue(() => scale.value > 1.01);

  const clamp = (value: number, limit: number) => {
    'worklet';
    return Math.min(Math.max(value, -limit), limit);
  };
  // How far the photo may move before its edge leaves the screen edge.
  const limitX = (s: number) => {
    'worklet';
    return ((s - 1) * width) / 2;
  };
  const limitY = (s: number) => {
    'worklet';
    return ((s - 1) * height) / 2;
  };

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    x.value = withTiming(0);
    y.value = withTiming(0);
    scheduleOnRN(onZoomChange, false);
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      'worklet';
      startScale.value = scale.value;
      scheduleOnRN(onZoomChange, true);
    },
    onUpdate: (e) => {
      'worklet';
      const s = Math.min(Math.max(startScale.value * e.scale, 0.8), MAX_SCALE);
      scale.value = s;
      x.value = clamp(x.value, limitX(s));
      y.value = clamp(y.value, limitY(s));
    },
    onDeactivate: () => {
      'worklet';
      if (scale.value < 1.01) reset();
    },
  });

  const pan = usePanGesture({
    enabled: zoomed,
    onActivate: () => {
      'worklet';
      startX.value = x.value;
      startY.value = y.value;
    },
    onUpdate: (e) => {
      'worklet';
      x.value = clamp(startX.value + e.translationX, limitX(scale.value));
      y.value = clamp(startY.value + e.translationY, limitY(scale.value));
    },
  });

  const doubleTap = useTapGesture({
    numberOfTaps: 2,
    onActivate: (e) => {
      'worklet';
      if (zoomed.value) {
        reset();
        return;
      }
      // Zoom towards the tapped point.
      const s = DOUBLE_TAP_SCALE;
      scale.value = withTiming(s);
      x.value = withTiming(clamp((width / 2 - e.x) * (s - 1), limitX(s)));
      y.value = withTiming(clamp((height / 2 - e.y) * (s - 1), limitY(s)));
      scheduleOnRN(onZoomChange, true);
    },
  });

  const singleTap = useTapGesture({
    onActivate: () => {
      'worklet';
      if (!zoomed.value) scheduleOnRN(onSingleTap);
    },
  });

  const gesture = useSimultaneousGestures(pinch, pan, useExclusiveGestures(doubleTap, singleTap));

  const frameStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  // Rotated: lay the photo out with the screen's sides swapped, then turn it.
  const imageStyle = rotated
    ? { width: height, height: width, transform: [{ rotate: '90deg' }] }
    : { width, height };

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ width, height, alignItems: 'center', justifyContent: 'center' }, frameStyle]}>
        <EncryptedImage id={id} resizeMode="contain" style={imageStyle} />
      </Animated.View>
    </GestureDetector>
  );
}
