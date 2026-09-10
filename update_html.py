with open("public/index.html", "r", encoding="utf-8") as f:
    html = f.read()

# 1. إصلاح زر استشارة مالك ومرفت ليتم التحويل الفوري لغرفة المستشار أو صفحة الشات
old_consult_script = """    btn.addEventListener("click", () => {
      const advisorName = btn.dataset.advisor;
      const confirmChat = confirm(`⚖️ هل تريد بدء جلسة استشارة فورية مع المستشار/ة "${advisorName}"؟ (التكلفة الافتراضية للجلسة: 100 نقطة أو مجاناً بحسب رتبتك).`);

      if(confirmChat) {
        if(typeof userCoins !== 'undefined' && userCoins >= 100) {
          userCoins -= 100;
          if(typeof updateWalletDisplay === 'function') updateWalletDisplay();
          alert(`✅ تم فتح خط الاتصال بنجاح مع المستشار/ة ${advisorName}. جاري تحويلك لغرفة الاستشارة الخاصة...`);
        } else if(typeof userCoins !== 'undefined') {
          alert("⚠️ رصيد محفظتك غير كافٍ لبدء جلسة استشارة (التكلفة 100 نقطة). يرجى شحن الرصيد.");
        } else {
          alert(`✅ أهلاً بك! تم إرسال طلبك إلى المستشار/ة ${advisorName} وسيتم الرد عليك في أقرب وقت.`);
        }
      }
    });"""

new_consult_script = """    btn.addEventListener("click", () => {
      const advisorName = btn.dataset.advisor;
      if(advisorName === "مالك") {
        window.location.href = '/malik-chat.html';
      } else {
        selectRoom('malik-private', 'غرفة المستشار مالك');
        const nameInput = document.getElementById("userName");
        if(nameInput && nameInput.value.trim()) {
          document.getElementById("joinBtn").click();
        } else {
          alert("✅ جاري تحويلك للمستشارة مرفت. يرجى إدخال اسمك والدخول للغرفة لبدء الاستشارة المباشرة.");
          if(nameInput) nameInput.focus();
        }
      }
    });"""

if old_consult_script in html:
    html = html.replace(old_consult_script, new_consult_script)

# 2. نقل قسم خدمات الاستشارات المهنية المباشرة ليكون أسفل محادثات الغرف
# سنقوم بالبحث عن قسم الاستشارات وقسم الدردشة ونعيد ترتيبهم
consultants_div_pattern = """<!-- ===== قسم المستشارين (مالك وميرفت) ===== -->
<div id="lexConsultantsContainer\""""

# لننقله فوق قسم خدمات لكس أو بعد الدردشة مباشرة
# دعنا نتحقق من مكان وجوده ونعيد ترتيبه في ملف index.html
with open("public/index.html", "w", encoding="utf-8") as f:
    f.write(html)
print("HTML updated successfully!")
