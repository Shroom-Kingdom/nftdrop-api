import { Router } from 'itty-router';
import { gzip, ungzip } from 'pako';

interface FollowerResponse {
  data: Follower[];
  meta: {
    result_count: number;
    next_token: string;
  };
}

interface Follower {
  id: string;
  name: string;
  username: string;
  created_at: Date | string;
}

export class Twitter {
  private state: DurableObjectState;
  private initializePromise: Promise<void> | undefined;
  private followers: Record<string, Follower> = {};
  private followerPages = 0;
  private followersRateLimit: number[] = [];
  private router: Router<unknown>;

  private readonly followersRateLimitRequests = 15;
  private readonly followersRateLimitTimeframe = 15.2 * 60 * 1000;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.router = Router().get('/follows/:username', async ({ params }) => {
      console.log('TWITTER PUT');
      if (!params) {
        return new Response('', { status: 400 });
      }
      // const body = await req.json();
      console.log('TWITTER FOLLOWS', JSON.stringify(params, undefined, 2));
      this.clearOldRequestsCountingToRateLimit();
      this.updateFollowers(env);

      console.log(JSON.stringify(this.followers, undefined, 2));

      if (this.followers[params.username]) {
        return new Response(JSON.stringify(this.followers[params.username]));
      }
      return new Response('', { status: 404 });
    });
    // .get('/liking_users', async () => {
    //   return new Response('', { status: 404 });
    // })
    // .get('/retweeted_by', async () => {
    //   return new Response('', { status: 404 });
    // })
    // .get('*', () => {
    //   console.log('TWITTER 404');
    //   return new Response('', { status: 404 });
    // });
  }

  clearOldRequestsCountingToRateLimit(): void {
    const now = Date.now();
    let clearQueue = true;
    if (this.followersRateLimit.length > 0) {
      let modified = false;
      while (clearQueue) {
        if (
          this.followersRateLimit[0].valueOf() <
          now - this.followersRateLimitTimeframe
        ) {
          this.followersRateLimit.shift();
          modified = true;
        } else {
          clearQueue = false;
          break;
        }
      }
      if (modified) {
        this.state.storage.put('followersRateLimit', this.followersRateLimit);
      }
    }
  }

  updateFollowers(env: Env): void {
    const now = Date.now();
    if (
      this.followersRateLimit.length === 0 ||
      this.followersRateLimit.length <
        ((now - this.followersRateLimit[0]) * this.followersRateLimitRequests -
          this.followerPages) /
          this.followersRateLimitTimeframe
    ) {
      // TODO state typings
      (this.state as any).blockConcurrencyWhile(async () => {
        // let followers: Follower[] = [];
        // let paginationToken: string | null = null;
        // for (let i = 0; i < 100; i++) {
        //   const res = await fetch(
        //     `https://api.twitter.com/2/users/1415961588016816129/followers?user.fields=created_at&max_results=1000${
        //       paginationToken ? `&pagination_token=${paginationToken}` : ''
        //     }`,
        //     {
        //       headers: {
        //         Autorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`
        //       }
        //     }
        //   );
        //   if (!res.ok) {
        //     return res;
        //   }
        //   this.followersRateLimit.push(now);
        //   const followerResponse: FollowerResponse = await res.json();
        //   const nextFollowers: Follower[] = followerResponse.data;
        //   this.state.storage.put(
        //     `followers${i}`,
        //     gzip(JSON.stringify(this.followers), { to: 'string' })
        //   );
        //   followers = [...followers, ...nextFollowers];
        //   if (!followerResponse.meta.next_token) {
        //     this.followerPages = i + 1;
        //     this.state.storage.put(
        //       'followersRateLimit',
        //       this.followersRateLimit
        //     );
        //     break;
        //   }
        //   paginationToken = followerResponse.meta.next_token;
        // }
        // for (const follower of followers) {
        //   this.followers[follower.username] = follower;
        // }
      });
    }
  }

  async initialize(): Promise<void> {
    let followers: Follower[] = [];
    for (let i = 0; i < 100; i++) {
      const next: string | undefined = await this.state.storage.get(
        `followers${i}`
      );
      if (!next) {
        break;
      }
      followers = [...followers, ...JSON.parse(ungzip(next, { to: 'string' }))];
      this.followerPages = i + 1;
    }
    followers = Array.from(new Set(followers));
    for (const follower of followers) {
      this.followers[follower.username] = follower;
    }
    this.followersRateLimit =
      (await this.state.storage.get('followersRateLimit')) ?? [];
  }

  async fetch(request: Request): Promise<Response> {
    console.log('TWITTER HANDLE REQ', JSON.stringify(request, undefined, 2));
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
