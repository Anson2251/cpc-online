import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import viteCompressionPlugin from 'vite-plugin-compression'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        vue(),
        viteCompressionPlugin({
            algorithm: 'brotliCompress',
            ext: '.br',
            threshold: 10240, // Compress files > 10KB
            deleteOriginFile: false,
        }),
    ],
    base: './',
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url))
        },
    },
})
