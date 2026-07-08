import { ActionIcon, useComputedColorScheme, useMantineColorScheme } from '@mantine/core';

/**
 * Light/dark toggle (§7.3). Mantine's color-scheme manager (configured in
 * main.tsx) initializes from prefers-color-scheme and persists explicit
 * choices to localStorage.
 */
export function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const computed = useComputedColorScheme('light');

  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label="Toggle color scheme"
      onClick={() => setColorScheme(computed === 'light' ? 'dark' : 'light')}
    >
      {computed === 'light' ? '🌙' : '☀️'}
    </ActionIcon>
  );
}
