import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

// KeyboardAvoidingView's Android 'height' behavior is unreliable for content
// rendered inside a <Modal> (transparent or not) — the Modal's own window
// doesn't consistently participate in the resize the way normal screen
// content does, so the keyboard can still cover the input despite a
// correctly-configured KeyboardAvoidingView. Tracking the real keyboard
// height via native events and applying it directly as bottom
// padding/margin sidesteps that entirely. iOS's 'padding' behavior already
// works fine inside a Modal, so this only listens on Android — callers
// should pair it with `behavior={Platform.OS === 'ios' ? 'padding' : undefined}`
// on their KeyboardAvoidingView (undefined fully disables it on Android,
// leaving this hook as the only compensation there).
export function useKeyboardOffset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e: KeyboardEvent) => {
      setHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  return height;
}
