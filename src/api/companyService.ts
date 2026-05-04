import axios from 'axios'

const COMPANY_API_URL =
  'https://api.admin.u-code.io/v2/items/companies/0de6b2b6-0777-4184-a620-aca70c294111'
const PROJECT_ID = 'f90c520f-eb6a-496c-9fa0-c38095d4793b'
const API_KEY = 'P-JtJ1lICCMHmhp9JaoxhWh1ZAwoyzFtxw'

export interface CompanyBrand {
  name: string
  logo: string
  mainColor: string
  companyCover: string
}

interface CompanyApiResponse {
  data?: {
    data?: {
      response?: {
        name?: string
        logo?: string
        main_color?: string
        company_cover?: string
      }
    }
  }
}

export const defaultCompanyBrand: CompanyBrand = {
  name: 'UDEVS',
  logo: '',
  mainColor: '#2980B9',
  companyCover: '',
}

export const getCompanyBrand = async (): Promise<CompanyBrand> => {
  const response = await axios.get<CompanyApiResponse>(COMPANY_API_URL, {
    params: { 'project-id': PROJECT_ID },
    headers: {
      Authorization: 'API-KEY',
      'x-api-key': API_KEY,
    },
  })

  const company = response.data?.data?.data?.response

  if (!company) {
    return defaultCompanyBrand
  }

  return {
    name: company.name || defaultCompanyBrand.name,
    logo: company.logo || defaultCompanyBrand.logo,
    mainColor: company.main_color || defaultCompanyBrand.mainColor,
    companyCover: company.company_cover || defaultCompanyBrand.companyCover,
  }
}
