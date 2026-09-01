import { resolve } from 'node:path'
import { build } from 'vite'

await build({
  configFile: false,
  publicDir: false,
  ssr: {
    noExternal: ['zod'],
  },
  build: {
    ssr: true,
    outDir: resolve('api'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: {
        advice: resolve('server/apiHandler.ts'),
        'csv-proxy': resolve('server/csvProxyHandler.ts'),
        'demo-live.csv': resolve('server/demoLiveHandler.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        format: 'es',
      },
    },
  },
})

await build({
  configFile: false,
  publicDir: false,
  ssr: {
    noExternal: ['zod'],
  },
  build: {
    ssr: true,
    outDir: resolve('cloudbase/functions/merchantops-api'),
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      input: resolve('server/cloudbaseHttpServer.ts'),
      output: {
        entryFileNames: 'server.js',
        format: 'cjs',
      },
    },
  },
})
