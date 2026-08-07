import { createHash } from 'node:crypto'
import { copyFile, readFile, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '../../..')
const generatedDir = join(projectDir, 'store-assets', 'generated')
const storeAssetsDir = join(projectDir, 'store-assets')
const promote = process.argv.includes('--promote')
const requiredNames = [
  '01-organize-preview.png',
  '02-ask-duplicates.png',
  '03-agent-access.png',
  '04-applied-result.png',
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readPngDimensions(buffer, filename) {
  assert(buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a', `${filename} is not a PNG`)
  assert(buffer.subarray(12, 16).toString('ascii') === 'IHDR', `${filename} is missing IHDR data`)
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

async function main() {
  const report = JSON.parse(await readFile(join(generatedDir, 'capture-report.json'), 'utf8'))
  assert(report.schemaVersion === 1, 'capture-report.json has an unsupported schema')
  assert(report.viewport?.width === 1280 && report.viewport?.height === 800, 'report viewport must be 1280x800')

  const files = await readdir(generatedDir)
  const pngNames = files.filter((filename) => filename.endsWith('.png')).sort()
  for (const filename of requiredNames) {
    assert(pngNames.includes(filename), `missing required capture: ${filename}`)
  }
  assert(pngNames.length >= 4 && pngNames.length <= 5, 'expected four required captures and at most one optional capture')

  const reportByName = new Map(report.captures.map((capture) => [capture.filename, capture]))
  assert(reportByName.size === pngNames.length, 'capture report and generated PNG set do not match')
  const hashes = new Set()

  for (const filename of pngNames) {
    const path = join(generatedDir, filename)
    const buffer = await readFile(path)
    const dimensions = readPngDimensions(buffer, filename)
    const details = await stat(path)
    const hash = createHash('sha256').update(buffer).digest('hex')
    const recorded = reportByName.get(filename)
    assert(dimensions.width === 1280 && dimensions.height === 800, `${filename} must be exactly 1280x800`)
    assert(details.size >= 20_000, `${filename} is unexpectedly small (${details.size} bytes)`)
    assert(recorded, `${filename} is missing from capture-report.json`)
    assert(recorded.sha256 === hash, `${filename} does not match its recorded SHA-256`)
    assert(!hashes.has(hash), `${filename} duplicates another capture exactly`)
    hashes.add(hash)
    console.log(`${filename} ${dimensions.width}x${dimensions.height} ${details.size} bytes ${hash}`)
  }

  const releaseFiles = (await readFile(join(projectDir, 'release-files.txt'), 'utf8'))
    .split(/\r?\n/)
    .filter(Boolean)
  assert(
    releaseFiles.every((filename) => !filename.startsWith('skills/') && !filename.startsWith('store-assets/')),
    'development harness or screenshots crossed into release-files.txt',
  )

  if (promote) {
    for (let index = 0; index < pngNames.length; index += 1) {
      const source = join(generatedDir, pngNames[index])
      const destination = join(storeAssetsDir, `screenshot-${index + 1}.png`)
      await copyFile(source, destination)
      console.log(`Promoted ${pngNames[index]} -> store-assets/screenshot-${index + 1}.png`)
    }
    for (let index = pngNames.length; index < 5; index += 1) {
      const stalePath = join(storeAssetsDir, `screenshot-${index + 1}.png`)
      await rm(stalePath, { force: true })
    }
  }

  console.log(`Verified ${pngNames.length} real-Chrome marketing captures for AI Bookmark Organizer ${report.extension.version}.`)
  if (!promote) console.log('No store assets were replaced. Run npm run promote only after visual review.')
}

main().catch((error) => {
  console.error(`Screenshot verification failed: ${error.message}`)
  process.exitCode = 1
})
