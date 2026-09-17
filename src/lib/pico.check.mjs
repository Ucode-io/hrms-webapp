// Проверка вендоренного pico и каскада: `node src/lib/pico.check.mjs`.
// Ловит ровно то, что ломается молча — битый/недокачанный public/facefinder и
// пакет, который перестал экспортироваться после ESM-правки. Позитивный кейс
// (настоящее лицо) здесь не проверить без картинки и canvas — это на устройстве.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import pico from './pico.js'

const cascadePath = fileURLToPath(new URL('../../public/facefinder', import.meta.url))
const bytes = new Int8Array(await readFile(cascadePath))
assert.equal(bytes.length, 239632, 'каскад недокачан или подменён')

const classify = pico.unpack_cascade(bytes)
assert.equal(typeof classify, 'function', 'каскад не распаковался')

const ncols = 320
const nrows = 240
const params = { shiftfactor: 0.1, minsize: 100, maxsize: 1000, scalefactor: 1.1 }
const remember = pico.instantiate_detection_memory(5)

// Пустой кадр: ни один проход не должен дать лицо с качеством выше порога —
// иначе автоснимок сработает на чёрном экране до первого кадра камеры.
for (let i = 0; i < 5; i += 1) {
  const dets = pico.cluster_detections(
    remember(pico.run_cascade({ pixels: new Uint8Array(ncols * nrows), nrows, ncols, ldim: ncols }, classify, params)),
    0.2,
  )
  assert.ok(dets.every(([, , , quality]) => quality <= 50), 'лицо на пустом кадре')
}

console.log('pico ok')
