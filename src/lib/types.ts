export interface AppSettings {
  id: number
  trip_name: string
  total_price: number
  min_first_payment: number
  transfer_phone: string
  updated_at: string
}

export interface Seat {
  seat_number: number
  is_active: boolean
  created_at: string
}

export interface Booking {
  id: string
  booking_code: string
  full_name: string
  phone: string
  seat_number: number
  total_price: number
  booking_status: string
  created_at: string
  updated_at: string
}

export interface Payment {
  id: string
  booking_id: string
  payment_number: number
  entered_amount: number
  verified_amount: number | null
  verification_status: string
  target_phone: string | null
  target_phone_found: boolean
  ocr_amount: number | null
  ocr_result: string | null
  receipt_image_path: string
  created_at: string
  reviewed_at: string | null
  reviewed_by: string | null
}

export interface BookingSummary {
  id: string
  booking_code: string
  full_name: string
  phone: string
  seat_number: number
  total_price: number
  booking_status: string
  created_at: string
  total_paid: number
  remaining_amount: number
  payment_status: string
}

export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'needs_review'

export const STATUS_LABELS: Record<string, string> = {
  pending: 'في انتظار المراجعة',
  verified: 'تم التحقق',
  rejected: 'مرفوض',
  needs_review: 'يحتاج مراجعة',
}

export const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-warning-100 text-warning-600 border-warning-500',
  verified: 'bg-success-100 text-success-700 border-success-500',
  rejected: 'bg-error-100 text-error-700 border-error-500',
  needs_review: 'bg-accent-100 text-accent-700 border-accent-500',
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  'غير مدفوع': 'غير مدفوع',
  'دفع جزئي': 'دفع جزئي',
  'مكتمل الدفع': 'مكتمل الدفع',
}
