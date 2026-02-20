export default () => ({
    port: parseInt(process.env.PORT || '3300', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    mongodb: {
        uri: process.env.MONGODB_URI || 'mongodb://localhost:27018/klive-ai',
    },

    qdrant: {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        collection: process.env.QDRANT_COLLECTION || 'klive_knowledge',
    },

    gemini: {
        apiKey: process.env.GEMINI_API_KEY || '',
        embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
        chatModel: process.env.GEMINI_CHAT_MODEL || 'gemini-2.5-flash',
    },

    auth: {
        apiKey: process.env.API_KEY || '',
    },

    cors: {
        allowedOrigins: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
    },

    upload: {
        dir: process.env.UPLOAD_DIR || './uploads',
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    },
});
