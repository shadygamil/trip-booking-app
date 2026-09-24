import Tesseract from 'tesseract.js'

export interface OcrResult {
  rawText: string
  targetPhoneFound: boolean
  ocrAmount: number | null
  ocrResult: string
}

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const ENGLISH_DIGITS = '0123456789'

function normalizeDigits(text: string): string {
  let result = text
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(ARABIC_DIGITS[i], 'g'), ENGLISH_DIGITS[i])
  }
  return result.replace(/[^\d]/g, '')
}

function extractAmount(text: string): number | null {
  // Look for patterns like "250.00" or "250" near currency indicators
  const patterns = [
    /(\d+(?:\.\d{1,2})?)\s*(?:جنيه|egp|ج\.م)/i,
    /(?:مبلغ|amount|value|قيمة|transfer|تحويل)\s*[:\s]*(\d+(?:\.\d{1,2})?)/i,
    /(\d{2,3}(?:\.\d{1,2})?)\s*(?:egp|جنيه)/i,
  /(\d{2,3}(?:\.\d{1,2})?)/,
  /(\d+(?:\.\d{1,2})?)/,
  ]

  for (const p of patterns) {
    const m = text.match(p)
    if (m) {
      const val = parseFloat(m[1])
      if (!isNaN(val) && val > 0) return val
    }
  }
  return null
}

export async function processReceiptOcr(
  imageFile: File,
  targetPhone: string
): Promise<OcrResult> {
  try {
    const { data } = await Tesseract.recognize(imageFile, 'eng+ara', {
      logger: () => {},
    })

    const rawText = data.text || ''
    const normalizedPhone = normalizeDigits(rawText)
    const targetPhoneClean = normalizeDigits(targetPhone)
    const targetPhoneFound = normalizedPhone.includes(targetPhoneClean)

    const ocrAmount = extractAmount(rawText)

    let ocrResult: string
    if (!rawText.trim()) {
      ocrResult = 'لا يمكن قراءة الإيصال بوضوح'
    } else if (targetPhoneFound && ocrAmount !== null) {
      ocrResult = 'رقم التحويل موجود + تم قراءة المبلغ'
    } else if (targetPhoneFound) {
      ocrResult = 'رقم التحويل موجود + لم يتم قراءة المبلغ'
    } else {
      ocrResult = 'رقم التحويل غير موجود'
    }

    return { rawText, targetPhoneFound, ocrAmount, ocrResult }
  } catch {
    return {
      rawText: '',
      targetPhoneFound: false,
      ocrAmount: null,
      ocrResult: 'لا يمكن قراءة الإيصال بوضوح',
    }
  }
}
