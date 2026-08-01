/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_XAI_API_KEY: string;
    readonly VITE_ASSEMBLYAI_API_KEY: string;
    readonly VITE_CLOUDINARY_CLOUD_NAME: string;
    readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
    readonly VITE_OPENAI_API_KEY: string;
    readonly VITE_AWS_S3_REGION: string;
    readonly VITE_AWS_S3_BUCKET_NAME: string;
    readonly VITE_AWS_S3_ACCESS_KEY_ID: string;
    readonly VITE_AWS_S3_SECRET_ACCESS_KEY: string;
    readonly VITE_OPENROUTER_API_KEY: string;
    readonly VITE_OPENROUTER_MODEL: string;
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_GEMINI_MODEL: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
