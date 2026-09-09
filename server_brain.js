/**
 * 🧠 عقل الاستشاري القانوني المركزي - منصة لكس | LIVE
 * Central Legal Intelligence & Consultant Core for Malik & Mervat
 */

class LexLegalCentralBrain {
    constructor() {
        this.activeSessions = new Map();
        this.consultants = {
            malik: {
                name: "المستشار مالك الهلباوي",
                specialty: "قضايا تجارية، عقود، وتأسيس الشركات",
                status: "available",
                tier: "Senior Counsel"
            },
            mervat: {
                name: "المستشارة مرفت الهلباوي",
                specialty: "استشارات قانونية، مراجعة مستندات، وتقاضي مدني",
                status: "available",
                tier: "Senior Legal Consultant"
            }
        };
    }

    // 1️⃣ فهم وتحليل طلب المستخدم القانوني
    parseRequest(userMessage, context = {}) {
        if (!userMessage || typeof userMessage !== 'string') {
            return { valid: false, error: "الرسالة فارغة أو غير صالحة." };
        }

        const text = userMessage.trim();
        const intent = this.detectIntent(text);
        
        return {
            valid: true,
            intent,
            text,
            timestamp: new Date().toISOString(),
            requiresDocumentReview: text.includes("عقد") || text.includes("مستند") || text.includes("اتفاقية"),
            urgency: text.includes("عاجل") || text.includes("فوري") ? "high" : "normal"
        };
    }

    detectIntent(text) {
        if (text.includes("استشارة") || text.includes("اسأل")) return "CONSULTATION";
        if (text.includes("عقد") || text.includes("مراجعة")) return "DOCUMENT_REVIEW";
        if (text.includes("سعر") || text.includes("تكلفة")) return "PRICING_INQUIRY";
        return "GENERAL_LEGAL_INQUIRY";
    }

    // 3️⃣ محرك اتخاذ القرار والتحقق
    evaluateConsultationRequest(user, consultantKey, userCoins) {
        const consultant = this.consultants[consultantKey];
        if (!consultant) {
            return { success: false, message: "المستشار غير موجود في النظام." };
        }

        if (consultant.status !== "available") {
            return { success: false, message: `عذراً، ${consultant.name} مشغول حالياً في جلسة أخرى.` };
        }

        const cost = 100; // تكلفة الاستشارة الافتراضية
        if (userCoins < cost) {
            return { 
                success: false, 
                code: "INSUFFICIENT_FUNDS",
                message: `⚠️ رصيد محفظتك غير كافٍ. التكلفة المطلوبة لجلسة مع ${consultant.name} هي ${cost} نقطة.` 
            };
        }

        return {
            success: true,
            consultant: consultant.name,
            cost,
            disclaimer: "📌 تنبيه قانوني: هذه الاستشارة هي رأي توجيهي مهني ولا تغني عن التوكيل الرسمي أمام الجهات القضائية."
        };
    }

    // 13️⃣ & 14️⃣ الالتزام المهني وتحليل المستندات
    processLegalDocument(documentText) {
        if (!documentText) return null;
        
        // محاكاة الفحص الدلالي للثغرات القانونية
        const risks = [];
        if (!documentText.includes("مدة")) risks.includes("البند الزمني غير واضح");
        if (!documentText.includes("شرط جزائي")) risks.includes("خلو العقد من شرط جزائي يحمي حقوق الطرفين");

        return {
            analyzed: true,
            riskLevel: risks.length > 0 ? "Medium" : "Low",
            detectedRisks: risks,
            recommendation: "يوصى بمراجعة البنود أعلاه بدقة مع المستشار المختص قبل التوقيع النهائي."
        };
    }
}

module.exports = LexLegalCentralBrain;
