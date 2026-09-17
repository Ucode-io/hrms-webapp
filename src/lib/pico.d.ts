// ponytail: минимальная типизация вендоренного pico.js вместо пакета `picojs` —
// тот собран как CommonJS с `pico = {}` без объявления и падает ReferenceError
// в любом ESM-бандлере. Описываем ровно четыре функции, которые зовём.

/** Кадр в оттенках серого: `pixels` длиной `nrows * ldim`. */
export interface PicoImage {
  pixels: Uint8Array
  nrows: number
  ncols: number
  ldim: number
}

export interface PicoParams {
  scalefactor: number
  shiftfactor: number
  minsize: number
  maxsize: number
}

/** `[row, col, scale, quality]` — центр в пикселях кадра, сторона, уверенность. */
export type PicoDetection = [number, number, number, number]

type ClassifyRegion = (r: number, c: number, s: number, pixels: Uint8Array, ldim: number) => number

declare const pico: {
  unpack_cascade: (bytes: Int8Array) => ClassifyRegion
  run_cascade: (image: PicoImage, classify: ClassifyRegion, params: PicoParams) => PicoDetection[]
  cluster_detections: (dets: PicoDetection[], iouThreshold: number) => PicoDetection[]
  instantiate_detection_memory: (frames: number) => (dets: PicoDetection[]) => PicoDetection[]
}

export default pico
