export function createResponse(streamURL: string) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamURL}"></Stream>
  </Connect>
</Response>`;
}