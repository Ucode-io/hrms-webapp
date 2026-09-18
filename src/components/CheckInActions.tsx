import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { resolveCompaniesId } from '../api/adminRequest'
import { uploadFile } from '../api/dashboardService'
import pico from '../lib/pico.js'
import {
  attendanceService,
  buildMarkTimes,
  readMarkAction,
  type AttendanceMark,
  type AttendanceRecord,
  type MarkAction,
} from '../api/attendanceService'

const UPLOAD_TIMEOUT_MS = 10_000
const GEO_DEADLINE_MS = 8_000
// Столько раз спрашиваем координаты, прежде чем разрешить отметку без них.
const GEO_ATTEMPTS = 2
const PHOTO_MAX_SIDE = 720
const PHOTO_QUALITY = 0.7

// Каскад лежит в public/ и качается по сети (≈234 КБ, кэшируется браузером), а
// не импортируется: бинарь незачем тащить в граф модулей и в хеш сборки.
const CASCADE_URL = '/facefinder'
const DETECT_INTERVAL_MS = 120 // ~8 к/с: на 320×240 проход занимает единицы мс
const DETECT_MAX_SIDE = 320 // кадр для pico: 320×240 ≈ 77 тыс. пикселей на проход
const COUNTDOWN_MS = 3_000

// Ручки калибровки. Камеры и освещение в офисах разные, цифры подобраны на
// столе: если автоснимок срабатывает сам по себе — поднимать FACE_MIN_QUALITY
// (до ~70) и FACE_STABLE_TICKS; если не срабатывает вовсе — опускать.
const FACE_MIN_QUALITY = 50 // порог pico при памяти на 5 кадров
// Доля ширины кадра, а не пиксели: иначе правка DETECT_MAX_SIDE молча меняет
// строгость детектора.
const FACE_MIN_WIDTH = 0.31 // ~100 px при кадре 320 — отсекает прохожего за спиной
const FACE_MAX_OFFSET = 0.25 // смещение от центра кадра, в долях ширины
const FACE_STABLE_TICKS = 3 // 3 × 120 мс ≈ 0.36 с непрерывного лица

const ACTION_LABEL: Record<MarkAction, string> = { IN: 'Приход', OUT: 'Уход' }

type Classify = ReturnType<typeof pico.unpack_cascade>

/**
 * Каскад грузится один раз на загрузку страницы и переживает открытие-закрытие
 * шторки. Промис кэшируем, а на ошибке сбрасываем — следующая шторка попробует
 * снова. Отказ не фатален: без каскада просто нет авторежима.
 */
let cascadePromise: Promise<Classify> | null = null
function loadCascade(): Promise<Classify> {
  cascadePromise ??= fetch(CASCADE_URL)
    .then((response) => {
      if (!response.ok) throw new Error(`facefinder ${response.status}`)
      return response.arrayBuffer()
    })
    .then((buffer) => pico.unpack_cascade(new Int8Array(buffer)))
    .catch((loadError) => {
      cascadePromise = null
      throw loadError
    })
  return cascadePromise
}

const EMPTY_TIME = '--'

function showTime(value: unknown): string {
  const text = String(value || '')
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : EMPTY_TIME
}

/** Кадр с камеры → JPEG ~80–150 КБ. Полноразмерные 4 МБ из подъезда не уезжают. */
function captureFrame(video: HTMLVideoElement): Promise<File | null> {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) return Promise.resolve(null)

  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)

  // Фронтальная камера отдаёт зеркальный кадр — разворачиваем обратно, чтобы
  // на снимке текст читался, а не отражался. Превью зеркалим тем же способом
  // (CSS на <video>), иначе картинка в кадре и в файле разъедутся.
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
  }

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob ? new File([blob], 'mark.jpg', { type: 'image/jpeg' }) : null),
      'image/jpeg',
      PHOTO_QUALITY,
    )
  })
}

/** `lat,long`, шесть знаков — как ждёт ссылка на карты. Порядок как в Google/Яндексе. */
function formatLocation(latitude: number, longitude: number): string {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`
}

/**
 * Координаты: сначала Telegram, потом браузер.
 *
 * Внутри мини-аппа `navigator.geolocation` молчит — колбэк не приходит ни
 * успехом, ни ошибкой, поэтому единственный рабочий источник там
 * LocationManager (Bot API 8.0). Вне Telegram его нет, и работает обычная
 * браузерная геолокация. Возвращаем пустую строку вместо ошибки: отсутствие
 * координат отметку не отменяет.
 */
function requestLocation(onResult: (location: string) => void): void {
  const manager = window.Telegram?.WebApp?.LocationManager

  if (manager) {
    const read = () => {
      if (manager.isLocationAvailable === false) {
        onResult('')
        return
      }
      manager.getLocation((location) => {
        onResult(location ? formatLocation(location.latitude, location.longitude) : '')
      })
    }

    // `init` зовёт колбэк только на первой инициализации за сессию мини-аппа.
    // Второй раз он молчит — и приход проходил, а уход в том же сеансе висел
    // до таймаута, пока приложение не перезапустят. Инициализирован — идём
    // сразу за координатой.
    if (manager.isInited) read()
    else manager.init(read)
    return
  }

  navigator.geolocation?.getCurrentPosition(
    (position) => onResult(formatLocation(position.coords.latitude, position.coords.longitude)),
    () => onResult(''),
    // enableHighAccuracy: false намеренно — GPS-фикс в помещении ищется
    // десятками секунд, а координаты по Wi-Fi приходят почти сразу и для
    // вопроса «человек в офисе или дома» точны более чем достаточно.
    { enableHighAccuracy: false, timeout: GEO_DEADLINE_MS, maximumAge: 60_000 },
  )
}

/**
 * Есть ли в кадре лицо того, кто держит телефон.
 *
 * Зеркалить кадр для детектора не нужно — pico симметричен, а проверка «по
 * центру» тем более. Лицо принимаем только крупное и близкое к центру: так
 * постер на дальней стене и прохожий за спиной отсекаются без всякой логики
 * поверх — они мелкие и сбоку.
 */
function hasFace(video: HTMLVideoElement, canvas: HTMLCanvasElement, classify: Classify,
  remember: (dets: ReturnType<typeof pico.run_cascade>) => ReturnType<typeof pico.run_cascade>): boolean {
  // getUserMedia резолвится раньше первого кадра: videoWidth там 0, а pico на
  // пустом буфере честно находит «лица».
  if (!video.videoWidth || video.readyState < 2) return false

  const ncols = DETECT_MAX_SIDE
  const nrows = Math.round((DETECT_MAX_SIDE * video.videoHeight) / video.videoWidth)
  if (canvas.width !== ncols || canvas.height !== nrows) {
    canvas.width = ncols
    canvas.height = nrows
  }

  const minSize = Math.round(ncols * FACE_MIN_WIDTH)

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(video, 0, 0, ncols, nrows)

  const { data } = ctx.getImageData(0, 0, ncols, nrows)
  const pixels = new Uint8Array(ncols * nrows)
  for (let i = 0; i < pixels.length; i += 1) {
    const p = i * 4
    pixels[i] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000
  }

  const dets = pico.cluster_detections(
    remember(pico.run_cascade(
      { pixels, nrows, ncols, ldim: ncols },
      classify,
      { shiftfactor: 0.1, minsize: minSize, maxsize: 1000, scalefactor: 1.1 },
    )),
    0.2,
  )

  return dets.some(([row, col, size, quality]) =>
    quality > FACE_MIN_QUALITY
    && size >= minSize
    && Math.hypot(col - ncols / 2, row - nrows / 2) < FACE_MAX_OFFSET * ncols)
}

function CameraSheet({ action, onClose }: { action: MarkAction; onClose: () => void }) {
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [location, setLocation] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  // Автоснимок. Взводится, когда готовы камера и каскад, и выключается
  // насовсем по любому касанию экрана.
  const [cascadeReady, setCascadeReady] = useState(false)
  // Координаты обязательны, но не любой ценой: после GEO_ATTEMPTS неудачных
  // попыток отметка разрешается и без них. Иначе человек без разрешения на
  // геолокацию не смог бы отметиться вообще, а отметка важнее координаты.
  const [geoTries, setGeoTries] = useState(0)
  // Сразу true: первая попытка стартует вместе с монтированием шторки.
  const [geoPending, setGeoPending] = useState(true)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [autoOff, setAutoOff] = useState(false)
  const [faceSeen, setFaceSeen] = useState(false)
  const classifyRef = useRef<Classify | null>(null)
  const memoryRef = useRef<ReturnType<typeof pico.instantiate_detection_memory> | null>(null)
  const grayRef = useRef<HTMLCanvasElement | null>(null)
  const stableRef = useRef(0)
  const isCounting = countdown !== null
  // isSending — состояние, и внутри одного тика оно устаревшее. Отметка
  // необратима (триггер AFTER CREATE сразу шлёт карточку в Telegram, удаления
  // из приложения нет), поэтому вход в submit сторожит ref, а не рендер.
  const sendingRef = useRef(false)

  // Координаты обязательны, пока попытки не исчерпаны.
  const geoOptional = geoTries >= GEO_ATTEMPTS
  const canMark = Boolean(location) || geoOptional

  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  const companyId = resolveCompaniesId(profile, session?.user_data, session?.user)

  const closedRef = useRef(false)

  /**
   * Одна попытка получить координаты.
   *
   * Свой дедлайн поверх геолокации обязателен: внутри Telegram LocationManager
   * умеет не позвать колбэк вовсе — ни успехом, ни ошибкой, — а собственный
   * timeout есть только у браузерной ветки. Без таймера попытка не завершилась
   * бы никогда и кнопка осталась бы заблокированной.
   */
  const runGeo = () => {
    let done = false

    const finish = (result: string) => {
      if (done || closedRef.current) return
      done = true
      window.clearTimeout(timer)
      setGeoPending(false)
      if (result) setLocation(result)
      else setGeoTries((tries) => tries + 1)
    }

    const timer = window.setTimeout(() => finish(''), GEO_DEADLINE_MS)
    requestLocation(finish)
  }

  const tryGeo = () => {
    setGeoPending(true)
    runGeo()
  }

  // Камера и гео запрашиваются независимо: отказ в одном не должен мешать другому.
  useEffect(() => {
    closedRef.current = false

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (closedRef.current) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => { if (!closedRef.current) setCameraReady(false) })

    runGeo()

    return () => {
      closedRef.current = true
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    // Первая попытка нужна ровно одна, на открытие шторки.
  }, [])

  // Каскад. Молча падаем в ручной режим: без него просто нет автоснимка.
  useEffect(() => {
    let alive = true
    loadCascade()
      .then((classify) => {
        if (!alive) return
        classifyRef.current = classify
        setCascadeReady(true)
      })
      .catch((cascadeError) => console.warn('Каскад детектора не загрузился', cascadeError))
    return () => { alive = false }
  }, [])

  // Гео больше не держит детект: цикл крутится параллельно с определением
  // координат, иначе лицо начинали бы искать через восемь секунд после
  // открытия камеры. Координата нужна только в момент выстрела — её ждёт
  // `canMark` ниже, и отсчёт стартует сразу, как она придёт.
  useEffect(() => {
    if (!cameraReady || !cascadeReady || autoOff || isSending || isCounting) return

    memoryRef.current ??= pico.instantiate_detection_memory(5)
    grayRef.current ??= document.createElement('canvas')
    stableRef.current = 0

    const timer = window.setInterval(() => {
      const video = videoRef.current
      const classify = classifyRef.current
      const remember = memoryRef.current
      const canvas = grayRef.current
      if (!video || !classify || !remember || !canvas) return

      const found = hasFace(video, canvas, classify, remember)
      setFaceSeen(found)
      stableRef.current = found ? stableRef.current + 1 : 0

      // Через функцию, а не по значению из замыкания: иначе тик видел бы
      // countdown таким, каким тот был на момент запуска цикла.
      if (canMark && stableRef.current >= FACE_STABLE_TICKS) {
        setCountdown((current) => current ?? Math.ceil(COUNTDOWN_MS / 1000))
      }
    }, DETECT_INTERVAL_MS)

    return () => window.clearInterval(timer)
  }, [cameraReady, cascadeReady, canMark, autoOff, isSending, isCounting])

  const submit = async () => {
    if (sendingRef.current) return
    sendingRef.current = true
    setIsSending(true)
    setError('')

    try {
      // Сначала фото, потом событие: карточку в Telegram собирает триггер
      // AFTER CREATE и берёт снимок из самой записи — дописать его позже уже некуда.
      let picture = ''
      if (cameraReady && videoRef.current) {
        const file = await captureFrame(videoRef.current)
        if (file) {
          // Фото не имеет права утопить отметку: не доехало — пишем без него.
          picture = await Promise.race([
            uploadFile(file),
            new Promise<string>((resolve) => setTimeout(() => resolve(''), UPLOAD_TIMEOUT_MS)),
          ]).catch((uploadError) => {
            console.warn('Фото отметки не загрузилось', uploadError)
            return ''
          })
        }
      }

      await attendanceService.createMark({
        userBaseId: employeeGuid,
        companyId,
        action,
        picture,
        location,
      })

      // ponytail: судьбу события не отслеживаем — конвейер может отбросить его
      // как нерабочий день уже после 201. Правду покажет строка состояния,
      // когда обновится. Понадобится предупреждать заранее — проверять день
      // надо до нажатия, по тем же данным, что рисуют «Эта неделя».
      await queryClient.invalidateQueries({ queryKey: ['attendance', employeeGuid] })
      // Поток событий — источник чередования: не сбросить его значит показать
      // ту же кнопку, что и до отметки.
      await queryClient.invalidateQueries({ queryKey: ['attendance-marks', employeeGuid] })
      onClose()
    } catch (submitError) {
      console.error('Отметка не записалась', submitError)
      setError('Не удалось отметиться. Попробуйте ещё раз.')
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }

  // Отсчёт. Отмена — просто countdown = null: очистка эффекта снимает
  // отложенный тик, отдельного пути прерывания не нужно.
  useEffect(() => {
    if (countdown === null) return
    const timer = window.setTimeout(() => {
      if (countdown > 1) {
        setCountdown(countdown - 1)
        return
      }
      setCountdown(null)
      void submit()
    }, 1000)
    return () => window.clearTimeout(timer)
    // submit пересоздаётся каждый рендер и перезапускал бы секунду; повторный
    // вход всё равно закрыт sendingRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown])

  // Любое касание шторки выключает авторежим до конца сессии. Повторное
  // взведение было бы ловушкой: человек гасит отсчёт, а он начинается снова.
  // Новая шторка — новый монтаж, так что «до конца сессии» получается само.
  const stopAuto = () => {
    // Пока координат нет, гасить нечего — отсчёт всё равно не идёт. Без этой
    // оговорки нажатие «определить ещё раз» убивало бы автоснимок раньше, чем
    // он вообще смог бы взвестись.
    if (!canMark) return
    setCountdown(null)
    setAutoOff(true)
    setFaceSeen(false)
  }

  const isArmed = cameraReady && cascadeReady && !autoOff && !isCounting && !isSending

  return (
    <Drawer.Root open onOpenChange={(open) => { if (!open && !isSending) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        {/* Перехват на фазе capture: гасим авто раньше любого дочернего
            обработчика, но тап всё равно доходит до кнопки под пальцем — жать
            «Отметить» вручную в тот же момент можно. */}
        <Drawer.Content
          onPointerDownCapture={stopAuto}
          className="fixed inset-0 z-50 flex flex-col bg-[#0b1220] outline-none"
        >
          <Drawer.Title className="sr-only">Отметить {ACTION_LABEL[action].toLowerCase()}</Drawer.Title>
          <Drawer.Description className="sr-only">Снимок и геолокация в момент отметки</Drawer.Description>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full -scale-x-100 object-cover ${cameraReady ? '' : 'hidden'}`}
            />

            {/* Овал — подсказка кадрирования, не валидация: лицо никто не сверяет. */}
            <div className="pointer-events-none relative z-10 flex h-[62%] w-[72%] max-w-[320px] items-center justify-center rounded-[50%] border border-white/70 px-6 text-center">
              {countdown !== null && (
                <div className="flex flex-col items-center gap-1 text-white">
                  <span className="text-[64px] font-bold leading-none">{countdown}</span>
                  <span className="text-[13px] text-white/70">Снимаем автоматически</span>
                </div>
              )}

              {!cameraReady && (
                <div className="flex flex-col items-center gap-3 text-white/60">
                  <Icon icon="mdi:camera-outline" width={34} />
                  <p className="m-0 text-[13px] leading-snug">
                    Нет доступа к камере. Разрешите доступ в настройках браузера,
                    либо продолжите без камеры.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 space-y-3 bg-[#111a2b] px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+18px)]">
            {!cameraReady && (
              <div className="flex items-center gap-2.5 rounded-2xl bg-white/5 px-4 py-3 text-[13px] font-semibold text-white">
                <Icon icon="mdi:alert-circle-outline" width={20} className="text-rose-400" />
                Камера недоступна — можно продолжить вручную
              </div>
            )}

            {error && <p className="m-0 text-center text-[13px] text-rose-400">{error}</p>}

            {/* Гео: пока координат нет и попытки не вышли, отметка заблокирована.
                Вторую попытку запускает человек — если в разрешении отказано,
                молчаливый повтор просто съел бы ещё восемь секунд. */}
            {!location && (
              geoPending ? (
                <div className="flex items-center justify-center gap-2 text-[13px] text-white/60">
                  <Icon icon="mdi:crosshairs-gps" width={18} className="animate-pulse" />
                  Определяем геолокацию…
                </div>
              ) : geoOptional ? (
                <p className="m-0 text-center text-[12px] text-amber-300">
                  Геолокация недоступна — отметим без неё
                </p>
              ) : (
                <button
                  type="button"
                  onClick={tryGeo}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-[14px] font-semibold text-white"
                >
                  <Icon icon="mdi:crosshairs-gps" width={18} />
                  Нужна геолокация — определить ещё раз
                </button>
              )
            )}

            {/* Плашки «загружаем детектор» намеренно нет: продукт здесь —
                кнопка, автоснимок лишь бонус, и его отсутствие не новость. */}
            {isArmed && (
              <p className="m-0 text-center text-[12px] text-white/50">
                {faceSeen ? 'Лицо в кадре — не двигайтесь' : 'Смотрите в камеру — снимем автоматически'}
              </p>
            )}

            {countdown !== null && (
              <button
                type="button"
                onClick={stopAuto}
                className="w-full rounded-2xl bg-white/10 py-3 text-[14px] font-semibold text-white"
              >
                Отменить автоснимок
              </button>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={isSending || !canMark}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] py-4 text-[15px] font-bold text-white disabled:opacity-60"
            >
              {isSending
                ? <Icon icon="mdi:loading" width={20} className="animate-spin" />
                : <Icon icon={action === 'IN' ? 'mdi:check-circle-outline' : 'mdi:clock-outline'} width={20} />}
              Отметить {ACTION_LABEL[action].toLowerCase()}
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={isSending}
              className="w-full py-2 text-[14px] text-white/50 disabled:opacity-40"
            >
              Отмена
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}

/**
 * Сегодняшний день: отметки, времена и то, что человек нажмёт следующим.
 *
 * Два источника намеренно: поток событий точен и знает про повторные приходы,
 * агрегат — страховка на случай, когда турникет доехал до сводки дня, а до
 * потока нет. Хук общий для карточек и кнопки, react-query схлопнет запросы.
 */
function useToday() {
  const { profile, session } = useAuth()

  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''

  const iso = buildMarkTimes(new Date()).date

  // Тот же ключ, что и на /time — данные общие, лишнего запроса не будет.
  const { data: records = [] } = useQuery({
    queryKey: ['attendance', employeeGuid],
    queryFn: () => attendanceService.getByEmployee(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 60_000,
  })

  const { data: marks = [] } = useQuery({
    queryKey: ['attendance-marks', employeeGuid, iso],
    queryFn: () => attendanceService.getMarksForDate(employeeGuid, iso),
    enabled: Boolean(employeeGuid),
    staleTime: 30_000,
  })

  return useMemo(() => {
    const day = (records as AttendanceRecord[])
      .find((record) => String(record.date || '').slice(0, 10) === iso)

    // Отметки приходят свежими сверху, поэтому первый OUT — последний уход,
    // а последний IN — первый приход за день.
    const ins = (marks as AttendanceMark[]).filter((mark) => readMarkAction(mark) === 'IN')
    const outs = (marks as AttendanceMark[]).filter((mark) => readMarkAction(mark) === 'OUT')

    const checkIn = showTime(ins.at(-1)?.event_time ?? day?.check_in_time)
    const checkOut = showTime(outs[0]?.event_time ?? day?.check_out_time)

    // Чередуем от последнего события: приход → уход → приход → уход. Без потока
    // событий откатываемся на сводку дня — там видно только первый приход.
    const last = (marks as AttendanceMark[]).map(readMarkAction).find(Boolean)
    const nextAction: MarkAction = last
      ? (last === 'IN' ? 'OUT' : 'IN')
      : (checkIn === EMPTY_TIME ? 'IN' : 'OUT')

    return { employeeGuid, checkIn, checkOut, nextAction }
  }, [records, marks, iso, employeeGuid])
}

/** Карточки «Приход / Уход» над лентой — как в примере с Kirish/Chiqish. */
export function CheckInSummary() {
  const { checkIn, checkOut } = useToday()

  const card = (label: string, time: string, icon: string, tone: string) => (
    <div className={`flex-1 rounded-[20px] px-4 py-2.5 text-center ${tone}`}>
      <p className="m-0 flex items-center justify-center gap-1.5 text-[13px] font-semibold">
        <Icon icon={icon} width={16} />
        {label}
      </p>
      <p className="mt-0.5 mb-0 text-[17px] font-bold tabular-nums">{time}</p>
    </div>
  )

  return (
    <section className="animate-fade-in-up flex gap-2.5">
      {card('Приход', checkIn, 'mdi:login', 'bg-emerald-500/15 text-emerald-500')}
      {card('Уход', checkOut, 'mdi:logout', 'bg-amber-500/15 text-amber-500')}
    </section>
  )
}

export function CheckInActions() {
  const [action, setAction] = useState<MarkAction | null>(null)
  const { nextAction } = useToday()

  // Каскад тянем заранее, пока человек ещё смотрит ленту: 234 КБ по мобильной
  // связи — это те самые секунды, на которые раньше опаздывал автоснимок.
  // Промис кэшируется в модуле, так что шторка возьмёт готовое.
  useEffect(() => { loadCascade().catch(() => {}) }, [])

  return (
    // Кнопка стоит сразу под карточками «Приход / Уход»: действие рядом с тем,
    // что оно меняет. Раньше она была липкой внизу экрана — отсюда `sticky`,
    // `mt-auto` и подложка цветом фона, чтобы лента не просвечивала. На новом
    // месте всё это не нужно: обычный блок в потоке.
    <section className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => setAction(nextAction)}
        className={`flex w-full items-center justify-center gap-2 rounded-[20px] py-4 text-[15px] font-bold text-white shadow-sm transition-transform duration-150 active:scale-[0.97] ${
          nextAction === 'IN' ? 'bg-emerald-500' : 'bg-amber-500'
        }`}
      >
        <Icon icon={nextAction === 'IN' ? 'mdi:login' : 'mdi:logout'} width={20} />
        {ACTION_LABEL[nextAction]}
      </button>

      {action && <CameraSheet action={action} onClose={() => setAction(null)} />}
    </section>
  )
}
