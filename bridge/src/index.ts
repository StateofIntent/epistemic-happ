import { AppWebsocket } from '@holochain/client';
// AppAgentCall, RoleName, ZomeName, FunctionName were imported here but
// never used anywhere in this file — AppAgentCall doesn't even exist as
// an export of the installed @holochain/client version (a real, hard
// compile error caught by actually running `tsc`, not previously run in
// this project). Removed rather than fixed, since none of the four were
// load-bearing.
import { TwitterApi } from 'twitter-api-v2';
import * as dotenv from 'dotenv';
import * as winston from 'winston';

dotenv.config();

// ============================================================================
// CORRELATIVE WITNESS PRINCIPLE
// ============================================================================
//
// This bridge is not a data pipe. It creates a correlative witness — a
// durable record, on the Holochain side only, that a specific tweet and
// a specific DHT entry co-occurred at a specific time.
//
// When a Holochain Mew is mirrored to Twitter, the bridge establishes that
// witness:
//   1. The tweet references the DHT hash (in text or metadata)
//   2. The DHT records the Twitter ID (in BridgeRecord)
//   3. Even if Twitter deletes the tweet, the witness persists
//
// This is NOT a mutual contract, and specifically not a Ricardian one in
// Vinay Gupta's sense — that requires assent from both parties, and
// Twitter has given none. Putting a DHT hash inside a tweet's text does
// not make Twitter a signatory; it's this agent inscribing one half of a
// binding into a medium that never agreed to carry it. Calling this a
// two-way Ricardian contract would be an imposition described as an
// agreement — exactly the failure mode Promise Theory exists to name.
//
// What BridgeRecord actually is: a UNILATERAL Ricardian instrument.
// One signatory — the agent who created it. Human-readable ("at time T,
// I bound this claim to tweet X"). Machine-executable (the hash
// resolves, the tweet ID resolves). Mutually referential (record ↔
// artifact, in both directions). The counterparty isn't Twitter — it's
// every future reader of the DHT, who can verify the binding without
// trusting either platform. Twitter is not a party to this; Twitter is
// the medium one half of the binding happens to be inscribed in.
//
// The witness is asymmetric by design: Holochain remembers permanently;
// Twitter can delete at any time. BridgeRecord is what survives that
// deletion — proof the correlation existed, not an enforceable
// agreement that it must persist. The tweet is not "converted" into a
// DHT entry. It is "witnessed" alongside it.
//
// The bridge also introduces temporal separation (SWO-style bridge latency):
//   - A Mew doesn't instantly become a tweet
//   - A tweet reply doesn't instantly become a DHT entry
//   - This latency preserves epistemic spreads — the full context is not
//     flattened by synchronous extraction
//
// ============================================================================

// ============================================================================
// BRIDGE RECORD LOSS TRACKING
// ============================================================================
//
// BridgeRecord's carried_fields/dropped_fields are a real set difference,
// not a fabricated scalar like a made-up "reflection coefficient" — see
// the README's Fractal Impedance Matching section for why that
// distinction matters (it's the EVA-era mistake this project explicitly
// set out not to repeat). This is where that set difference actually
// gets computed: the DHT itself has no way to compute it (record_twitter_mirror
// just stores whatever BridgeRecord it's handed), since only the bridge,
// at the moment it builds the tweet text, knows which fields it included
// and which it left out.
//
// These field lists must be kept in sync with the actual Mew/Claim
// struct fields in dna/integrity/src/lib.rs — there is no shared schema
// to derive them from automatically, so a field added to either Rust
// struct needs a matching update here or dropped_fields will silently
// under-report.
// ============================================================================

const MEW_FIELDS = ['content', 'author', 'timestamp', 'reply_to', 'semantic_tags', 'linked_claim'];
const CLAIM_FIELDS = [
  'content', 'domain', 'author', 'timestamp', 'evidence_hashes', 'confidence', 'semantic_tags', 'source_mew',
];

interface FieldLoss {
  carried_fields: string[];
  dropped_fields: string[];
}

/** Honest set difference: which of `allFields` actually made it into the
 *  tweet (`carriedFields`, already known by the caller since it's the
 *  caller who built the tweet text) versus which didn't. */
function computeFieldLoss(allFields: string[], carriedFields: string[]): FieldLoss {
  const carried = allFields.filter((f) => carriedFields.includes(f));
  const dropped = allFields.filter((f) => !carriedFields.includes(f));
  return { carried_fields: carried, dropped_fields: dropped };
}

// ============================================================================
// LOGGER
// ============================================================================

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'bridge.log' })
  ]
});

// ============================================================================
// CONFIG
// ============================================================================

const HOLOCHAIN_URL = process.env.HOLOCHAIN_URL || 'ws://localhost:8888';
const HOLOCHAIN_APP_ID = process.env.HOLOCHAIN_APP_ID || 'epistemic-resonance-happ';
const TWITTER_API_KEY = process.env.TWITTER_API_KEY || '';
const TWITTER_API_SECRET = process.env.TWITTER_API_SECRET || '';
const TWITTER_ACCESS_TOKEN = process.env.TWITTER_ACCESS_TOKEN || '';
const TWITTER_ACCESS_SECRET = process.env.TWITTER_ACCESS_SECRET || '';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '30000');

// ============================================================================
// HOLOCHAIN CLIENT
// ============================================================================

class HolochainClient {
  private client: any;
  private appId: string;

  constructor(appId: string) {
    this.appId = appId;
  }

  async connect() {
    // KNOWN GAP, found by actually running `tsc` (not previously done in
    // this project — see the coordinator zome's TESTS section for the
    // Rust-side equivalent of this discovery): AppWebsocket's `token`
    // option is typed `AppAuthenticationToken = number[]`, a real byte
    // token obtained via `AdminWebsocket#issueAppAuthenticationToken` —
    // not an arbitrary string. The `'bridge-auth-token'` placeholder
    // this used to pass was never a valid token; this bridge has never
    // actually been able to authenticate against a real conductor.
    // Omitting `token` here fixes the type error and lets a
    // single-app/no-auth-required conductor setup work, but a
    // multi-app or auth-enforcing setup still needs a real admin
    // connection: connect an AdminWebsocket, call
    // issueAppAuthenticationToken with this app's installed_app_id, and
    // pass the resulting number[] here. Not implemented — a genuine
    // admin-auth flow is a separate piece of work from this file's
    // other fixes, not something to guess at without a real conductor
    // to verify against.
    this.client = await AppWebsocket.connect({
      url: new URL(HOLOCHAIN_URL),
    });

    // HOLOCHAIN_APP_ID previously never touched anything after being read
    // from env. Zome calls are made by role_name (see callZome), so this
    // isn't needed for that — but it's still worth using to catch a
    // misconfigured .env early, by checking it against whatever app the
    // conductor actually has connected on this socket.
    try {
      const info = await this.client.appInfo();
      const runningAppId = info?.installed_app_id;
      if (runningAppId && runningAppId !== this.appId) {
        logger.warn(
          `Configured HOLOCHAIN_APP_ID ("${this.appId}") does not match the ` +
          `conductor's running app ("${runningAppId}"). Zome calls use role ` +
          `names, not this id, so calls should still work, but check your .env.`
        );
      }
    } catch (error) {
      // appInfo()'s availability/shape on this client version hasn't been
      // verified against a real conductor — same caveat as the rest of
      // this file's Holochain integration. Don't let a failure here be
      // fatal to startup.
      logger.warn('Could not verify installed_app_id via appInfo():', error);
    }

    logger.info(`Connected to Holochain conductor (app: ${this.appId})`);
  }

  async callZome(roleName: string, zomeName: string, fnName: string, payload: any): Promise<any> {
    return this.client.callZome({
      role_name: roleName,
      zome_name: zomeName,
      fn_name: fnName,
      payload,
    });
  }

  onSignal(callback: (signal: any) => void) {
    this.client.on('signal', callback);
  }
}

// ============================================================================
// TWITTER CLIENT
// ============================================================================

class TwitterBridge {
  private client: TwitterApi;

  constructor() {
    this.client = new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: TWITTER_ACCESS_TOKEN,
      accessSecret: TWITTER_ACCESS_SECRET,
    });
  }

  async tweet(text: string): Promise<{ id: string; text: string }> {
    try {
      const tweet = await this.client.v2.tweet(text);
      logger.info(`Tweeted: ${tweet.data.id}`);
      return { id: tweet.data.id, text: tweet.data.text };
    } catch (error) {
      logger.error('Twitter tweet failed:', error);
      throw error;
    }
  }

  async getMentions(userId: string, sinceId?: string): Promise<any[]> {
    try {
      const mentions = await this.client.v2.userMentionTimeline(userId, {
        since_id: sinceId,
        max_results: 100,
      });
      return mentions.data?.data || [];
    } catch (error) {
      logger.error('Twitter mentions fetch failed:', error);
      return [];
    }
  }

  async getUserId(): Promise<string> {
    const user = await this.client.v2.me();
    return user.data.id;
  }
}

// ============================================================================
// BRIDGE SERVICE
// ============================================================================
//
// The bridge service is a local daemon that runs on the same machine as the
// Holochain conductor. It is agent-sovereign: each agent runs their own bridge.
// There is no centralized bridge service. This preserves the CEPTR receptor
// model — each cell has its own membrane.
//
// TWO-WAY CORRELATIVE WITNESS:
//   Holochain → Twitter: Mew/Claim is published with DHT hash reference
//   Twitter → Holochain: Reply is imported as ExternalCritique with provenance
//   (Note: only the Holochain side durably "witnesses" the correlation —
//    see CORRELATIVE WITNESS PRINCIPLE above for why this isn't mutual.)
//
// TEMPORAL SEPARATION:
//   - Real-time: Signal-driven (fast, but not instant — WebSocket latency)
//   - Polling: 30s fallback for missed signals
//   - Mention import: 5min polling for Twitter → Holochain flow
//
// ============================================================================

class EpistemicBridgeService {
  private holochain: HolochainClient;
  private twitter: TwitterBridge;
  private lastMentionId: string | undefined;
  private userId: string = '';

  constructor() {
    this.holochain = new HolochainClient(HOLOCHAIN_APP_ID);
    this.twitter = new TwitterBridge();
  }

  async start() {
    await this.holochain.connect();
    this.userId = await this.twitter.getUserId();
    logger.info(`Twitter user ID: ${this.userId}`);

    // Listen for Holochain signals (real-time claim/mew creation).
    this.holochain.onSignal((signal) => {
      this.handleSignal(signal);
    });

    // Start polling for unbridged Mews and Claims (fallback).
    setInterval(() => this.pollUnbridged(), POLL_INTERVAL_MS);

    // Start polling for Twitter mentions (two-way bridge).
    setInterval(() => this.pollMentions(), 300000); // 5 minutes

    logger.info('Epistemic Bridge Service started');
  }

  private async handleSignal(signal: any) {
    if (signal.zome_name !== 'epistemic_coordinator') return;

    const payload = signal.data;
    // NewMew/NewClaim are now struct variants carrying entry_hash
    // alongside the entry itself (see SignalPayload in the coordinator
    // zome) — a bare Mew/Claim has no hash field of its own.
    if (payload.NewMew) {
      await this.bridgeMewToTwitter(payload.NewMew.mew, payload.NewMew.entry_hash);
    } else if (payload.NewClaim) {
      await this.bridgeClaimToTwitter(payload.NewClaim.claim, payload.NewClaim.entry_hash);
    }
  }

  // --------------------------------------------------------------------------
  // H O L O C H A I N  →  T W I T T E R
  // --------------------------------------------------------------------------
  // This is a non-destructive measurement. The Mew is not "converted" to a
  // tweet. It is witnessed alongside it. The tweet carries a reference to
  // the DHT. The DHT records the Twitter ID. Both domains preserve their
  // native format; only the DHT side durably remembers the correlation.
  // --------------------------------------------------------------------------

  // `entryHash` is the Mew's EntryHash — required (not the nonexistent
  // `mew.action_hash` this used to read), since record_twitter_mirror
  // links a BridgeRecord from that same EntryHash and get_unbridged_mews
  // looks the link up under it too. See coordinator's SignalPayload and
  // UnbridgedRecord for where callers get this value from.
  private async bridgeMewToTwitter(mew: any, entryHash: string) {
    // Include the DHT hash in the tweet text so replies can reference it.
    // This is the witness link: the tweet carries a pointer to its DHT
    // origin, though Twitter itself remains unaware of what that means.
    const hashRef = entryHash ? `\n\nDHT: ${entryHash}` : '';
    const excerpt = mew.content.substring(0, 200);
    const tweetText = `${excerpt}${hashRef}\n\n— via #EpistemicResonance`;

    // Only `content` actually made it into the tweet text — author is
    // implicit via the posting account (not literal data in the tweet),
    // and reply_to/semantic_tags/linked_claim aren't included at all.
    const { carried_fields, dropped_fields } = computeFieldLoss(MEW_FIELDS, ['content']);

    try {
      const tweet = await this.twitter.tweet(tweetText);

      // Record the witness back to Holochain.
      // This is the correlative witness: only the DHT side durably records
      // that the correlation happened — Twitter does not.
      await this.holochain.callZome(
        'epistemic',
        'epistemic_coordinator',
        'record_twitter_mirror',
        {
          mew_hash: entryHash,
          twitter_id: tweet.id,
          platform: 'twitter',
          mirrored_at: Date.now(),
          carried_fields,
          dropped_fields,
          original_length: mew.content.length,
          excerpt_length: excerpt.length,
        }
      );

      logger.info(`Correlative witness recorded: DHT ${entryHash} ↔ Twitter ${tweet.id}`);
    } catch (error) {
      logger.error('Bridge to Twitter failed:', error);
    }
  }

  // `entryHash` is the Claim's EntryHash — see bridgeMewToTwitter above
  // for why this must be passed explicitly rather than read off `claim`.
  private async bridgeClaimToTwitter(claim: any, entryHash: string) {
    // Claims are richer than Mews. We publish a summary tweet with a link
    // to the full claim on the DHT. The full dimensional context stays on
    // Holochain; Twitter gets only the projection.
    const hashRef = entryHash ? `\n\nFull context: ${entryHash}` : '';
    const excerpt = claim.content.substring(0, 200);
    const tweetText = `${excerpt}${hashRef}\n\nDomain: ${claim.domain} — via #EpistemicResonance`;

    // content (truncated) and domain both appear in the tweet text;
    // evidence_hashes, confidence, semantic_tags, source_mew don't, and
    // author/timestamp are only implicit (the posting account, and
    // Twitter's own tweet timestamp) rather than literal data carried
    // across.
    const { carried_fields, dropped_fields } = computeFieldLoss(CLAIM_FIELDS, ['content', 'domain']);

    try {
      const tweet = await this.twitter.tweet(tweetText);

      await this.holochain.callZome(
        'epistemic',
        'epistemic_coordinator',
        'record_twitter_mirror',
        {
          mew_hash: entryHash,
          twitter_id: tweet.id,
          platform: 'twitter',
          mirrored_at: Date.now(),
          carried_fields,
          dropped_fields,
          original_length: claim.content.length,
          excerpt_length: excerpt.length,
        }
      );

      logger.info(`Claim bridged to Twitter: ${tweet.id}`);
    } catch (error) {
      logger.error('Claim bridge to Twitter failed:', error);
    }
  }

  // Covers both Mews and Claims: the coordinator exposes get_unbridged_mews
  // and get_unbridged_claims separately (previously only the claims side
  // existed, so this function called a zome function that didn't exist).
  // Both now return UnbridgedRecord { entry_hash, record }, so no
  // client-side hash recomputation is needed.
  private async pollUnbridged() {
    try {
      const unbridgedMews = await this.holochain.callZome(
        'epistemic',
        'epistemic_coordinator',
        'get_unbridged_mews',
        null
      );

      for (const { entry_hash, record } of unbridgedMews) {
        const mew = record.entry;
        if (mew) {
          await this.bridgeMewToTwitter(mew, entry_hash);
        }
      }

      const unbridgedClaims = await this.holochain.callZome(
        'epistemic',
        'epistemic_coordinator',
        'get_unbridged_claims',
        null
      );

      for (const { entry_hash, record } of unbridgedClaims) {
        const claim = record.entry;
        if (claim) {
          await this.bridgeClaimToTwitter(claim, entry_hash);
        }
      }
    } catch (error) {
      logger.error('Poll unbridged failed:', error);
    }
  }

  // --------------------------------------------------------------------------
  // T W I T T E R  →  H O L O C H A I N
  // --------------------------------------------------------------------------
  // This is the reverse binding. A tweet reply is not "copied" into the DHT.
  // It is imported as an ExternalCritique — a new entry type that preserves
  // the Twitter origin (author_handle, twitter_id) while linking to the
  // Holochain claim it responds to.
  //
  // Even if Twitter deletes the reply, the ExternalCritique persists on the
  // DHT as immutable evidence that the critique occurred.
  // --------------------------------------------------------------------------

  private async pollMentions() {
    try {
      const mentions = await this.twitter.getMentions(this.userId, this.lastMentionId);

      for (const mention of mentions) {
        // Look for Holochain hash references in the reply text.
        // This is how Twitter replies "bind back" to the DHT.
        const hashMatch = mention.text.match(/0x[a-fA-F0-9]{64}/);
        if (hashMatch) {
          const linkedHash = hashMatch[0];

          // Import as ExternalCritique — preserves Twitter provenance.
          await this.holochain.callZome(
            'epistemic',
            'epistemic_coordinator',
            'import_twitter_reply',
            {
              twitter_id: mention.id,
              author_handle: mention.author_id,
              content: mention.text,
              linked_holochain_claim: linkedHash,
              imported_at: Date.now(),
            }
          );

          logger.info(`Twitter reply imported as ExternalCritique: ${mention.id} → ${linkedHash}`);
        }

        this.lastMentionId = mention.id;
      }
    } catch (error) {
      logger.error('Poll mentions failed:', error);
    }
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const service = new EpistemicBridgeService();
  await service.start();
}

main().catch((error) => {
  logger.error('Bridge service crashed:', error);
  process.exit(1);
});
