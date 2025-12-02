export interface QuestionSolution {
    id: number;
    questionNumber: string;
    questionText: string;
    steps: string[];
}

export type AppState = 'upload' | 'processing' | 'results';

export interface ProcessingStep {
    id: number;
    text: string;
    status: 'pending' | 'active' | 'completed';
}

export interface UploadedFile {
    name: string;
    type: string;
    data: string;
}

declare global {
    namespace NodeJS {
        interface ProcessEnv {
            API_KEY: string;
        }
    }

    interface AIStudio {
        hasSelectedApiKey: () => Promise<boolean>;
        openSelectKey: () => Promise<void>;
    }

    interface Window {
        aistudio?: AIStudio;
    }
}