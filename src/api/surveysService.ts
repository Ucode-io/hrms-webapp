import adminRequest from './adminRequest'

const REPORTS_FUNCTION_PATH = '/v2/invoke_function/udevs-hrms-reports'

export interface MySurvey {
  guid: string
  title: string
  completed: boolean
  completed_at: string | null
}

export interface SurveyForTaking {
  survey: {
    guid: string
    title: string
    body: string
  }
  already_completed: boolean
  completed_at: string | null
}

export interface SurveySubmitResult {
  guid: string
  surveys_id: string
  user_base_id: string
  completed_at: string | null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeInvokeResult = <T>(raw: unknown): T => {
  if (isRecord(raw) && 'result' in raw && raw.result != null) {
    return raw.result as T
  }
  return raw as T
}

const invokeReports = async <T>(method: string, data: Record<string, unknown>): Promise<T> => {
  const response = await adminRequest.post(REPORTS_FUNCTION_PATH, {
    data: { method, data },
  })
  return normalizeInvokeResult<T>(response)
}

export const parseSurveyBody = (body: unknown): Record<string, unknown> => {
  if (isRecord(body)) return body
  if (typeof body === 'string' && body.trim()) {
    try {
      const parsed: unknown = JSON.parse(body)
      if (isRecord(parsed)) return parsed
    } catch {
      // fallthrough
    }
  }
  return {}
}

export const surveysService = {
  getMySurveys: async (userBaseId: string): Promise<MySurvey[]> => {
    if (!userBaseId) return []

    const result = await invokeReports<{ surveys?: unknown[] }>('survey_my_list', {
      user_base_id: userBaseId,
    })

    const rawSurveys = Array.isArray(result?.surveys) ? result.surveys : []
    return rawSurveys.filter(isRecord).map((row) => ({
      guid: String(row.guid ?? ''),
      title: typeof row.title === 'string' ? row.title : '',
      completed: Boolean(row.completed),
      completed_at: typeof row.completed_at === 'string' ? row.completed_at : null,
    }))
  },

  getForTaking: async (userBaseId: string, surveysId: string): Promise<SurveyForTaking> => {
    const result = await invokeReports<Record<string, unknown>>('survey_take_get', {
      user_base_id: userBaseId,
      surveys_id: surveysId,
    })

    const survey = isRecord(result?.survey) ? result.survey : {}

    return {
      survey: {
        guid: String(survey.guid ?? ''),
        title: typeof survey.title === 'string' ? survey.title : '',
        body: typeof survey.body === 'string' ? survey.body : '',
      },
      already_completed: Boolean(result?.already_completed),
      completed_at: typeof result?.completed_at === 'string' ? result.completed_at : null,
    }
  },

  submit: async (
    userBaseId: string,
    surveysId: string,
    answers: Record<string, unknown>
  ): Promise<SurveySubmitResult> => {
    const result = await invokeReports<Record<string, unknown>>('survey_submit', {
      user_base_id: userBaseId,
      surveys_id: surveysId,
      answers,
    })

    return {
      guid: String(result?.guid ?? ''),
      surveys_id: String(result?.surveys_id ?? surveysId),
      user_base_id: String(result?.user_base_id ?? userBaseId),
      completed_at: typeof result?.completed_at === 'string' ? result.completed_at : null,
    }
  },
}
