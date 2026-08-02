/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_XAI_API_KEY: string;
    readonly VITE_ASSEMBLYAI_API_KEY: string;
    readonly VITE_CLOUDINARY_CLOUD_NAME: string;
    readonly VITE_CLOUDINARY_UPLOAD_PRESET: string;
    readonly VITE_OPENAI_API_KEY: string;
    readonly VITE_AWS_S3_REGION: string;
    readonly VITE_AWS_S3_BUCKET_NAME: string;
    readonly VITE_AWS_S3_RESUMES_BUCKET: string;
    readonly VITE_AWS_S3_VIDEOS_BUCKET: string;
    readonly VITE_AWS_S3_ACCESS_KEY_ID: string;
    readonly VITE_AWS_S3_SECRET_ACCESS_KEY: string;
    readonly VITE_OPENROUTER_API_KEY: string;
    readonly VITE_OPENROUTER_MODEL: string;
    readonly VITE_GEMINI_API_KEY: string;
    readonly VITE_GEMINI_MODEL: string;
    readonly VITE_ANTHROPIC_API_KEY: string;
    readonly VITE_ANTHROPIC_BASE_URL: string;
    readonly VITE_ANTHROPIC_WORKSPACE_ID: string;
    readonly VITE_AWS_BEDROCK_REGION: string;
    readonly VITE_BEDROCK_CHAT_BASE_URL: string;
    readonly VITE_BEDROCK_MODEL_QUESTIONS: string;
    readonly VITE_BEDROCK_MODEL_REPORT: string;
    readonly VITE_BEDROCK_MODEL_DEFAULT: string;
    readonly VITE_COGNITO_USER_POOL_ID: string;
    readonly VITE_COGNITO_CLIENT_ID: string;
    readonly VITE_COGNITO_REGION: string;
    readonly VITE_AUTH_API_URL: string;
    readonly VITE_AWS_SES_REGION: string;
    readonly VITE_SES_FROM_EMAIL: string;
    readonly VITE_SES_SENDER_NAME: string;
    readonly VITE_SES_CONFIGURATION_SET: string;
    readonly VITE_AWS_SES_ACCESS_KEY_ID: string;
    readonly VITE_AWS_SES_SECRET_ACCESS_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
