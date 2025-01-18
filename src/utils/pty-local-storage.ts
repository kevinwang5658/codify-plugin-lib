import { AsyncLocalStorage } from 'node:async_hooks';

export const ptyLocalStorage = new AsyncLocalStorage();
