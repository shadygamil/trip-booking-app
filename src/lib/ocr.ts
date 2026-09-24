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

function extractAllPhoneNumbers(text: string): string[] {
  const normalized = normalizePhone(text)
  const phones: string[] = []
  // Match sequences of 10-13 digits (Egyptian phone numbers with/without country code)
  const matches = normalized.match(/\d{10,13}/g)
  if (matches) {
    for (const m of matches) {
      // Normalize: strip leading country code 20 if present
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

    // Extract all phone-like numbers from the receipt
    const foundPhones = extractAllPhoneNumbers(rawText)

    // Check if the target phone is present
    const targetFound = foundPhones.some((p) => p === targetPhoneClean)

    // Check if any other phone number is present (but not the target)
    const otherPhonesFound = foundPhones.filter((p) => p !== targetPhoneClean && p.length >= 10)

    const ocrAmount = extractAmount(rawText)

    let phoneVerificationStatus: 'found' | 'different' | 'not_found' | 'unclear'
    let ocrResult: string

    if (targetFound) {
      phoneVerificationStatus = 'found'
      if (ocrAmount !== null) {
        ocrResult = 'رقم التحويل موجود + المبلغ المقروء: ' + ocrAmount + ' جنيه'
      } else {
        ocrResult = 'رقم التحويل موجود + لم يتم قراءة المبلغ'
      }
    } else if (otherPhonesFound.length > 0) {
      // Found phone numbers but none match the target
      phoneVerificationStatus = 'different'
      ocrResult = 'رقم التحويل غير موجود - تم العثور على رقم آخر مختلف'
    } else if (foundPhones.length === 0 && rawText.replace(/\s/g, '').length < 20) {
      // Very little text extracted — unclear
      phoneVerificationStatus = 'unclear'
      ocrResult = 'لا يمكن قراءة الإيصال بوضوح'
    } else {
      // No phone numbers found at all in the text
      phoneVerificationStatus = 'not_found'
      ocrResult = 'رقم التحويل غير موجود في الإيصال'
    }

    return { rawText, targetPhoneFound: targetFound, ocrAmount, ocrResult, phoneVerificationStatus }
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
