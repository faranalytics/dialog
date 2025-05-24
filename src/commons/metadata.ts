export class Metadata {
  public callSid?: string;
  public streamSid?: string;
  public serverCallStartTime?: string;
  public to?: string;
  public from?: string;
  public channels?: number;
  public encoding?: string;
  public sampleRate?: number;

  constructor(options: Metadata = {}) {
    Object.assign(this, options);
  }
}