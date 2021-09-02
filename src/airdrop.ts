import { isLeft, Either, left } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { PathReporter } from 'io-ts/PathReporter';
import { Router, Request } from 'itty-router';

const router = Router({ base: '/airdrop' });
export { router as airdropRouter };

interface AirdropRequest {
  walletId: string;
  twitter: string;
  twitterRetweetUrl: string;
  discord: string;
  quiz: Quiz;
}

interface Quiz {
  platform: string;
}

const quizAnswers = JSON.stringify({
  platform: 'web'
} as Quiz).toLowerCase();

enum AirdropRequestHeaders {
  FounderId = 'Founder-ID',
  DiscordBotToken = 'Discord-Bot-Token'
}

interface DiscordMember {
  joined_at: string;
  user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string;
  };
}

class AirdropResponse {
  static put(
    res: Either<PutAirdropErrorResponse, PutAirdropOkResponse>
  ): Response {
    if (isLeft(res)) {
      return new Response(JSON.stringify(res.left), { status: 400 });
    }
    return new Response(res.right.message, { status: res.right.status });
  }
}

interface PutAirdropOkResponse {
  status: number;
  message: string;
}

interface PutAirdropErrorResponse {
  code: PutAirdropErrorResponseCode;
  message?: string;
}

enum PutAirdropErrorResponseCode {
  CodecError = 1,
  AlreadyExists = 2,
  QuizAnswerWrong = 3,
  NoDiscordMember = 4
}

router
  .get('/:addr', async (req, env: Env) => {
    if (!req.params) {
      return new Response('', { status: 404 });
    }
    const addr = env.AIRDROP.idFromName(req.params.addr);
    const obj = env.AIRDROP.get(addr);
    return obj.fetch(req.url);
  })
  .put('/:addr', async (req, env: Env) => {
    if (!req.params || !req.text) {
      return new Response('', { status: 400 });
    }
    const addr = env.AIRDROP.idFromName(req.params.addr);
    const airdropObj = env.AIRDROP.get(addr);
    try {
      const founderId = env.FOUNDER_NFT.newUniqueId();
      let res = await airdropObj.fetch(req.url, {
        method: 'PUT',
        body: await req.text(),
        headers: {
          [AirdropRequestHeaders.FounderId]: founderId.toString(),
          [AirdropRequestHeaders.DiscordBotToken]: env.DISCORD_BOT_TOKEN
        }
      });
      if (!res.ok) {
        return res;
      }
      const airdrop = await res.text();

      const founderNftObj = env.FOUNDER_NFT.get(founderId);
      res = await founderNftObj.fetch(req.url, {
        method: 'PUT',
        body: airdrop
      });
      return new Response(founderId.toString());
    } catch (err) {
      return new Response(`An unknown error occured: ${err}`, { status: 500 });
    }
  });

export class Airdrop {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private founderId: string | null;
  private codec: t.Type<AirdropRequest>;
  private router: Router<unknown>;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.founderId = null;
    this.codec = t.type({
      walletId: t.string,
      twitter: t.string,
      twitterRetweetUrl: t.string,
      discord: t.string,
      quiz: t.interface({
        platform: t.string
      })
    });
    this.router = Router()
      .get('*', () => {
        if (this.founderId) {
          return new Response(this.founderId);
        }
        return new Response('', { status: 404 });
      })
      .put('*', async req => {
        if (this.founderId) {
          return AirdropResponse.put(
            left({
              code: PutAirdropErrorResponseCode.AlreadyExists,
              message: this.founderId
            })
          );
        }
        if (!req.json) {
          return new Response('', { status: 400 });
        }
        const json: unknown = await req.json();
        const decoded = this.codec.decode(json);
        if (isLeft(decoded)) {
          return AirdropResponse.put(
            left({
              code: PutAirdropErrorResponseCode.CodecError,
              message: PathReporter.report(decoded).join('\n\n')
            })
          );
        }
        const airdrop = decoded.right;
        const { discord, twitter, twitterRetweetUrl, quiz } = airdrop;

        const quizError = await this.checkQuizAnswers(quiz);
        if (quizError) {
          return quizError;
        }

        const discordBotToken = (req as any).headers.get(
          AirdropRequestHeaders.DiscordBotToken
        ); // TODO fix typings in itty-router
        const discordError = await this.checkDiscordMembership(
          discord,
          discordBotToken
        );
        if (discordError) {
          return discordError;
        }

        const twitterFollowError = await this.checkTwitterFollow(twitter);
        if (twitterFollowError) {
          return twitterFollowError;
        }

        const twitterRetweetError = await this.checkTwitterRetweet(
          twitterRetweetUrl
        );
        if (twitterRetweetError) {
          return twitterRetweetError;
        }

        this.founderId = (req as any).headers.get(
          AirdropRequestHeaders.FounderId
        ); // TODO fix typings in itty-router
        await this.state.storage.put('founderId', this.founderId);
        return new Response(JSON.stringify(airdrop), { status: 200 });
      });
  }

  /**
   * Check quiz answers
   * @returns Response on error, undefined on success
   */
  async checkQuizAnswers(quiz: Quiz): Promise<Response | undefined> {
    if (JSON.stringify(quiz).toLowerCase() !== quizAnswers) {
      return AirdropResponse.put(
        left({ code: PutAirdropErrorResponseCode.QuizAnswerWrong })
      );
    }
  }

  /**
   * Check Discord membership
   * @returns Response on error, undefined on success
   */
  async checkDiscordMembership(
    discordHandle: string,
    discordBotToken: string
  ): Promise<Response | undefined> {
    const res = await fetch(
      `https://discord.com/api/guilds/168893527357521920/members/search?query=${discordHandle}`,
      {
        headers: {
          Authorization: `Bot ${discordBotToken}`
        }
      }
    );
    if (!res.ok) {
      console.error(`Discord says no: [${res.status}]`);
      return res;
    }
    const discordMembers: DiscordMember[] = await res.json();
    console.info('DISCORD OK', JSON.stringify(discordMembers, undefined, 2));
    const [username, discriminator] = discordHandle.split('#');
    const discordMember = discordMembers.find(
      ({ user }) =>
        user.username === username && user.discriminator === discriminator
    );
    if (!discordMember) {
      return AirdropResponse.put(
        left({ code: PutAirdropErrorResponseCode.NoDiscordMember })
      );
    }
  }

  /**
   * Check Twitter folloiw
   * @returns Response on error, undefined on success
   */
  async checkTwitterFollow(
    twitterHandle: string
  ): Promise<Response | undefined> {
    // TODO
    return;
  }

  /**
   * Check Twitter retweet
   * @returns Response on error, undefined on success
   */
  async checkTwitterRetweet(retweetUrl: string): Promise<Response | undefined> {
    // TODO
    return;
  }

  async initialize(): Promise<void> {
    this.founderId = await this.state.storage.get('founderId');
  }

  async fetch(request: Request): Promise<Response> {
    if (!this.initializePromise) {
      this.initializePromise = this.initialize().catch(err => {
        this.initializePromise = undefined;
        throw err;
      });
    }
    await this.initializePromise;

    return this.router.handle(request);
  }
}
