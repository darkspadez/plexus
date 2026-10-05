import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Non-default font-size tokens from globals.css (`--text-label`) must be
// registered here; otherwise tailwind-merge reads `text-label` as a text color
// and drops it when a `text-foreground-*` class follows. (`2xs`/`3xs` are
// already handled by tailwind-merge's built-in size matching.)
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['label'],
      radius: ['box', 'field', 'selector'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
