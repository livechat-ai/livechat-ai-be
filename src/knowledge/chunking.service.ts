import { Injectable, Logger } from '@nestjs/common';

/** [js-hoist-regexp] Hoisted regex patterns — compiled once at module load */
const MULTI_NEWLINE_REGEX = /\n{3,}/g;
const TITLE_REGEX = /^[A-Z\u00C0-\u024F].{0,50}$/m;
const LIST_REGEX = /^\d+\./m;

export interface ChunkResult {
    content: string;
    chunkIndex: number;
    chunkType: string;
}

@Injectable()
export class ChunkingService {
    private readonly logger = new Logger(ChunkingService.name);

    /**
     * Chia nhỏ text thành các chunks.
     * Sử dụng character-based splitting với overlap.
     */
    chunk(text: string, options?: { chunkSize?: number; overlap?: number }): ChunkResult[] {
        const chunkSize = options?.chunkSize || 500;          // ~500 ký tự mỗi chunk
        const overlap = options?.overlap || Math.floor(chunkSize * 0.2); // 20% overlap

        // [js-hoist-regexp] Dùng hoisted regex constant
        const cleanedText = text.replace(MULTI_NEWLINE_REGEX, '\n\n').trim();

        if (cleanedText.length <= chunkSize) {
            return [{ content: cleanedText, chunkIndex: 0, chunkType: 'paragraph' }];
        }

        const chunks: ChunkResult[] = [];
        let start = 0;
        let chunkIndex = 0;

        while (start < cleanedText.length) {
            let end = start + chunkSize;

            // Tìm điểm cắt tự nhiên (cuối câu, cuối đoạn)
            if (end < cleanedText.length) {
                const naturalBreak = this.findNaturalBreak(cleanedText, start, end);
                if (naturalBreak > start) {
                    end = naturalBreak;
                }
            } else {
                end = cleanedText.length;
            }

            const content = cleanedText.slice(start, end).trim();

            if (content.length > 0) {
                chunks.push({
                    content,
                    chunkIndex,
                    chunkType: this.detectChunkType(content),
                });
                chunkIndex++;
            }

            // Di chuyển start, trừ overlap
            start = end - overlap;

            // Đảm bảo tiến bộ (tránh vòng lặp vô hạn)
            if (start <= (chunks.length > 0 ? end - chunkSize : 0)) {
                start = end;
            }
        }

        this.logger.debug(`Chunked text: ${cleanedText.length} chars → ${chunks.length} chunks`);

        return chunks;
    }

    /** Tìm điểm cắt tự nhiên gần vị trí end */
    private findNaturalBreak(text: string, start: number, end: number): number {
        // Ưu tiên: cuối đoạn > cuối câu > khoảng trắng
        const searchRange = text.slice(start, end);

        // Tìm dấu xuống dòng kép (cuối đoạn) gần nhất
        const paragraphBreak = searchRange.lastIndexOf('\n\n');
        if (paragraphBreak > searchRange.length * 0.5) {
            return start + paragraphBreak + 2;
        }

        // Tìm dấu chấm câu gần nhất
        const sentenceBreaks = ['. ', '.\n', '! ', '!\n', '? ', '?\n'];
        let bestBreak = -1;

        for (const br of sentenceBreaks) {
            const idx = searchRange.lastIndexOf(br);
            if (idx > bestBreak && idx > searchRange.length * 0.3) {
                bestBreak = idx;
            }
        }

        if (bestBreak > 0) {
            return start + bestBreak + 2;
        }

        // Fallback: tìm khoảng trắng gần nhất
        const spaceBreak = searchRange.lastIndexOf(' ');
        if (spaceBreak > searchRange.length * 0.5) {
            return start + spaceBreak + 1;
        }

        return end;
    }

    /** Phát hiện loại chunk (đơn giản) — [js-hoist-regexp] dùng hoisted regex */
    private detectChunkType(content: string): string {
        if (content.startsWith('#') || TITLE_REGEX.test(content)) {
            return 'title';
        }
        if (content.includes('- ') || content.includes('• ') || LIST_REGEX.test(content)) {
            return 'list';
        }
        if (content.includes('```') || content.includes('  ')) {
            return 'code';
        }
        return 'paragraph';
    }
}
