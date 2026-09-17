import { useEffect, useMemo, useRef, useState } from 'react'
import { Drawer } from 'vaul'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '@iconify/react'
import { useAuth } from '../context/AuthContext'
import { resolveCompaniesId } from '../api/adminRequest'
import { uploadFile } from '../api/dashboardService'
import {
  attendanceService,
  buildMarkTimes,
  type AttendanceRecord,
  type MarkAction,
} from '../api/attendanceService'

const UPLOAD_TIMEOUT_MS = 10_000
const GEO_DEADLINE_MS = 8_000
const PHOTO_MAX_SIDE = 720
const PHOTO_QUALITY = 0.7

const ACTION_LABEL: Record<MarkAction, string> = { IN: 'Приход', OUT: 'Уход' }

function showTime(value: unknown): string {
  const text = String(value || '')
  return /^\d{2}:\d{2}/.test(text) ? text.slice(0, 5) : '—'
}

/** Кадр с камеры → JPEG ~80–150 КБ. Полноразмерные 4 МБ из подъезда не уезжают. */
function captureFrame(video: HTMLVideoElement): Promise<File | null> {
  const { videoWidth: w, videoHeight: h } = video
  if (!w || !h) return Promise.resolve(null)

  const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(w, h))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)

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
    manager.init(() => {
      if (manager.isLocationAvailable === false) {
        onResult('')
        return
      }
      manager.getLocation((location) => {
        onResult(location ? formatLocation(location.latitude, location.longitude) : '')
      })
    })
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

function CameraSheet({ action, onClose }: { action: MarkAction; onClose: () => void }) {
  const { profile, session } = useAuth()
  const queryClient = useQueryClient()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [location, setLocation] = useState('')
  const [geoChecked, setGeoChecked] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''
  const companyId = resolveCompaniesId(profile, session?.user_data, session?.user)

  // Камера и гео запрашиваются независимо: отказ в одном не должен мешать другому.
  useEffect(() => {
    let cancelled = false

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => { if (!cancelled) setCameraReady(false) })

    // Свой дедлайн поверх геолокации: ни браузер, ни Telegram не обязаны
    // ответить — диалог разрешения может висеть неотвеченным сколько угодно.
    // Без таймера плашка «Определяем…» застревала бы навсегда. Координата,
    // пришедшая позже, всё равно подставится: человек жмёт не в первую секунду.
    const deadline = window.setTimeout(() => { if (!cancelled) setGeoChecked(true) }, GEO_DEADLINE_MS)

    requestLocation((result) => {
      if (cancelled) return
      if (result) setLocation(result)
      setGeoChecked(true)
    })

    return () => {
      cancelled = true
      window.clearTimeout(deadline)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }, [])

  const submit = async () => {
    if (isSending) return
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
      onClose()
    } catch (submitError) {
      console.error('Отметка не записалась', submitError)
      setError('Не удалось отметиться. Попробуйте ещё раз.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Drawer.Root open onOpenChange={(open) => { if (!open && !isSending) onClose() }}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-black/60" />
        <Drawer.Content className="fixed inset-0 z-50 flex flex-col bg-[#0b1220] outline-none">
          <Drawer.Title className="sr-only">Отметить {ACTION_LABEL[action].toLowerCase()}</Drawer.Title>
          <Drawer.Description className="sr-only">Снимок и геолокация в момент отметки</Drawer.Description>

          <div className="relative flex flex-1 items-center justify-center overflow-hidden">
            <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1.5 text-[12px] text-amber-300">
              {!geoChecked ? 'Определяем геолокацию…' : location || 'Геолокация недоступна'}
            </div>

            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 h-full w-full object-cover ${cameraReady ? '' : 'hidden'}`}
            />

            {/* Овал — подсказка кадрирования, не валидация: лицо никто не сверяет. */}
            <div className="pointer-events-none relative z-10 flex h-[62%] w-[72%] max-w-[320px] items-center justify-center rounded-[50%] border border-white/70 px-6 text-center">
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

            <button
              type="button"
              onClick={submit}
              disabled={isSending}
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

export function CheckInActions() {
  const { profile, session } = useAuth()
  const [action, setAction] = useState<MarkAction | null>(null)

  const employeeGuid =
    (typeof profile?.guid === 'string' && profile.guid) ||
    (typeof session?.user_data?.guid === 'string' && session.user_data.guid) ||
    (typeof session?.user?.guid === 'string' && session.user.guid) || ''

  // Тот же ключ, что и на /time — данные общие, лишнего запроса не будет.
  const { data: records = [] } = useQuery({
    queryKey: ['attendance', employeeGuid],
    queryFn: () => attendanceService.getByEmployee(employeeGuid),
    enabled: Boolean(employeeGuid),
    staleTime: 60_000,
  })

  // Обе кнопки всегда активны: приход мог пройти через турникет, а уход — из
  // дома. Вместо запрета показываем факт, чтобы не жали «на всякий случай».
  const today = useMemo(() => {
    const iso = buildMarkTimes(new Date()).date
    return (records as AttendanceRecord[]).find((record) => String(record.date || '').slice(0, 10) === iso)
  }, [records])

  return (
    <section className="animate-fade-in-up">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => setAction('IN')}
          className="flex items-center justify-center gap-2 rounded-[20px] bg-emerald-500 py-4 text-[15px] font-bold text-white shadow-sm transition-transform duration-150 active:scale-[0.97]"
        >
          <Icon icon="mdi:check-circle-outline" width={20} />
          Приход
        </button>
        <button
          type="button"
          onClick={() => setAction('OUT')}
          className="flex items-center justify-center gap-2 rounded-[20px] bg-amber-500 py-4 text-[15px] font-bold text-white shadow-sm transition-transform duration-150 active:scale-[0.97]"
        >
          <Icon icon="mdi:clock-outline" width={20} />
          Уход
        </button>
      </div>

      <p className="mt-2 mb-0 text-center text-[12px] text-[var(--text-muted)]">
        Сегодня: приход {showTime(today?.check_in_time)} · уход {showTime(today?.check_out_time)}
      </p>

      {action && <CameraSheet action={action} onClose={() => setAction(null)} />}
    </section>
  )
}
