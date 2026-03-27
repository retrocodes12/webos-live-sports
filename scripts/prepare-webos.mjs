import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const distDir = path.join(rootDir, 'dist')
const outDir = path.join(rootDir, 'dist-webos')
const appInfoPath = path.join(rootDir, 'webos', 'appinfo.json')

await rm(outDir, { recursive: true, force: true })
await mkdir(outDir, { recursive: true })
await cp(distDir, outDir, { recursive: true })

const appInfo = JSON.parse(await readFile(appInfoPath, 'utf8'))
await writeFile(path.join(outDir, 'appinfo.json'), `${JSON.stringify(appInfo, null, 2)}\n`)
