import { Injectable } from '@nestjs/common';

export interface IntentResult {
    isEscalationRequest: boolean;
    category: 'pricing' | 'technical' | 'general' | 'escalation';
    confidence: number;
}

/**
 * Từ khóa tiếng Việt cho Intent Detection (Phase 1: keyword-based)
 * [js-set-map-lookups] Dùng Set thay vì Array cho O(1) lookups
 */
const ESCALATION_KEYWORDS = new Set([
    'người', 'nhân viên', 'hỗ trợ', 'human', 'agent',
    'tư vấn viên', 'chuyên viên', 'nói chuyện với người',
    'gặp nhân viên', 'kết nối nhân viên', 'chuyển cho',
]);

const PRICING_KEYWORDS = new Set([
    'giá', 'bao nhiêu', 'price', 'cost', 'phí',
    'gói', 'package', 'thanh toán', 'payment', 'chi phí',
    'báo giá', 'bảng giá', 'khuyến mãi', 'giảm giá',
]);

const TECHNICAL_KEYWORDS = new Set([
    'lỗi', 'bug', 'error', 'không hoạt động', 'hỏng',
    'cài đặt', 'setup', 'cấu hình', 'config', 'kết nối',
    'không được', 'bị lỗi', 'trục trặc', 'sự cố',
    'hướng dẫn', 'cách dùng', 'cách sử dụng',
]);

@Injectable()
export class IntentService {
    /** Phát hiện ý định từ tin nhắn (Phase 1: keyword matching) */
    detectIntent(message: string): IntentResult {
        const normalizedMessage = message.toLowerCase().trim();

        // [js-early-exit] Kiểm tra escalation trước, return sớm
        if (this.matchesAny(normalizedMessage, ESCALATION_KEYWORDS)) {
            return { isEscalationRequest: true, category: 'escalation', confidence: 0.9 };
        }

        if (this.matchesAny(normalizedMessage, PRICING_KEYWORDS)) {
            return { isEscalationRequest: false, category: 'pricing', confidence: 0.8 };
        }

        if (this.matchesAny(normalizedMessage, TECHNICAL_KEYWORDS)) {
            return { isEscalationRequest: false, category: 'technical', confidence: 0.8 };
        }

        return { isEscalationRequest: false, category: 'general', confidence: 0.5 };
    }

    /** [js-set-map-lookups] Set.has() = O(1) per keyword */
    private matchesAny(text: string, keywordSet: Set<string>): boolean {
        for (const keyword of keywordSet) {
            if (text.includes(keyword)) return true; // [js-early-exit]
        }
        return false;
    }
}
