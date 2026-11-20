import { savePendingSos } from './offlineStorage';

export interface SosSubmissionRequest {
  idempotencyKey: string;
  transcript: string;
  requestedAt: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracyM: number;
  };
}

export type SosSubmissionResult =
  | {
      status: 'submitted';
      requestId: string;
      dispatchStatus: 'notified' | 'pending' | 'unconfirmed';
      message: string;
    }
  | {
      status: 'unavailable' | 'failed';
      message: string;
    }
    | {
      status: 'queued';
      message: string;
    };

export type SosSubmitter = (request: SosSubmissionRequest) => Promise<SosSubmissionResult>;

export const SOS_SUBMISSION_AVAILABLE = false;

export const submitSosRequest: SosSubmitter = async request => {
    if (typeof window !== 'undefined' && !navigator.onLine) {
      try {
        await savePendingSos({
          request,
          createdAt: new Date().toISOString()
        });
        return {
          status: 'queued',
          message: 'SOS is encrypted and saved on this device only. It has NOT been transmitted, and this app has no SOS submission endpoint. Call an emergency service directly now.'
        };
      } catch (error) {
        return {
          status: 'failed',
          message: `SOS was not transmitted and could not be saved locally: ${
            error instanceof Error ? error.message : String(error)
          } Please call an emergency service directly.`
        };
      }
    }

    return {
      status: 'unavailable',
      message: 'SOS has not been transmitted because this app has no SOS submission endpoint. Please call an emergency service directly.'
    };
};
