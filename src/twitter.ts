import { Router } from 'itty-router';

import { REQUIRED_RT_HASHTAGS, RETWEET_ID, TWITTER_ACCOUNT_ID } from './config';
import { obtainOauthRequestToken, obtainOauthAccessToken } from './oauth';
import { createSignature } from './signature';

const router = Router({ base: '/twitter' });
export { router as twitterRouter };

interface TwitterUser {
  createdAt: string | Date;
  name: string;
  screenName: string;
  verified: boolean;
  isFollowing: boolean;
  retweeted: boolean;
  liked: boolean;
}

interface Retweet {
  entities: {
    hashtags: { text: string }[];
  };
  quoted_status?: {
    id_str: string;
  };
}

interface LikedTweet {
  id_str: string;
}

router
  .get('/request-token', async (req, env: Env) => {
    const obtainRequestTokenConfig = {
      apiUrl: 'https://api.twitter.com/oauth/request_token',
      callbackUrl: 'http://localhost:3000/',
      consumerKey: env.CONSUMER_KEY,
      consumerSecret: env.CONSUMER_SECRET,
      method: 'POST'
    };
    const requestTokenData = await obtainOauthRequestToken(
      obtainRequestTokenConfig
    );
    return new Response(
      `https://api.twitter.com/oauth/authorize?oauth_token=${requestTokenData.oauth_token}`
    );
  })
  .post('/access-token', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    // eslint-disable-next-line prefer-const
    let { oauthToken, oauthVerifier } = await req.json();
    const { oauth_token, oauth_token_secret: oauthTokenSecret } =
      await obtainOauthAccessToken({
        apiUrl: 'https://api.twitter.com/oauth/access_token',
        consumerKey: env.CONSUMER_KEY,
        consumerSecret: env.CONSUMER_SECRET,
        oauthToken,
        oauthVerifier,
        method: 'POST'
      });
    oauthToken = oauth_token;

    const user = await verifyUser(oauthToken, oauthTokenSecret, env);
    if (user instanceof Response) {
      return user;
    }

    return new Response(
      JSON.stringify({ ...user, oauthToken, oauthTokenSecret })
    );
  })
  .post('/verify', async (req, env: Env) => {
    if (!req.json) {
      return new Response('', { status: 400 });
    }
    const { oauthToken, oauthTokenSecret } = await req.json();

    const user = await verifyUser(oauthToken, oauthTokenSecret, env);
    if (user instanceof Response) {
      return user;
    }

    return new Response(JSON.stringify(user));
  });

async function verifyUser(
  oauthToken: string,
  oauthTokenSecret: string,
  env: Env
): Promise<Response | TwitterUser> {
  let apiUrl = 'https://api.twitter.com/1.1/account/verify_credentials.json';
  let qs: Record<string, string> = {
    include_email: 'true'
  };
  let signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken,
    oauthTokenSecret,
    method: 'GET',
    qs
  });
  let search = new URLSearchParams(qs);
  let res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    console.error(res.status);
    return new Response('', { status: res.status });
  }
  const {
    created_at: createdAt,
    name,
    screen_name: screenName,
    email
  } = await res.json();

  apiUrl = `https://api.twitter.com/1.1/friendships/lookup.json`;
  qs = {
    user_id: TWITTER_ACCOUNT_ID
  };
  signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken,
    oauthTokenSecret,
    method: 'GET',
    qs
  });
  search = new URLSearchParams(qs);
  res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    console.error(res.status);
    return new Response('', { status: res.status });
  }
  const follows: { connections: ('following' | string)[]; id_str: string }[] =
    await res.json();
  const isFollowing = !!follows.find(
    ({ connections, id_str }) =>
      id_str === TWITTER_ACCOUNT_ID && connections.includes('following')
  );

  apiUrl = `https://api.twitter.com/1.1/statuses/user_timeline.json`;
  qs = {
    count: '200',
    include_rts: 'true',
    exclude_replies: 'true',
    trim_user: 'true'
  };
  signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken,
    oauthTokenSecret,
    method: 'GET',
    qs
  });
  search = new URLSearchParams(qs);
  res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    console.error(res.status);
    return new Response('', { status: res.status });
  }
  const retweets: Retweet[] = await res.json();
  const retweeted = !!retweets.find(({ entities, quoted_status }) => {
    if (quoted_status?.id_str !== RETWEET_ID) {
      return false;
    }
    const includedHashTags = entities.hashtags.map(h => h.text.toLowerCase());
    return REQUIRED_RT_HASHTAGS.every(
      req => includedHashTags.indexOf(req) !== -1
    );
  });

  apiUrl = `https://api.twitter.com/1.1/favorites/list.json`;
  qs = {
    count: '1',
    max_id: RETWEET_ID,
    include_entities: 'false'
  };
  signature = createSignature({
    apiUrl,
    consumerKey: env.CONSUMER_KEY,
    consumerSecret: env.CONSUMER_SECRET,
    oauthToken,
    oauthTokenSecret,
    method: 'GET',
    qs
  });
  search = new URLSearchParams(qs);
  res = await fetch(`${apiUrl}?${search.toString()}`, {
    headers: {
      Authorization: `OAuth ${signature}`
    }
  });
  if (!res.ok) {
    console.error(await res.text());
    console.error(res.status);
    return new Response('', { status: res.status });
  }
  const likes: LikedTweet[] = await res.json();
  const liked = likes[0]?.id_str === RETWEET_ID;

  return {
    createdAt,
    name,
    screenName,
    verified: !!email,
    isFollowing,
    retweeted,
    liked
  };
}

// import { Router } from 'itty-router';
// import { gzip, ungzip } from 'pako';

// interface FollowerResponse {
//   data: Follower[];
//   meta: {
//     result_count: number;
//     next_token: string;
//   };
// }

// interface Follower {
//   id: string;
//   name: string;
//   username: string;
//   created_at: Date | string;
// }

// export class Twitter {
//   private state: DurableObjectState;
//   private initializePromise: Promise<void> | undefined;
//   private followers: Record<string, Follower> = {};
//   private followerPages = 0;
//   private followersRateLimit: number[] = [];
//   private router: Router<unknown>;

//   private readonly followersRateLimitRequests = 15;
//   private readonly followersRateLimitTimeframe = 15.2 * 60 * 1000;

//   constructor(state: DurableObjectState, env: Env) {
//     this.state = state;
//     this.router = Router().get('/follows/:username', async ({ params }) => {
//       console.log('TWITTER PUT');
//       if (!params) {
//         return new Response('', { status: 400 });
//       }
//       // const body = await req.json();
//       console.log('TWITTER FOLLOWS', JSON.stringify(params, undefined, 2));
//       this.clearOldRequestsCountingToRateLimit();
//       this.updateFollowers(env);

//       console.log(JSON.stringify(this.followers, undefined, 2));

//       if (this.followers[params.username]) {
//         return new Response(JSON.stringify(this.followers[params.username]));
//       }
//       return new Response('', { status: 404 });
//     });
//     // .get('/liking_users', async () => {
//     //   return new Response('', { status: 404 });
//     // })
//     // .get('/retweeted_by', async () => {
//     //   return new Response('', { status: 404 });
//     // })
//     // .get('*', () => {
//     //   console.log('TWITTER 404');
//     //   return new Response('', { status: 404 });
//     // });
//   }

//   clearOldRequestsCountingToRateLimit(): void {
//     const now = Date.now();
//     let clearQueue = true;
//     if (this.followersRateLimit.length > 0) {
//       let modified = false;
//       while (clearQueue) {
//         if (
//           this.followersRateLimit[0].valueOf() <
//           now - this.followersRateLimitTimeframe
//         ) {
//           this.followersRateLimit.shift();
//           modified = true;
//         } else {
//           clearQueue = false;
//           break;
//         }
//       }
//       if (modified) {
//         this.state.storage.put('followersRateLimit', this.followersRateLimit);
//       }
//     }
//   }

//   updateFollowers(env: Env): void {
//     const now = Date.now();
//     if (
//       this.followersRateLimit.length === 0 ||
//       this.followersRateLimit.length <
//         ((now - this.followersRateLimit[0]) * this.followersRateLimitRequests -
//           this.followerPages) /
//           this.followersRateLimitTimeframe
//     ) {
//       // TODO state typings
//       (this.state as any).blockConcurrencyWhile(async () => {
//         // let followers: Follower[] = [];
//         // let paginationToken: string | null = null;
//         // for (let i = 0; i < 100; i++) {
//         //   const res = await fetch(
//         //     `https://api.twitter.com/2/users/1415961588016816129/followers?user.fields=created_at&max_results=1000${
//         //       paginationToken ? `&pagination_token=${paginationToken}` : ''
//         //     }`,
//         //     {
//         //       headers: {
//         //         Autorization: `Bearer ${env.TWITTER_BEARER_TOKEN}`
//         //       }
//         //     }
//         //   );
//         //   if (!res.ok) {
//         //     return res;
//         //   }
//         //   this.followersRateLimit.push(now);
//         //   const followerResponse: FollowerResponse = await res.json();
//         //   const nextFollowers: Follower[] = followerResponse.data;
//         //   this.state.storage.put(
//         //     `followers${i}`,
//         //     gzip(JSON.stringify(this.followers), { to: 'string' })
//         //   );
//         //   followers = [...followers, ...nextFollowers];
//         //   if (!followerResponse.meta.next_token) {
//         //     this.followerPages = i + 1;
//         //     this.state.storage.put(
//         //       'followersRateLimit',
//         //       this.followersRateLimit
//         //     );
//         //     break;
//         //   }
//         //   paginationToken = followerResponse.meta.next_token;
//         // }
//         // for (const follower of followers) {
//         //   this.followers[follower.username] = follower;
//         // }
//       });
//     }
//   }

//   async initialize(): Promise<void> {
//     let followers: Follower[] = [];
//     for (let i = 0; i < 100; i++) {
//       const next: string | undefined = await this.state.storage.get(
//         `followers${i}`
//       );
//       if (!next) {
//         break;
//       }
//       followers = [...followers, ...JSON.parse(ungzip(next, { to: 'string' }))];
//       this.followerPages = i + 1;
//     }
//     followers = Array.from(new Set(followers));
//     for (const follower of followers) {
//       this.followers[follower.username] = follower;
//     }
//     this.followersRateLimit =
//       (await this.state.storage.get('followersRateLimit')) ?? [];
//   }

//   async fetch(request: Request): Promise<Response> {
//     console.log('TWITTER HANDLE REQ', JSON.stringify(request, undefined, 2));
//     if (!this.initializePromise) {
//       this.initializePromise = this.initialize().catch(err => {
//         this.initializePromise = undefined;
//         throw err;
//       });
//     }
//     await this.initializePromise;

//     return this.router.handle(request);
//   }
// }
