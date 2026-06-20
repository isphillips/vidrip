import { create } from 'zustand';

export interface UploadJob {
  id: string;
  label: string;
  status: 'uploading' | 'done' | 'error';
  errorMsg?: string;
}

interface UploadState {
  jobs: UploadJob[];
  /** Start a background upload. Returns immediately — progress shown via toast. */
  enqueue: (label: string, fn: () => Promise<void>) => void;
  /** Show an indeterminate progress toast you dismiss yourself (returns its id). For a slow pre-step
   *  (e.g. an anonymize bake) that hands off to a real enqueue — no premature "done" state. */
  show: (label: string) => string;
  dismiss: (id: string) => void;
}

let _counter = 0;

export const useUploadStore = create<UploadState>((set) => ({
  jobs: [],

  enqueue(label, fn) {
    const id = String(++_counter);
    set(s => ({ jobs: [...s.jobs, { id, label, status: 'uploading' }] }));

    fn()
      .then(() => {
        set(s => ({ jobs: s.jobs.map(j => j.id === id ? { ...j, status: 'done' } : j) }));
        // Auto-dismiss the success pill after a short delay
        setTimeout(() => {
          set(s => ({ jobs: s.jobs.filter(j => j.id !== id) }));
        }, 3500);
      })
      .catch((e: any) => {
        set(s => ({
          jobs: s.jobs.map(j =>
            j.id === id ? { ...j, status: 'error', errorMsg: e?.message ?? 'Upload failed' } : j,
          ),
        }));
      });
  },

  show(label) {
    const id = String(++_counter);
    set(s => ({ jobs: [...s.jobs, { id, label, status: 'uploading' }] }));
    return id;
  },

  dismiss(id) {
    set(s => ({ jobs: s.jobs.filter(j => j.id !== id) }));
  },
}));
