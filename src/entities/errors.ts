export class SudoError extends Error {
  command: string;

  constructor(command: string) {
    super();
    this.command = command;
  }
}
