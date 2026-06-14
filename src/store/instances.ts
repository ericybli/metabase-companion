import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Instance } from '../auth/types';
import { asyncStorageAdapter } from './persistStorage';

export interface InstancesState {
  instances: Instance[];
  activeInstanceId: string | null;
  addInstance: (instance: Instance) => void;
  setActiveInstance: (id: string | null) => void;
  removeInstance: (id: string) => void;
}

export const useInstancesStore = create<InstancesState>()(
  persist(
    (set) => ({
      instances: [],
      activeInstanceId: null,
      addInstance: (instance) =>
        set((state) => ({
          instances: [...state.instances.filter((i) => i.id !== instance.id), instance],
        })),
      setActiveInstance: (id) => set({ activeInstanceId: id }),
      removeInstance: (id) =>
        set((state) => ({
          instances: state.instances.filter((i) => i.id !== id),
          activeInstanceId: state.activeInstanceId === id ? null : state.activeInstanceId,
        })),
    }),
    {
      name: 'mb-instances',
      storage: createJSONStorage(() => asyncStorageAdapter),
      // Persist only data, never functions. (Tokens are NOT in this store at all.)
      partialize: (state) => ({
        instances: state.instances,
        activeInstanceId: state.activeInstanceId,
      }),
    },
  ),
);
