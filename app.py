import streamlit as st
import pandas as pd
import os
import re
from PIL import Image
import pytesseract

# رقم الموبايل اللي هيستلم عليه التحويلات (إنستا باي / فودافون كاش)
TARGET_PHONE = "01225427767"

def normalize_digits(text):
    """يحول أي أرقام عربية لإنجليزية ويشيل أي حاجة مش رقم"""
    arabic_to_english = str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789")
    text = text.translate(arabic_to_english)
    return re.sub(r"\D", "", text)

def check_receipt_for_phone(image_file, target_phone):
    """يحاول يقرا الرقم من صورة الإيصال ويتأكد إنه موجود فيها"""
    try:
        image = Image.open(image_file)
        raw_text = pytesseract.image_to_string(image, lang="eng")
        digits_only = normalize_digits(raw_text)
        return target_phone in digits_only
    except Exception:
        return False

def is_valid_name(name):
    """لازم يكون اسم رباعي: كلمتين على الأقل، حروف بس (عربي أو إنجليزي)"""
    parts = name.strip().split()
    if len(parts) < 2:
        return False
    for part in parts:
        if not re.fullmatch(r"[A-Za-z\u0600-\u06FF]+", part):
            return False
    return True

def is_valid_phone(phone):
    """رقم موبايل مصري صحيح: 11 رقم ويبدأ بـ 010 أو 011 أو 012 أو 015"""
    digits = normalize_digits(phone)
    return bool(re.fullmatch(r"01[0125]\d{8}", digits))

# إعدادات الصفحة
st.set_page_config(page_title="حجز مقاعد أسرة الأنبا كراس", page_icon="🚌", layout="centered")

st.title("🚌 حجز رحلة أسرة الأنبا كراس")
st.markdown("---")

DB_FILE = "bookings.csv"

# التأكد من وجود ملف البيانات أو إنشائه
if not os.path.exists(DB_FILE):
    df_init = pd.DataFrame(columns=["الاسم رباعي", "رقم الموبايل", "رقم الكرسي"])
    df_init.to_csv(DB_FILE, index=False)

# تحميل البيانات الحالية
df_bookings = pd.read_csv(DB_FILE)
booked_seats = df_bookings["رقم الكرسي"].tolist()

# تهيئة حالة الجلسة (لازم قبل أي استخدام ليها)
if 'selected_seat' not in st.session_state:
    st.session_state['selected_seat'] = None
if 'form_counter' not in st.session_state:
    st.session_state['form_counter'] = 0

# إدخال بيانات المستخدم
st.subheader("📝 بيانات الحجز")
name = st.text_input("الاسم رباعي", key=f"name_{st.session_state['form_counter']}")
phone = st.text_input("رقم الموبايل", key=f"phone_{st.session_state['form_counter']}")

st.markdown("---")

# خريطة مقاعد الأتوبيس الاحترافية تماماً مثل تطبيقات الحجز
st.subheader("🚌 خريطة مقاعد الأتوبيس")
st.markdown("---")

# مقدمة الأتوبيس (السائق والباب)
col_f1, col_f2, col_f3 = st.columns([2, 2, 2])
with col_f1:
    st.markdown("🧑‍✈️ **[ السائق ]**")
with col_f3:
    st.info("🚪 باب الأتوبيس")

st.markdown("---")
st.info("🟢 مقعد متاح  |  🔴 مقعد محجوز")

total_seats = 49  # إجمالي عدد مقاعد الأتوبيس

# الصفوف العادية (من 1 إلى 44: كل صف 4 كراسي: كرسيين، ممر في النص، كرسيين)
for row in range(0, 44, 4):
    c1, c2, spacer, c3, c4 = st.columns([2, 2, 1, 2, 2])
    row_seats = [row + 1, row + 2, row + 3, row + 4]
    col_list = [c1, c2, c3, c4]
    
    for idx, seat_num in enumerate(row_seats):
        if seat_num <= total_seats:
            is_booked = seat_num in booked_seats
            btn_label = f"🔴 {seat_num}" if is_booked else f"🟢 {seat_num}"
            with col_list[idx]:
                if is_booked:
                    st.button(btn_label, disabled=True, key=f"seat_{seat_num}")
                else:
                    if st.button(btn_label, key=f"seat_{seat_num}"):
                        st.session_state['selected_seat'] = seat_num
                        st.success(f"تم اختيار المقعد: {seat_num}")

# الصف الأخير (من 45 إلى 49: 5 كراسي جنب بعض تماماً مثل الصورة)
st.write("---") 
last_row_cols = st.columns(5)
last_row_seats = [45, 46, 47, 48, 49]

for idx, seat_num in enumerate(last_row_seats):
    is_booked = seat_num in booked_seats
    btn_label = f"🔴 {seat_num}" if is_booked else f"🟢 {seat_num}"
    with last_row_cols[idx]:
        if is_booked:
            st.button(btn_label, disabled=True, key=f"seat_{seat_num}")
        else:
            if st.button(btn_label, key=f"seat_{seat_num}"):
                st.session_state['selected_seat'] = seat_num
                st.success(f"تم اختيار المقعد: {seat_num}")

st.markdown("---")
selected_seat = st.session_state.get('selected_seat')
if selected_seat:
    st.write(f"✅ المقعد المحدد حالياً للحجز: **{selected_seat}**")
else:
    st.warning("⚠️ برجاء اختيار مقعد من خريطة الأتوبيس بالأعلى.")

st.markdown("---")
st.info(f"💳 حوّل المبلغ على الرقم: **{TARGET_PHONE}** (إنستا باي أو فودافون كاش)، وبعدين ارفع صورة الإيصال هنا.")
uploaded_file = st.file_uploader(
    "رفع صورة إيصال التحويل (فودافون كاش / إنستا باي)",
    type=["png", "jpg", "jpeg"],
    key=f"uploader_{st.session_state['form_counter']}"
)

receipt_verified = False

if uploaded_file is not None:
    with st.spinner("جاري التحقق من الإيصال..."):
        receipt_verified = check_receipt_for_phone(uploaded_file, TARGET_PHONE)
    uploaded_file.seek(0)  # نرجع مؤشر الملف لأول حاجة عشان نقدر نستخدمه تاني

    if receipt_verified:
        st.success(f"✅ تم التحقق: الرقم {TARGET_PHONE} ظاهر في الإيصال.")
    else:
        st.error("❌ لم يتم العثور على الرقم بوضوح في الصورة. برجاء التأكد إن الصورة واضحة وغير مشخبط عليها، وصوّرها تاني وارفعها من جديد.")

st.markdown("---")

if st.button("تأكيد الحجز"):
    if not name or not phone:
        st.error("برجاء إدخال الاسم ورقم الموبايل.")
    elif not is_valid_name(name):
        st.error("برجاء إدخال اسم رباعي حقيقي (حروف فقط، كلمتين على الأقل).")
    elif not is_valid_phone(phone):
        st.error("برجاء إدخال رقم موبايل مصري صحيح (11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015).")
    elif selected_seat is None:
        st.error("برجاء اختيار مقعد من الأتوبيس أولاً.")
    elif uploaded_file is None:
        st.error("برجاء رفع صورة إيصال التحويل.")
    elif not receipt_verified:
        st.error("لم يتم التحقق من الإيصال. برجاء رفع صورة أوضح تظهر فيها رقم التحويل بشكل جيد.")
    else:
        # حفظ الحجز الجديد
        new_data = pd.DataFrame([[name, phone, selected_seat]], columns=["الاسم رباعي", "رقم الموبايل", "رقم الكرسي"])
        new_data.to_csv(DB_FILE, mode='a', header=False, index=False)
        st.success(f"تم حجز المقعد رقم {selected_seat} بنجاح! مبروك.")
        st.session_state['selected_seat'] = None
        st.session_state['form_counter'] += 1  # يصفّر الاسم والرقم والإيصال المرفوع
        st.rerun()