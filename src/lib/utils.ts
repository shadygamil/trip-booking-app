export function formatCurrency(amount: number): string {
  return `${amount.toLocaleString('ar-EG')} جنيه`
}

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('ar-EG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export function isValidName(name: string): boolean {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 4) return false
  for (const part of parts) {
    if (!/^[\u0600-\u06FFa-zA-Z]+$/.test(part)) return false
  }
  return true
}

export function isValidPhone(phone: string): boolean {
  const digits = normalizeDigits(phone)
  return /^01[0125]\d{8}$/.test(digits)
}

export function normalizeDigits(text: string): string {
  const arabicToEnglish = '٠١٢٣٤٥٦٧٨٩'
  let result = text
  for (let i = 0; i < 10; i++) {
    result = result.replace(new RegExp(arabicToEnglish[i], 'g'), String(i))
  }
  return result.replace(/\D/g, '')
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csvLines: string[] = [
    '\uFEFF' + headers.join(','),
    ...rows.map((row) =>
      headers.map((h) => {
        const val = row[h]
        const str = val === null || val === undefined ? '' : String(val)
        return `"${str.replace(/"/g, '""')}"`
      }).join(',')
    ),
  ]
  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8-sig;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
