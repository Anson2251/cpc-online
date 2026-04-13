<script setup lang="ts">
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from "naive-ui";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

import IdeShell from "@/ide/components/IdeShell.vue";

type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "cpc-online-theme-mode";
const themeMode = ref<ThemeMode>("system");
const prefersDark = ref(false);
let systemThemeQuery: MediaQueryList | null = null;

const appliedTheme = computed(() => {
  if (themeMode.value === "dark") {
    return darkTheme;
  }
  if (themeMode.value === "light") {
    return lightTheme;
  }
  return prefersDark.value ? darkTheme : lightTheme;
});

function loadThemeMode(): void {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "light" || saved === "dark" || saved === "system") {
    themeMode.value = saved;
  }
}

function handleSystemThemeChange(event: MediaQueryListEvent): void {
  prefersDark.value = event.matches;
}

onMounted(() => {
  loadThemeMode();
  systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  prefersDark.value = systemThemeQuery.matches;
  systemThemeQuery.addEventListener("change", handleSystemThemeChange);
});

onBeforeUnmount(() => {
  systemThemeQuery?.removeEventListener("change", handleSystemThemeChange);
});

function setThemeMode(next: ThemeMode): void {
  themeMode.value = next;
  window.localStorage.setItem(THEME_STORAGE_KEY, next);
}

const themeOverrides = {
  common: {
    fontFamily: "ZSFT-go, Inter Variable, sans-serif",
    fontFamilyMono: "ZSFT-443, JetBrains Mono, Cascadia Mono, Fira Code, monospace",
  },
};
</script>

<template>
  <NConfigProvider :theme="appliedTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <IdeShell :theme-mode="themeMode" @update:theme-mode="setThemeMode" />
    </NMessageProvider>
  </NConfigProvider>
</template>
