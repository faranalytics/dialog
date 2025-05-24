export const createResponse = (streamURL: string): string => (
  `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${streamURL}"></Stream>
  </Connect>
</Response>`
);