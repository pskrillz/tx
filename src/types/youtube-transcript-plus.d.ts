// Locked youtube-transcript-plus 1.1.1 exports these classes at runtime, but its
// extensionless `export * from './errors'` is unresolved by NodeNext. Reuse its
// actual class declarations; do not replace the peer API with untyped exports.
import 'youtube-transcript-plus';
import type * as Errors from 'youtube-transcript-plus/dist/errors.js';

declare module 'youtube-transcript-plus' {
  export const YoutubeTranscriptDisabledError: typeof Errors.YoutubeTranscriptDisabledError;
  export const YoutubeTranscriptVideoUnavailableError: typeof Errors.YoutubeTranscriptVideoUnavailableError;
  export const YoutubeTranscriptNotAvailableError: typeof Errors.YoutubeTranscriptNotAvailableError;
  export const YoutubeTranscriptNotAvailableLanguageError: typeof Errors.YoutubeTranscriptNotAvailableLanguageError;
}
