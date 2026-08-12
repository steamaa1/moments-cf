// https://nuxt.com/docs/api/configuration/nuxt-config
import site from './site.config'

export default defineNuxtConfig({
    compatibilityDate: '2024-04-03',
    devtools: {enabled: false},
    modules: ["@nuxt/ui", '@nuxt/icon', '@nuxtjs/color-mode', '@vueuse/nuxt', 'dayjs-nuxt'],
    ssr: false,
    dayjs: {
        locales: ['zh'],
        defaultLocale: 'zh',
        plugins: ['utc', 'relativeTime']
    },
    icon: {
        clientBundle: {
            scan: {
                globInclude: ['**/*.{vue,jsx,tsx}', 'node_modules/@nuxt/ui/**/*.js'],
                globExclude: ['.*', 'coverage', 'test', 'tests', 'dist', 'build'],
            },
        },
    },
    tailwindcss: {
        safelist: [
            'grid-cols-1',
            'grid-cols-3',
        ]
    },
    vue: {
        compilerOptions: {
            isCustomElement: (tag:string) => ['meting-js'].includes(tag),
        },
    },
    app: {
        head: {
            title: site.title,
            meta: [
                { name: "viewport", content: "width=device-width, initial-scale=1, user-scalable=no" },
                { charset: "utf-8" },
                { name: "description", content: site.description },
                { name: "keywords", content: site.keywords },
                { property: "og:site_name", content: site.title },
                { property: "og:type", content: "website" },
                { property: "og:title", content: site.title },
                { property: "og:description", content: site.description },
                { property: "og:image", content: site.ogImage },
                { name: "twitter:card", content: "summary" },
                { name: "twitter:title", content: site.title },
                { name: "twitter:description", content: site.description },
            ],
        }
    },
    vite: {
        server: {
            proxy: {
                "/api": {
                    target: "http://localhost:37892",
                },
                "/upload": {
                    target: "http://localhost:37892",
                },
                "/rss": {
                    target: "http://localhost:37892",
                },
            },
        },
        build: {
            rollupOptions: {
                output: {
                    hashCharacters: 'base36'
                }
            }
        }
    }
})