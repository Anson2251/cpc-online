<script setup lang="ts">
import { darkTheme, NConfigProvider, NMessageProvider } from "naive-ui";

import IdeShell from "@/ide/components/IdeShell.vue";

const themeOverrides = {
  common: {
    fontFamily: "ZSFT-go, Inter Variable, sans-serif",
    fontFamilyMono: "ZSFT-443, JetBrains Mono, Cascadia Mono, Fira Code, monospace",
  },
};
</script>

<template>
  <NConfigProvider :theme="darkTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <IdeShell />
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
@font-face{font-family:"ZSFT-443";src:url("https://fontsapi.zeoseven.com/443/italic.woff2") format("woff2");font-style:italic;font-weight:100 900;font-display:swap;}@font-face{font-family:"ZSFT-443";src:url("https://fontsapi.zeoseven.com/443/main.woff2") format("woff2");font-style:normal;font-weight:100 900;font-display:swap;}
@font-face{font-family:"ZSFT-go";src:url("https://fontsapi.zeoseven.com/go/italic.woff2") format("woff2");font-style:italic;font-weight:100 900;font-display:swap;}@font-face{font-family:"ZSFT-go";src:url("https://fontsapi.zeoseven.com/go/main.woff2") format("woff2");font-style:normal;font-weight:100 900;font-display:swap;}
</style>
