import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Icon } from '@iconify/react'
import type { MyTask } from '../../api/reportsService'
import { TaskCard } from './TaskCard'

/**
 * Канбан «по статусам» с перетаскиванием (dnd-kit).
 *
 * Телефон не вмещает колонки рядом, поэтому доска листается горизонтально со
 * снапом. Тащить карточку через весь горизонтальный скролл на телефоне
 * неудобно и ненадёжно (авто-скролл дерётся со снапом), поэтому при захвате
 * карточки снизу поднимается панель статусов: доска остаётся неподвижной, а
 * целью дропа служит пилюля нужного статуса. Бросить в саму видимую колонку
 * тоже можно — обе зоны ведут в один обработчик.
 */

export interface KanbanColumn {
  key: string
  title: string
  accent?: string
  icon?: string
  tasks: MyTask[]
  /** false — сюда бросать нельзя (колонка «без статуса»: task_move требует статус). */
  droppable: boolean
}

interface KanbanBoardProps {
  columns: KanbanColumn[]
  onOpenTask: (task: MyTask) => void
  /** Дроп в другую колонку. `columnKey` — statusId целевой колонки. */
  onMoveTask?: (task: MyTask, columnKey: string) => void
  moveDisabled?: boolean
  /** false — доска только для чтения (разрез «по срокам»: переносить задачу
   * между сроками нельзя, дедлайн меняют в карточке). */
  draggable?: boolean
  /** Показывать статус на карточке — нужно там, где колонка не про статус. */
  showCardStatus?: boolean
}

/** Отступ доски от края экрана — он же scroll-padding, чтобы активная колонка
 * вставала не впритык к краю, а с полем. */
const BOARD_PAD = 16

/** Ширина краевой зоны, в которой доска начинает листаться сама. */
const EDGE_ZONE = 64
/** Пикселей за кадр у самого края (у границы зоны — почти ноль). */
const EDGE_SPEED = 14

/**
 * Листание доски пальцем во время переноса.
 *
 * Встроенный авто-скролл dnd-kit дерётся с `scroll-snap`: он прокручивает
 * контейнер на доли колонки, снап тут же защёлкивает его обратно, и доска
 * дёргается под пальцем. Поэтому скроллим сами, а снап на время переноса
 * снимаем императивно — менять классы контейнера в React нельзя, это
 * пересчитывает раскладку прямо во время жеста.
 */
function useEdgeAutoScroll(scrollerRef: React.RefObject<HTMLDivElement | null>, active: boolean) {
  const pointerXRef = useRef(0)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!active || !scroller) return

    scroller.style.scrollSnapType = 'none'
    // 0 = «положение пальца ещё не известно»: до первого движения доска стоит,
    // иначе она поехала бы от координаты, оставшейся с прошлого переноса.
    pointerXRef.current = 0

    const track = (event: PointerEvent | MouseEvent | TouchEvent) => {
      const point = 'touches' in event ? event.touches[0] : event
      if (point) pointerXRef.current = point.clientX
    }
    window.addEventListener('pointermove', track, { passive: true })
    window.addEventListener('mousemove', track, { passive: true })
    window.addEventListener('touchmove', track, { passive: true })

    let frame = 0
    const step = () => {
      const rect = scroller.getBoundingClientRect()
      const x = pointerXRef.current
      let delta = 0
      if (x > 0) {
        // Скорость растёт по мере приближения к краю — у самой границы зоны
        // доска ползёт еле-еле, у экрана листается заметно.
        if (x < rect.left + EDGE_ZONE) {
          delta = -EDGE_SPEED * ((rect.left + EDGE_ZONE - x) / EDGE_ZONE)
        } else if (x > rect.right - EDGE_ZONE) {
          delta = EDGE_SPEED * ((x - (rect.right - EDGE_ZONE)) / EDGE_ZONE)
        }
      }
      if (delta !== 0) scroller.scrollLeft += delta
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', track)
      window.removeEventListener('touchmove', track)
      scroller.style.scrollSnapType = ''
    }
  }, [active, scrollerRef])
}

/* Одна и та же колонка — две droppable-зоны, поэтому id префиксуем. */
const COLUMN_PREFIX = 'col:'
const PILL_PREFIX = 'pill:'
const columnKeyFromDroppable = (id: string): string =>
  id.startsWith(COLUMN_PREFIX)
    ? id.slice(COLUMN_PREFIX.length)
    : id.startsWith(PILL_PREFIX)
      ? id.slice(PILL_PREFIX.length)
      : ''

function DraggableCard({
  task,
  disabled,
  showStatus,
  onOpen,
  suppressClickRef,
}: {
  task: MyTask
  disabled: boolean
  showStatus?: boolean
  onOpen: (task: MyTask) => void
  suppressClickRef: React.MutableRefObject<boolean>
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: task.id,
    data: { task },
    disabled,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      // Оригинал не скрываем, а гасим: исчезни он — колонка схлопнулась бы под
      // пальцем и доска «прыгнула» бы прямо во время переноса.
      className={isDragging ? 'opacity-25' : undefined}
    >
      <TaskCard
        task={task}
        plain
        showStatus={showStatus}
        onOpen={(t) => {
          if (suppressClickRef.current) return
          onOpen(t)
        }}
      />
    </div>
  )
}

/** Колонка доски. Одна и та же и для режима с переносом, и без него —
 * различие только в `dropRef`/подсветке, которые приходят снаружи. */
function BoardColumn({
  column,
  isOver,
  isDragActive,
  dropRef,
  children,
}: {
  column: KanbanColumn
  isOver?: boolean
  isDragActive?: boolean
  dropRef?: (element: HTMLElement | null) => void
  children: React.ReactNode
}) {
  const accent = column.accent || 'var(--accent)'

  return (
    <section
      ref={dropRef}
      className={`flex h-full w-[84%] shrink-0 snap-start flex-col overflow-hidden rounded-2xl transition-colors sm:w-[76%] ${
        isOver ? 'kanban-panel-over' : 'kanban-panel'
      }`}
    >
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-3">
        {column.icon ? (
          <span
            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg"
            style={{
              background: `color-mix(in srgb, ${accent} 14%, transparent)`,
              color: accent,
            }}
          >
            <Icon icon={column.icon} width={14} />
          </span>
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: accent }} />
        )}
        <p className="m-0 min-w-0 flex-1 truncate text-[13px] font-extrabold text-[var(--text-main)]">
          {column.title}
        </p>
        <span className="shrink-0 rounded-full bg-[var(--surface)]/80 px-2 py-0.5 text-[11px] font-bold text-[var(--text-secondary)]">
          {column.tasks.length}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
        {children}
        {column.tasks.length === 0 ? (
          <div
            className={`flex items-center justify-center rounded-xl border border-dashed px-3 py-6 transition-colors ${
              isOver ? 'border-[var(--accent)] bg-[var(--surface)]/70' : 'border-[var(--line)] bg-[var(--surface)]/40'
            }`}
          >
            <p className="m-0 flex items-center gap-1.5 text-center text-[12px] font-semibold text-[var(--text-muted)]">
              {isDragActive && column.droppable ? (
                <>
                  <Icon icon="mdi:tray-arrow-down" width={14} />
                  Отпустите здесь
                </>
              ) : (
                'Задач нет'
              )}
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}

function DroppableColumn({
  column,
  isDragActive,
  children,
}: {
  column: KanbanColumn
  isDragActive: boolean
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_PREFIX}${column.key}`,
    disabled: !column.droppable,
  })

  return (
    <BoardColumn
      column={column}
      isOver={isOver}
      isDragActive={isDragActive}
      dropRef={setNodeRef}
    >
      {children}
    </BoardColumn>
  )
}

/** Пилюля статуса в нижней панели — основная цель дропа на телефоне. */
function StatusDropPill({ column, current }: { column: KanbanColumn; current: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${PILL_PREFIX}${column.key}`,
    disabled: !column.droppable || current,
  })
  const accent = column.accent || 'var(--accent)'

  return (
    <div
      ref={setNodeRef}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 transition-all ${
        current ? 'opacity-45' : ''
      }`}
      style={{
        borderColor: isOver ? accent : 'var(--line)',
        background: isOver ? `color-mix(in srgb, ${accent} 16%, #fff)` : '#fff',
        transform: isOver ? 'scale(1.06)' : undefined,
      }}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent }} />
      <span className="whitespace-nowrap text-[12px] font-bold text-[var(--text-main)]">
        {column.title}
      </span>
      {current ? (
        <span className="text-[10.5px] font-semibold text-[var(--text-muted)]">сейчас</span>
      ) : null}
    </div>
  )
}

export function KanbanBoard({
  columns,
  onOpenTask,
  onMoveTask,
  moveDisabled,
  draggable = true,
  showCardStatus,
}: KanbanBoardProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const suppressClickRef = useRef(false)
  const [activeTask, setActiveTask] = useState<MyTask | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const sensors = useSensors(
    // Мышь (десктоп-превью): просто утащить дальше 6px.
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    // Палец: долгое нажатие. До активации жест остаётся обычным скроллом.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  )

  useEdgeAutoScroll(scrollerRef, Boolean(activeTask))

  /** Позиция скролла, при которой колонка встаёт с отступом BOARD_PAD. */
  const columnOffset = (el: HTMLDivElement, index: number): number => {
    const target = el.children[index] as HTMLElement | undefined
    if (!target) return 0
    return Math.max(0, target.offsetLeft - el.offsetLeft - BOARD_PAD)
  }

  const handleScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    // Активная колонка — чья позиция ближе всех к текущему скроллу.
    let best = 0
    let bestDist = Infinity
    Array.from(el.children).forEach((_, index) => {
      const dist = Math.abs(columnOffset(el, index) - el.scrollLeft)
      if (dist < bestDist) {
        bestDist = dist
        best = index
      }
    })
    setActiveIndex(best)
  }

  const scrollToColumn = (index: number) => {
    const el = scrollerRef.current
    if (!el) return
    el.scrollTo({ left: columnOffset(el, index), behavior: 'smooth' })
  }

  // Открываем доску на первой непустой колонке: у большинства сотрудников
  // «К выполнению» пуста, и стартовый экран встречал бы надписью «Задач нет».
  const initialisedRef = useRef(false)
  useEffect(() => {
    if (initialisedRef.current) return
    const el = scrollerRef.current
    if (!el || columns.length === 0) return
    initialisedRef.current = true
    const index = columns.findIndex((column) => column.tasks.length > 0)
    if (index <= 0) return
    // Индикатор колонок обновит сам обработчик scroll — отдельный setState тут
    // только вызвал бы лишний рендер.
    el.scrollLeft = columnOffset(el, index)
  }, [columns])

  const currentColumnKey = activeTask
    ? (columns.find((column) => column.tasks.some((t) => t.id === activeTask.id))?.key ?? '')
    : ''

  const handleDragStart = (event: DragStartEvent) => {
    const task = (event.active.data.current as { task?: MyTask } | undefined)?.task
    if (!task) return
    setActiveTask(task)
    suppressClickRef.current = true
    // Лёгкая отдача на подъём карточки (Android; iOS-webview молча игнорирует).
    if ('vibrate' in navigator) navigator.vibrate?.(12)
  }

  const endDrag = () => {
    setActiveTask(null)
    // Клик прилетает сразу после drop — отпускаем флаг на следующий тик.
    window.setTimeout(() => {
      suppressClickRef.current = false
    }, 80)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const task = activeTask
    const overId = event.over?.id
    endDrag()
    if (!task || typeof overId !== 'string') return
    const targetKey = columnKeyFromDroppable(overId)
    if (targetKey && targetKey !== currentColumnKey) onMoveTask?.(task, targetKey)
  }

  const board = (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        {/* Классы контейнера не зависят от состояния переноса: любая их смена
            на лету пересчитывает снап и дёргает доску. */}
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="scrollbar-hide -mx-4 flex min-h-0 flex-1 snap-x snap-mandatory scroll-pl-4 gap-2.5 overflow-x-auto px-4"
        >
          {columns.map((column) =>
            draggable ? (
              <DroppableColumn key={column.key} column={column} isDragActive={Boolean(activeTask)}>
                {column.tasks.map((task) => (
                  <DraggableCard
                    key={task.id}
                    task={task}
                    disabled={Boolean(moveDisabled)}
                    showStatus={showCardStatus}
                    onOpen={onOpenTask}
                    suppressClickRef={suppressClickRef}
                  />
                ))}
              </DroppableColumn>
            ) : (
              <BoardColumn key={column.key} column={column}>
                {column.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    showStatus={showCardStatus}
                    onOpen={onOpenTask}
                  />
                ))}
              </BoardColumn>
            ),
          )}
        </div>

        {columns.length > 1 ? (
          <div className="flex shrink-0 flex-col items-center gap-1 pt-0.5">
            <div className="flex items-center justify-center gap-1.5">
              {columns.map((column, index) => {
                const isCurrent = index === Math.min(activeIndex, columns.length - 1)
                return (
                  <button
                    key={column.key}
                    type="button"
                    onClick={() => scrollToColumn(index)}
                    aria-label={`Перейти к колонке «${column.title}»`}
                    className="cursor-pointer border-0 bg-transparent p-0.5"
                  >
                    <span
                      className={`block h-1.5 rounded-full transition-all ${
                        isCurrent ? 'w-5' : 'w-1.5'
                      }`}
                      style={{
                        background: isCurrent ? column.accent || 'var(--accent)' : 'var(--line)',
                      }}
                    />
                  </button>
                )
              })}
            </div>
            {draggable ? (
              <p className="m-0 text-[10.5px] font-medium text-[var(--text-muted)]">
                Удерживайте карточку, чтобы перенести её в другой статус
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
  )

  // Без переноса доска не нуждается в контексте dnd-kit — это просто колонки.
  if (!draggable) return board

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
      // Свой краевой скролл вместо встроенного: тот прокручивает контейнер
      // рывками и конфликтует со `scroll-snap` доски (см. useEdgeAutoScroll).
      autoScroll={false}
      // Пока доска листается под карточкой, границы колонок нужно
      // перемеривать — иначе дроп попадёт в ту колонку, что была на старте.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
    >
      {board}

      {/* Слой переноса — порталом в body: внутри доски он попал бы под
          `overflow` скроллера и обрезался бы по её краю. */}
      {createPortal(
        <>
          {activeTask ? (
            // Панель перекрывает таббар целиком: во время переноса он не нужен,
            // а полупрозрачная полоса поверх него читалась бы грязно.
            <div className="board-drag-layer fixed inset-x-0 bottom-0 z-[65] rounded-t-2xl bg-[var(--surface)] px-3 pb-[calc(16px+env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-8px_32px_rgba(12,26,46,0.20)]">
              <p className="m-0 px-1 pb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                Перенести в статус
              </p>
              <div className="scrollbar-hide flex gap-1.5 overflow-x-auto">
                {columns
                  .filter((column) => column.droppable)
                  .map((column) => (
                    <StatusDropPill
                      key={column.key}
                      column={column}
                      current={column.key === currentColumnKey}
                    />
                  ))}
              </div>
            </div>
          ) : null}

          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }} zIndex={80}>
            {activeTask ? (
              <div className="kanban-drag-overlay">
                <TaskCard task={activeTask} overlay />
              </div>
            ) : null}
          </DragOverlay>
        </>,
        document.body,
      )}
    </DndContext>
  )
}
