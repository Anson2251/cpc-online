<script setup lang="ts">
import { darkTheme, lightTheme, NConfigProvider, NMessageProvider } from "naive-ui";
import { computed, onBeforeUnmount, onMounted, ref, provide } from "vue";

import IdeShell from "@/ide/components/IdeShell.vue";

import { themeOverridesDark, themeOverridesLight } from "./ide/utils/theme";

type ThemeMode = "light" | "dark" | "system";

const THEME_STORAGE_KEY = "cpc-online-theme-mode";
const themeMode = ref<ThemeMode>("system");
const prefersDark = ref(false);
let systemThemeQuery: MediaQueryList | null = null;

const themeInUse = computed(() => {
  if (themeMode.value === "dark") {
    return "dark";
  }
  if (themeMode.value === "light") {
    return "light";
  }
  return prefersDark.value ? "dark" : "light";
});

const appliedTheme = computed(() => {
  return themeInUse.value ? darkTheme : lightTheme;
});

provide("theme-prefered", themeInUse);

const appliedOverride = computed(() => {
  if (themeMode.value === "dark") {
    return themeOverridesDark;
  }
  if (themeMode.value === "light") {
    return themeOverridesLight;
  }
  return prefersDark.value ? themeOverridesDark : themeOverridesLight;
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
</script>

<template>
  <NConfigProvider :theme="appliedTheme" :theme-overrides="appliedOverride">
    <NMessageProvider>
      <IdeShell :theme-mode="themeMode" @update:theme-mode="setThemeMode" />
    </NMessageProvider>
  </NConfigProvider>
</template>
