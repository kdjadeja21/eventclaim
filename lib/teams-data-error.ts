export class TeamsDataError extends Error {
  constructor(
    message: string,
    public readonly code: "quota_exceeded" | "not_found" | "unknown"
  ) {
    super(message);
    this.name = "TeamsDataError";
  }
}
