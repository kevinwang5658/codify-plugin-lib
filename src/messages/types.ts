export enum MessageStatus {
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface Message {
  cmd: string;
  status?: MessageStatus;
  data: unknown;
}
