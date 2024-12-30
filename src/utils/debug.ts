export function debugLog(message: any): void {
  if (process.env.DEBUG) {
    console.log(message);
  }
}

export function debugWrite(message: any): void {
  if (process.env.DEBUG) {
    process.stdout.write(message);
  }
}
