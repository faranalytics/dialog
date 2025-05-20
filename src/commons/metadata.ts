export class Metadata {
  public callSid?: string;
  public streamSid?: string;
  public serverCallStartTime?: string;
  public to?: string;
  public from?: string;
  public channels?: number;
  public encoding?: string;
  public sampleRate?: number;

  constructor({ callSid, streamSid, serverCallStartTime, to, from, channels, encoding, sampleRate }: Metadata) {
    this.callSid = callSid;
    this.streamSid = streamSid;
    this.serverCallStartTime = serverCallStartTime;
    this.to = to;
    this.from = from;
    this.channels = channels;
    this.encoding = encoding;
    this.sampleRate = sampleRate;
  }
}