// Compile-only contracts: these imports are erased and no application code runs.
import type * as Transcript from 'youtube-transcript-plus';
import type { SdkRunnerConfig } from '../../src/worker/sdk-runner.ts';
import type { DispatcherConfig } from '../../src/worker/dispatcher.ts';
import type { Message } from '../../src/queue/index.ts';

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;

// Catch accidental any/unknown fallbacks in the NodeNext compatibility patch.
type DisabledConstructor = Assert<Equal<ConstructorParameters<typeof Transcript.YoutubeTranscriptDisabledError>, [string]>>;
type UnavailableConstructor = Assert<Equal<ConstructorParameters<typeof Transcript.YoutubeTranscriptVideoUnavailableError>, [string]>>;
type MissingConstructor = Assert<Equal<ConstructorParameters<typeof Transcript.YoutubeTranscriptNotAvailableError>, [string]>>;
type LanguageConstructor = Assert<Equal<ConstructorParameters<typeof Transcript.YoutubeTranscriptNotAvailableLanguageError>, [string, string[], string]>>;

// Preserve intended APIs rather than adding ignored options or weakening payloads.
type NoUnusedTimeout = Assert<Equal<Extract<'timeout', keyof SdkRunnerConfig>, never>>;
type NoObsoletePolling = Assert<Equal<Extract<'pollInterval', keyof DispatcherConfig>, never>>;
type UnknownPayloadStillRequiresNarrowing = Assert<Equal<Message['payload']['body'], unknown>>;
