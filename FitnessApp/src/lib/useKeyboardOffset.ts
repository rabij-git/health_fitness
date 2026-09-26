import { useEffect, useState } from 'react';
import { Keyboard, KeyboardEvent } from 'react-native';

// KeyboardAvoidingView's built-in behaviors are unreliable for content
// rendered inside a <Modal>: 'height' on Android doesn't compose with a
// flex:1 child (the Modal's own window doesn't consistently participate in
// the resize the way normal screen content does), and — confirmed later,
// the hard way, via a live iOS screenshot of CoachTrainees.tsx's Chat tab
// still showing the keyboard covering the input — 'padding' on iOS isn't
// reliable here either, at least for a KeyboardAvoidingView that
// unmounts/remounts on tab switches the way that screen's does. Tracking
// the real keyboard height via native events and applying it directly as
// an explicit computed size sidesteps both platforms' built-in behavior
// entirely, so this now listens on iOS too, not just Android — callers
// should pair it with `behavior={undefined}` on their KeyboardAvoidingView
// (fully disables its own behavior on both platforms, leaving this hook as
// the only compensation everywhere, not just Android).
//
// Uses the exact same 'keyboardDidShow'/'keyboardDidHide' event names on
// both platforms — deliberately NOT 'keyboardWillShow'/'keyboardWillHide'
// on iOS. An earlier version of this hook tried the Will variants there
// (in principle they fire slightly earlier, in sync with the keyboard's
// own animation), but that's an untested code path that turned out not to
// fix the bug it was meant to fix — while the Did variants are the ones
// already confirmed working on Android. Reusing the proven pattern instead
// of a theoretically-nicer one that's never actually been verified here.
export function useKeyboardOffset(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
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
