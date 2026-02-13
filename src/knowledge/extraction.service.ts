import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse');
import * as mammoth from 'mammoth';
import * as fs from 'fs';

@Injectable()
export class ExtractionService {
    private readonly logger = new Logger(ExtractionService.name);

    /** Trích xuất text từ file theo loại */
    async extractText(filePath: string, fileType: string): Promise<string> {
        switch (fileType) {
            case 'pdf':
                return this.extractFromPdf(filePath);
            case 'docx':
                return this.extractFromDocx(filePath);
            case 'text':
            case 'txt':
                return this.extractFromText(filePath);
            default:
                throw new Error(`Không hỗ trợ loại file: ${fileType}`);
        }
    }

    private async extractFromPdf(filePath: string): Promise<string> {
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        this.logger.debug(`PDF extracted: ${data.numpages} pages, ${data.text.length} chars`);
        return data.text;
    }

    private async extractFromDocx(filePath: string): Promise<string> {
        const buffer = fs.readFileSync(filePath);
        const result = await mammoth.extractRawText({ buffer });
        this.logger.debug(`DOCX extracted: ${result.value.length} chars`);
        return result.value;
    }

    private async extractFromText(filePath: string): Promise<string> {
        return fs.readFileSync(filePath, 'utf-8');
    }
}
