import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Non-default font-size tokens from globals.css (`--text-label`) must be
// registered here; otherwise tailwind-merge reads `text-label` as a text color
// and drops it when a `text-foreground-*` class follows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['label'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
