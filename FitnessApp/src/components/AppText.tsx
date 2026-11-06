import React from 'react';
import {
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextProps,
  type TextInputProps,
  type TextInputInstance,
  type TextStyle,
} from 'react-native';

// Brand font (Poppins, see App.tsx's useFonts call). A custom fontFamily
// makes RN ignore `fontWeight` entirely on iOS once it's set (Android fakes
// bold on top of a custom font, iOS does not) — so instead of touching every
// one of this app's many `fontWeight: '700'/'800'` style objects, every
// fontWeight value already in use is mapped here to the matching bundled
// Poppins face. Text/TextInput throughout the app import from this file
// instead of 'react-native' directly (see each screen's import line) so this
// mapping applies everywhere without per-callsite changes.
const WEIGHT_TO_FONT: Record<string, string> = {
  '100': 'Poppins_400Regular',
  '200': 'Poppins_400Regular',
  '300': 'Poppins_400Regular',
  '400': 'Poppins_400Regular',
  normal: 'Poppins_400Regular',
  '500': 'Poppins_500Medium',
  '600': 'Poppins_600SemiBold',
  '700': 'Poppins_700Bold',
  bold: 'Poppins_700Bold',
  '800': 'Poppins_800ExtraBold',
  '900': 'Poppins_900Black',
};

function fontFamilyFor(style: TextStyle | TextStyle[] | undefined): string {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const weight = flat.fontWeight != null ? String(flat.fontWeight) : '400';
  return WEIGHT_TO_FONT[weight] ?? 'Poppins_400Regular';
}

export function Text({ style, ...props }: TextProps) {
  return <RNText {...props} style={[style, { fontFamily: fontFamilyFor(style as TextStyle) }]} />;
}

// Forwarded so existing `useRef<TextInput>(null)` + `.focus()` call sites —
// e.g. the modal autoFocus-race fix documented in CLAUDE.md, which focuses a
// TextInput ref from a Modal's onShow — keep working unchanged. The
// `interface` merge below lets `TextInput` serve both as the JSX component
// (the const) and as the ref instance type (the interface), the same dual
// role RN's own class-based TextInput export used to have natively.
//
// SDK 58's stricter RN types turned `TextInput` itself from a class (usable
// directly as a ref/instance type) into a plain function-component type with
// no instance shape of its own — a real example of the exact "refs now use
// instance types" change in the SDK 58 changelog. RN now exports the actual
// instance shape separately as `TextInputInstance`; extending THAT instead
// of `RNTextInput` here is the one-line fix that keeps every other file's
// `useRef<TextInput>(null)` + `.focus()` call site in the app compiling
// unchanged — this file exists specifically to absorb this kind of churn in
// one place rather than at every call site.
export interface TextInput extends TextInputInstance {}

export const TextInput = React.forwardRef<TextInputInstance, TextInputProps>(function TextInput(
  { style, ...props },
  ref
) {
  return (
    <RNTextInput
      ref={ref}
      {...props}
      style={[style, { fontFamily: fontFamilyFor(style as TextStyle) }]}
    />
  );
});
