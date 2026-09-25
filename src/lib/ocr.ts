import Tesseract from 'tesseract.js'

export interface OcrResult {
  rawText: string
  targetPhoneFound: boolean
  ocrAmount: number | null
  ocrResult: string
  phoneVerificationStatus: 'found' | 'different' | 'not_found' | 'unclear'
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

function normalizePhone(text: string): string {
  let result = text
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(ARABIC_DIGITS[i], 'g'), ENGLISH_DIGITS[i])
  }
  return result.replace(/[\s\-()]/g, '')
}

function extractAmount(text: string): number | null {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

  // Instapay receipts: amount appears near the top, followed by "EGP"
  // Try lines from top first, looking for "X EGP" or "X.XX EGP"
  for (const line of lines.slice(0, 15)) {
    const m = line.match(/(\d+(?:\.\d{1,2})?)\s*EGP/i)
    if (m) {
      const val = parseFloat(m[1])
      if (!isNaN(val) && val > 0) return val
    }
  }

  // Try patterns with جنيه
  for (const line of lines.slice(0, 15)) {
    const m = line.match(/(\d+(?:\.\d{1,2})?)\s*جنيه/i)
    if (m) {
      const val = parseFloat(m[1])
      if (!isNaN(val) && val > 0) return val
    }
  }

  // Try "مبلغ" or "amount" patterns
  for (const line of lines) {
    const m = line.match(/(?:مبلغ|amount|value|قيمة|transfer|تحويل)\s*[:\s]*(\d+(?:\.\d{1,2})?)/i)
    if (m) {
      const val = parseFloat(m[1])
      if (!isNaN(val) && val > 0) return val
    }
  }

  // Fallback: look for a 2-3 digit number near EGP anywhere
  const patterns = [
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

function extractAllPhoneNumbers(text: string): string[] {
  const normalized = normalizePhone(text)
  const phones: string[] = []
  const matches = normalized.match(/\d{10,13}/g)
  if (matches) {
    for (const m of matches) {
      let phone = m
      if (phone.startsWith('20') && phone.length === 13) {
        phone = '0' + phone.slice(2)
      }
      if (phone.startsWith('0020')) {
        phone = phone.slice(3)
      }
      phones.push(phone)
    }
  }
  return phones
}

function checkToField(text: string, targetPhone: string): boolean {
  const lines = text.split('\n').map((l) => l.trim())
  const targetClean = normalizePhone(targetPhone)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^(to|إلى|الي|مستلم|المستلم|receiver|مستقبل)\s*[:.]?\s*/i.test(line)) {
      const normalized = normalizePhone(line)
      if (normalized.includes(targetClean)) return true
    }
    // Also check line after "To" label
    if (/^(to|إلى|الي|مستلم|المستلم|receiver|مستقبل)\s*[:.]?\s*$/i.test(line) && i + 1 < lines.length) {
      const normalized = normalizePhone(lines[i + 1])
      if (normalized.includes(targetClean)) return true
    }
  }
  return false
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
    const targetPhoneClean = normalizePhone(targetPhone)

    if (!rawText.trim()) {
      return {
        rawText,
        targetPhoneFound: false,
        ocrAmount: null,
        ocrResult: 'لا يمكن قراءة الإيصال بوضوح',
        phoneVerificationStatus: 'unclear',
      }
    }

    const foundPhones = extractAllPhoneNumbers(rawText)
    const targetFound = foundPhones.some((p) => p === targetPhoneClean)
    const toFieldMatch = checkToField(rawText, targetPhone)
    const targetConfirmed = targetFound || toFieldMatch

    const otherPhonesFound = foundPhones.filter((p) => p !== targetPhoneClean && p.length >= 10)

    const ocrAmount = extractAmount(rawText)

    let phoneVerificationStatus: 'found' | 'different' | 'not_found' | 'unclear'
    let ocrResult: string

    if (targetConfirmed) {
      phoneVerificationStatus = 'found'
      if (ocrAmount !== null) {
        ocrResult = 'رقم التحويل موجود + المبلغ المقروء: ' + ocrAmount + ' جنيه'
      } else {
        ocrResult = 'رقم التحويل موجود + لم يتم قراءة المبلغ'
      }
    } else if (otherPhonesFound.length > 0) {
      phoneVerificationStatus = 'different'
      ocrResult = 'رقم التحويل غير موجود - تم العثور على رقم آخر مختلف'
    } else if (foundPhones.length === 0 && rawText.replace(/\s/g, '').length < 20) {
      phoneVerificationStatus = 'unclear'
      ocrResult = 'لا يمكن قراءة الإيصال بوضوح'
    } else {
      phoneVerificationStatus = 'not_found'
      ocrResult = 'رقم التحويل غير موجود في الإيصال'
    }

    return { rawText, targetPhoneFound: targetConfirmed, ocrAmount, ocrResult, phoneVerificationStatus }
  } catch {
    return {
      rawText: '',
      targetPhoneFound: false,
      ocrAmount: null,
      ocrResult: 'لا يمكن قراءة الإيصال بوضوح',
      phoneVerificationStatus: 'unclear',
    }
  }
}
