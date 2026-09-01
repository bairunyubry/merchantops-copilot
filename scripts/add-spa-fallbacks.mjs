import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const dist = resolve('dist')

for (const route of ['diagnosis', 'actions', 'review']) {
  const directory = resolve(dist, route)
  await mkdir(directory, { recursive: true })
  await copyFile(resolve(dist, 'index.html'), resolve(directory, 'index.html'))
}
