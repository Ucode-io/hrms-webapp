import adminRequest from './adminRequest'

const REPORTS_FUNCTION_PATH = '/v2/invoke_function/udevs-hrms-reports'

export type TrainingSubmissionStatus = 'submitted' | 'accepted' | 'rejected'

export interface MyTraining {
  guid: string
  title: string
  description: string
  starts_at: string | null
  ends_at: string | null
  homework_required: boolean
  homework_deadline: string | null
  location: string
  trainer_name: string
  materials_count: number
  submission_status: TrainingSubmissionStatus | null
  submitted_at: string | null
}

export interface TrainingMaterial {
  guid: string
  title: string
  material_type: 'file' | 'link' | 'video'
  url: string
  file_name: string
  file_size: number | null
  sort_order: number
}

export interface MyTrainingSubmission {
  guid: string
  file_url: string
  file_name: string
  file_size: number | null
  comment: string
  status: TrainingSubmissionStatus
  review_comment: string
  submitted_at: string | null
  reviewed_at: string | null
}

export interface TrainingForTaking {
  training: {
    guid: string
    title: string
    description: string
    starts_at: string | null
    ends_at: string | null
    homework_required: boolean
    homework_deadline: string | null
    location: string
    trainer_name: string
  }
  materials: TrainingMaterial[]
  submission: MyTrainingSubmission | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeInvokeResult = <T,>(raw: unknown): T => {
  if (isRecord(raw) && 'result' in raw && raw.result != null) {
    return raw.result as T
  }
  return raw as T
}

const invokeReports = async <T,>(method: string, data: Record<string, unknown>): Promise<T> => {
  const response = await adminRequest.post(REPORTS_FUNCTION_PATH, {
    data: { method, data },
  })
  return normalizeInvokeResult<T>(response)
}

const asString = (value: unknown): string => (typeof value === 'string' ? value : '')
const asNullableString = (value: unknown): string | null =>
  typeof value === 'string' && value ? value : null

const SUBMISSION_STATUSES: TrainingSubmissionStatus[] = ['submitted', 'accepted', 'rejected']

const normalizeSubmissionStatus = (value: unknown): TrainingSubmissionStatus | null => {
  const raw = Array.isArray(value) ? String(value[0] ?? '') : asString(value)
  return SUBMISSION_STATUSES.includes(raw as TrainingSubmissionStatus)
    ? (raw as TrainingSubmissionStatus)
    : null
}

const normalizeMaterial = (row: Record<string, unknown>, index: number): TrainingMaterial => ({
  guid: asString(row.guid),
  title: asString(row.title),
  material_type: (['file', 'link', 'video'].includes(asString(row.material_type))
    ? asString(row.material_type)
    : 'file') as TrainingMaterial['material_type'],
  url: asString(row.url),
  file_name: asString(row.file_name),
  file_size: typeof row.file_size === 'number' ? row.file_size : null,
  sort_order: typeof row.sort_order === 'number' ? row.sort_order : index,
})

const normalizeSubmission = (raw: unknown): MyTrainingSubmission | null => {
  if (!isRecord(raw) || !raw.guid) return null
  return {
    guid: asString(raw.guid),
    file_url: asString(raw.file_url),
    file_name: asString(raw.file_name),
    file_size: typeof raw.file_size === 'number' ? raw.file_size : null,
    comment: asString(raw.comment),
    status: normalizeSubmissionStatus(raw.status) || 'submitted',
    review_comment: asString(raw.review_comment),
    submitted_at: asNullableString(raw.submitted_at),
    reviewed_at: asNullableString(raw.reviewed_at),
  }
}

export const trainingsService = {
  getMyTrainings: async (userBaseId: string): Promise<MyTraining[]> => {
    if (!userBaseId) return []

    const result = await invokeReports<{ trainings?: unknown[] }>('training_my_list', {
      user_base_id: userBaseId,
    })

    const rawTrainings = Array.isArray(result?.trainings) ? result.trainings : []
    return rawTrainings.filter(isRecord).map((row) => ({
      guid: asString(row.guid),
      title: asString(row.title),
      description: asString(row.description),
      starts_at: asNullableString(row.starts_at),
      ends_at: asNullableString(row.ends_at),
      homework_required: Boolean(row.homework_required),
      homework_deadline: asNullableString(row.homework_deadline),
      location: asString(row.location),
      trainer_name: asString(row.trainer_name),
      materials_count: typeof row.materials_count === 'number' ? row.materials_count : 0,
      submission_status: normalizeSubmissionStatus(row.submission_status),
      submitted_at: asNullableString(row.submitted_at),
    }))
  },

  getForTaking: async (userBaseId: string, trainingsId: string): Promise<TrainingForTaking> => {
    const result = await invokeReports<Record<string, unknown>>('training_take_get', {
      user_base_id: userBaseId,
      trainings_id: trainingsId,
    })

    const training = isRecord(result?.training) ? result.training : {}
    const rawMaterials = Array.isArray(result?.materials) ? result.materials : []

    return {
      training: {
        guid: asString(training.guid),
        title: asString(training.title),
        description: asString(training.description),
        starts_at: asNullableString(training.starts_at),
        ends_at: asNullableString(training.ends_at),
        homework_required: Boolean(training.homework_required),
        homework_deadline: asNullableString(training.homework_deadline),
        location: asString(training.location),
        trainer_name: asString(training.trainer_name),
      },
      materials: rawMaterials.filter(isRecord).map(normalizeMaterial),
      submission: normalizeSubmission(result?.submission),
    }
  },

  submitHomework: async (
    userBaseId: string,
    trainingsId: string,
    payload: { file_url: string; file_name?: string; file_size?: number; comment?: string }
  ): Promise<{ guid: string; status: string; submitted_at: string | null }> => {
    const result = await invokeReports<Record<string, unknown>>('training_submit_homework', {
      user_base_id: userBaseId,
      trainings_id: trainingsId,
      ...payload,
    })

    return {
      guid: asString(result?.guid),
      status: asString(result?.status) || 'submitted',
      submitted_at: asNullableString(result?.submitted_at),
    }
  },
}
